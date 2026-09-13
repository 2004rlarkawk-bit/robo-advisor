import {
  discoverHSCodePrefixes,
  suggestHSCodeFromCandidates,
} from './claudeService';
import {
  formatCode,
  lookupHSByCode,
  searchHSByKeyword,
} from './hsDataService';
import type {
  HSCodeCandidateContext,
  HSCodeDisambiguation,
  HSCodeDisambiguationOption,
  HSCodeItemDetails,
  HSCodeSuggestionResponse,
  VerifiedHSCodeSuggestion,
} from '../types/hsCodeSuggestion';

import {
  annotateApparelNames,
  apparelPrefixesForQuery,
  apparelScopeOf,
  composeApparelGoodsName,
} from './hsApparelNomenclature';

const LOCAL_CANDIDATE_LIMIT = 30;
/** 의류 후보 확장 상한 — 남성·여성·편물·가죽 호를 함께 담아야 한다. */
const APPAREL_CANDIDATE_LIMIT = 60;
const DISPLAY_SUGGESTION_LIMIT = 3;

export function normalizeHSKCode(code: string): string {
  return code.replace(/[\s.-]/g, '');
}

function isTenDigitHSK(code: string): boolean {
  return /^\d{10}$/.test(code);
}

function parseDisplayConfidence(
  confidence: string
): '높음' | '보통' | null {
  const normalized = confidence.trim().toLowerCase();
  if (['높음', 'high'].includes(normalized)) return '높음';
  if (['보통', 'medium', 'moderate'].includes(normalized)) {
    return '보통';
  }
  return null;
}

/**
 * 로컬 검색 결과는 최종 추천이 아니라 OpenAI가 비교할 공식 후보 풀로만 사용합니다.
 * search score는 후보 정렬에만 쓰이며 사용자에게 정확도나 confidence로 노출하지 않습니다.
 */
async function buildCandidateContext(
  itemName: string,
  debugItemId?: string
): Promise<HSCodeCandidateContext[]> {
  const phraseResults = await searchHSByKeyword(
    itemName,
    LOCAL_CANDIDATE_LIMIT
  );
  const tokens = Array.from(new Set(
    itemName
      .toLowerCase()
      .split(/\s+/)
      .map((token) =>
        token.replace(/^[^a-z0-9가-힣]+|[^a-z0-9가-힣]+$/g, '')
      )
      .filter((token) =>
        token.replace(/[^a-z0-9가-힣]/g, '').length >= 4
      )
  ));
  const tokenResultGroups = await Promise.all(
    tokens.map(async (token) => ({
      token,
      results: await searchHSByKeyword(token, 8),
    }))
  );
  tokenResultGroups.sort(
    (a, b) =>
      a.results.length - b.results.length ||
      b.token.length - a.token.length
  );
  const localResults = [
    ...tokenResultGroups.flatMap(({ results }) => results),
    ...phraseResults,
  ];
  if (import.meta.env.DEV) {
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] local raw:`,
      phraseResults.length,
      phraseResults.slice(0, 10).map((result) => ({
        code: result.code,
        length: result.code.length,
        searchScore: result.score,
      }))
    );
  }
  const seen = new Set<string>();
  const candidates: HSCodeCandidateContext[] = [];

  for (const result of localResults) {
    const code = normalizeHSKCode(result.code);
    if (!isTenDigitHSK(code) || seen.has(code)) continue;

    seen.add(code);
    candidates.push({
      code,
      ...annotateApparelNames(code, result.ko, result.en),
      ...(result.category
        ? { classificationName: result.category }
        : {}),
    });
    if (candidates.length >= LOCAL_CANDIDATE_LIMIT) break;
  }

  if (import.meta.env.DEV) {
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] local 10-digit:`,
      candidates.length
    );
  }

  return candidates;
}

async function expandCandidateContext(
  initialCandidates: HSCodeCandidateContext[],
  prefixes: string[],
  debugItemId?: string,
  limit = LOCAL_CANDIDATE_LIMIT
): Promise<HSCodeCandidateContext[]> {
  const expanded = new Map<string, HSCodeCandidateContext>();

  for (const prefix of prefixes) {
    const descendants = await searchHSByKeyword(
      prefix,
      LOCAL_CANDIDATE_LIMIT
    );
    for (const result of descendants) {
      const code = normalizeHSKCode(result.code);
      if (!isTenDigitHSK(code) || expanded.has(code)) continue;
      expanded.set(code, {
        code,
        ...annotateApparelNames(code, result.ko, result.en),
        ...(result.category
          ? { classificationName: result.category }
          : {}),
      });
    }
  }

  for (const candidate of initialCandidates) {
    if (!expanded.has(candidate.code)) {
      expanded.set(candidate.code, candidate);
    }
  }

  const candidates = Array.from(expanded.values()).slice(
    0,
    limit
  );
  if (import.meta.env.DEV) {
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] discovered 6-digit:`,
      prefixes
    );
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] expanded 10-digit:`,
      candidates.length
    );
  }
  return candidates;
}

function inferOfficialNamePrefixes(
  itemName: string,
  candidates: HSCodeCandidateContext[]
): string[] {
  const tokens = itemName
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9가-힣]/g, ''))
    .filter((token) => token.length >= 4);
  if (tokens.length === 0 || candidates.length === 0) return [];

  const searchable = candidates.map((candidate) => ({
    candidate,
    text: [
      candidate.koreanName,
      candidate.englishName,
      candidate.classificationName ?? '',
    ].join(' ').toLowerCase().replace(/[^a-z0-9가-힣]/g, ''),
  }));
  const frequencies = new Map<string, number>();
  for (const token of tokens) {
    frequencies.set(
      token,
      searchable.filter(({ text }) => text.includes(token)).length
    );
  }
  const rarityLimit = Math.max(
    2,
    Math.floor(candidates.length / 4)
  );

  return searchable
    .map(({ candidate, text }) => ({
      prefix: candidate.code.slice(0, 6),
      score: tokens.reduce((score, token) => {
        const frequency = frequencies.get(token) ?? 0;
        return (
          frequency > 0 &&
          frequency <= rarityLimit &&
          text.includes(token)
        )
          ? score + (1 / frequency)
          : score;
      }, 0),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .reduce<string[]>((prefixes, { prefix }) => {
      if (!prefixes.includes(prefix) && prefixes.length < 2) {
        prefixes.push(prefix);
      }
      return prefixes;
    }, []);
}


const DISAMBIGUATION_OPTION_LIMIT = 5;
/** 의류는 성별 × 소재 조합이라 선택지를 더 보여준다. */
const APPAREL_OPTION_LIMIT = 9;

/** 10자리 HSK에서 6자리 소호를 추출한다. */
export function subheadingOf(code: string): string {
  return normalizeHSKCode(code).slice(0, 6);
}

function formatSubheading(subheading: string): string {
  return `${subheading.slice(0, 4)}.${subheading.slice(4, 6)}`;
}

/** 품명에서 비교에 쓸 토큰(3자 이상)만 추린다. */
function distinguishingTokens(itemName: string): string[] {
  return Array.from(new Set(
    itemName
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter((token) => token.length >= 3)
  ));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 토큰이 공식 품명에 "단어로" 등장하는지 본다.
 * 영문은 단어 경계를 요구한다 — 그러지 않으면 pen 이 penicillin·Litopenaeus 에 걸린다.
 * 한글은 띄어쓰기 없이 붙는 경우가 많아 부분 일치를 허용한다.
 */
function containsToken(haystack: string, token: string): boolean {
  if (/^[a-z0-9]+$/.test(token)) {
    // 완전한 단어(영어 복수형 허용)만 인정한다.
    // pen → "ball point pens" 는 잡고, Pentafluoroethane·Penicillin 은 거른다.
    return new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(token)}(e?s)?([^a-z0-9]|$)`,
      'i'
    ).test(haystack);
  }
  return haystack.includes(token);
}

/** 입력 토큰이 공식 품명(국문+영문)에 몇 개나 등장하는지 센다. */
function officialNameMatchCount(
  tokens: string[],
  candidate: HSCodeCandidateContext
): number {
  const haystack = [
    candidate.koreanName,
    candidate.englishName,
    candidate.classificationName ?? '',
  ].join(' ').toLowerCase();
  // 관세청 표기가 "Ball point" 처럼 띄어져 있어도 "ballpoint" 입력과 맞도록
  // 공백을 지운 형태에서도 한 번 더 본다.
  const compactHaystack = haystack.replace(/[^a-z0-9가-힣]/g, '');
  return tokens.filter((token) => {
    if (containsToken(haystack, token)) return true;
    // 공백을 지운 형태의 부분일치는 짧은 토큰에서 오탐이 크다
    // (pen → Pentafluoroethane). 충분히 긴 토큰에만 허용한다.
    return token.length >= 6 && compactHaystack.includes(token);
  }).length;
}

/**
 * 입력 품명이 후보 소호들을 구분하지 못하면 선택지를 만든다.
 *
 * 예) "pen" 은 9608.10(볼펜)·9608.20(펠트펜)·9608.30(만년필)·9608.40(샤프)의
 *     공식 품명에 모두 등장하므로 어느 하나를 고를 근거가 없다 → 질문.
 *     "ballpoint pen" 은 9608.10에만 단독으로 걸리므로 → 바로 추천.
 *
 * 관세청 데이터만으로 판정하므로 외부 호출이 없고 결과가 항상 동일하다.
 */
/** 공백·기호 제거 + 영어 복수형 제거. "Ball point pens" → "ballpointpen" */
function compactName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, '')
    .replace(/(e?s)$/, '');
}

/**
 * "내연기관용 오일여과기"처럼 다른 제품에 딸린 부속·부분품인지 본다.
 * 검색어가 용도 수식어에만 걸린 항목을 선택지로 내밀면
 * engine → 오일여과기(8421) 같은 엉뚱한 질문이 된다.
 */
function looksLikeAccessory(candidate: HSCodeCandidateContext): boolean {
  const ko = candidate.koreanName;
  const en = candidate.englishName.toLowerCase();
  return /용\s|의\s것|부분품|부속품/.test(ko)
    || /\bfor\b|\bparts of\b|\bsuitable for\b/.test(en);
}

/** "기타", "그 밖의 것" 같은 라벨은 선택지로서 정보가 없다. */
function isMeaninglessLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed.length === 0
    || /^(기타|그 밖의( 것)?|그밖의( 것)?)$/.test(trimmed);
}

export function detectDisambiguation(
  itemName: string,
  candidates: HSCodeCandidateContext[]
): HSCodeDisambiguation | null {
  const tokens = distinguishingTokens(itemName);
  if (tokens.length === 0 || candidates.length === 0) return null;

  // 입력이 어느 공식 품명과 사실상 같으면 이미 충분히 구체적이다 → 되묻지 않는다.
  // 예) "ballpoint pen" 은 9608.10 "Ball point pens" 와 일치.
  const compactInput = compactName(itemName);
  if (compactInput.length >= 4) {
    const exact = candidates.some(
      (candidate) =>
        compactName(candidate.koreanName) === compactInput ||
        compactName(candidate.englishName) === compactInput
    );
    if (exact) return null;
  }

  type Group = {
    subheading: string;
    best: HSCodeCandidateContext;
    score: number;
    count: number;
  };
  const groups = new Map<string, Group>();

  for (const candidate of candidates) {
    const subheading = subheadingOf(candidate.code);
    if (subheading.length < 6) continue;
    const score = officialNameMatchCount(tokens, candidate);
    const existing = groups.get(subheading);
    if (!existing) {
      groups.set(subheading, { subheading, best: candidate, score, count: 1 });
      continue;
    }
    existing.count += 1;
    if (score > existing.score) {
      existing.score = score;
      existing.best = candidate;
    }
  }

  if (groups.size < 2) return null;

  const maxScore = Math.max(...Array.from(groups.values(), (g) => g.score));
  // 어느 소호도 입력과 겹치지 않으면 후보 자체가 빈약한 경우라 기존 흐름에 맡긴다.
  if (maxScore < 1) return null;

  // 토큰 하나만 우연히 겹친 후보군으로 되묻으면 엉뚱한 선택지가 나온다
  // ("washing machine" → 반도체 제조기계). 검색어 전체가 공식 품명에 들어있는
  // 후보가 하나라도 있어야 이 후보군이 그 제품을 실제로 다룬다고 본다.
  const compactQuery = compactName(itemName);
  const mentionsQuery = (candidate: HSCodeCandidateContext) => {
    const name = `${candidate.koreanName} ${candidate.englishName}`
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, '');
    return compactQuery.length >= 3 && name.includes(compactQuery);
  };

  const tiedAll = Array.from(groups.values()).filter((g) => g.score === maxScore);
  // 한 소호만 최고점이면 입력이 후보를 구분한 것 → 질문하지 않는다.
  if (tiedAll.length < 2) return null;

  // 의류는 성별·소재가 서로 다른 호로 갈린다(6201 남성용 / 6202 여성용 / 4203 가죽).
  // 아래처럼 한 호로 좁히면 여성용·가죽 선택지가 사라지므로, 의류 후보끼리는 호를 합쳐 되묻는다.
  const apparelTied = tiedAll.filter((group) => apparelScopeOf(group.subheading) !== null);
  const isApparel = apparelTied.length >= 2;

  // 의류 품명은 "overcoat·raincoat·car-coat"처럼 검색어가 여러 번 들어가 점수가 부풀기 쉽다.
  // 동점만 남기면 "코트류"(가죽)처럼 한 번만 언급된 소호가 빠지므로, 의류는 검색어에
  // 걸린(score ≥ 1) 의류 소호를 모두 선택지로 올린다.
  let tied = isApparel
    ? Array.from(groups.values()).filter(
      (group) => group.score >= 1 && apparelScopeOf(group.subheading) !== null
    )
    : apparelTied;
  if (!isApparel) {
    // 서로 다른 호(4자리)가 섞이면 "pen → 페니실린" 같은 잡음이 선택지에 낀다.
    // 가장 많이 걸린 호 하나로 좁혀 같은 계열 안에서만 되묻는다.
    const headingCounts = new Map<string, number>();
    for (const group of tiedAll) {
      const heading = group.subheading.slice(0, 4);
      headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
    }
    const dominantHeading = Array.from(headingCounts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))[0][0];
    tied = tiedAll.filter(
      (group) => group.subheading.slice(0, 4) === dominantHeading
    );
  }
  if (tied.length < 2) return null;

  // 선택지로 내밀 소호 중 하나라도 검색어 전체를 품명에 담고 있어야 한다.
  // 토큰 하나만 겹친 경우로 되물으면 엉뚱한 선택지가 나온다
  // ("washing machine" → 반도체 제조기계 8486).
  if (!tied.some((group) => mentionsQuery(group.best))) return null;

  // 부속품·무의미 라벨은 선택지에서 제외한다.
  // 의류는 소호 기준(성별·소재)으로 라벨을 보여주므로 말단 품명 필터가 필요 없다.
  // ("그 밖의 방직용 섬유로 만든 것"이 부속품 패턴 "~용 "에 걸려 빠지는 문제 방지)
  const usable = isApparel
    ? tied
    : tied.filter(
      (group) => !looksLikeAccessory(group.best) && !isMeaninglessLabel(group.best.koreanName)
    );
  if (usable.length < 2) return null;

  const seenLabels = new Set<string>();
  const options: HSCodeDisambiguationOption[] = usable
    .sort((a, b) => isApparel
      // 의류는 호(성별)·소호(소재) 순으로 나열해 남성용·여성용이 묶여 보이게 한다.
      ? a.subheading.localeCompare(b.subheading)
      : (b.count - a.count) || a.subheading.localeCompare(b.subheading))
    .map((group) => {
      const scope = isApparel ? apparelScopeOf(group.subheading) : null;
      return {
        subheading: group.subheading,
        formattedSubheading: formatSubheading(group.subheading),
        // 의류는 공식 품명이 모두 같아 구분점(성별·소재)을 라벨로 쓴다.
        label: scope ? scope.shortKo : group.best.koreanName,
        // 고르면 이 값이 품명이 되므로 의류는 "Men's Wool Coat" 형태로 만든다.
        englishLabel: scope
          ? composeApparelGoodsName(group.subheading, itemName) ?? group.best.englishName
          : group.best.englishName,
        candidateCount: group.count,
      };
    })
    // 품명이 똑같은 소호는 선택지로 내밀어도 사용자가 고를 수 없다.
    .filter((option) => {
      const key = option.label.trim();
      if (!key || seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    })
    .slice(0, isApparel ? APPAREL_OPTION_LIMIT : DISAMBIGUATION_OPTION_LIMIT);

  // 서로 구분되는 선택지가 2개 미만이면 되묻는 의미가 없다.
  if (options.length < 2) return null;

  return {
    question: isApparel
      ? '정확한 HS CODE 분류를 위해 성별과 소재를 선택해 주세요.'
      : '정확한 HS CODE 분류를 위해 제품 종류를 선택해 주세요.',
    note: isApparel
      ? `의류는 품명이 같아도 성별·소재에 따라 HS Code가 달라집니다. "${itemName.trim()}"에 맞는 항목을 골라 주세요.`
      : `입력하신 "${itemName.trim()}"만으로는 관세청 품목 ${options.length}개가 모두 해당되어 하나로 좁힐 수 없습니다.`,
    options,
  };
}

export async function recommendShipperHSCode(
  itemName: string,
  itemDetails?: HSCodeItemDetails,
  debugItemId?: string,
  /** 사용자가 선택지에서 고른 6자리 소호. 있으면 그 범위로만 추천한다. */
  chosenSubheading?: string | null
): Promise<HSCodeSuggestionResponse> {
  const normalizedItemName = itemName.trim();
  if (normalizedItemName.length < 3) {
    return {
      suggestions: [],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
      disambiguation: null,
    };
  }

  const allCandidateCodes =
    await buildCandidateContext(
      normalizedItemName,
      debugItemId
    );

  // 사용자가 이미 종류를 골랐으면 그 소호 안에서만 후보를 본다.
  const initialCandidateCodes = chosenSubheading
    ? allCandidateCodes.filter(
        (candidate) => subheadingOf(candidate.code) === chosenSubheading
      )
    : allCandidateCodes;


  // 분류 방향 탐색에는 로컬 후보를 넘기지 않는다.
  //
  // HS 데이터가 말단 항목만 담고 있어 제품명이 "X용ㆍX의 것"(부분품) 쪽에만
  // 남아 있는 경우가 많다. 그 후보를 그대로 넘기면 LLM이 거기에 갇혀
  // refrigerator → 냉장고용 온도조절기, car → 차량용 의자처럼 엉뚱한 확신을 낸다.
  // 품명만 주면 8418ㆍ8450 같은 올바른 호를 answer 하거나, 모르면 추가 정보를 요구한다.
  // 로컬 후보는 아래 officialNamePrefixes 로 여전히 반영된다.
  //
  // 단, 사용자가 선택지에서 종류를 이미 골랐다면 방향은 정해진 것이므로
  // LLM에 다시 묻지 않는다(불필요한 지연 제거).
  const discovery = chosenSubheading
    ? {
      suggestedPrefixes: [chosenSubheading],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [] as string[],
    }
    : await discoverHSCodePrefixes(
      normalizedItemName,
      [],
      itemDetails
    );
  const officialNamePrefixes = chosenSubheading
    ? []
    : inferOfficialNamePrefixes(
      normalizedItemName,
      initialCandidateCodes
    );
  // 의류 품목 단어(jacket·coat 등)는 사전 품명에 없어서 검색으로 못 찾는 소호가 있다.
  // 보조표 색인으로 해당 소호를 끌어오고, 이 몫은 5개 상한과 따로 센다.
  const apparelPrefixes = chosenSubheading
    ? []
    : apparelPrefixesForQuery(normalizedItemName);
  const discoveryPrefixes = Array.from(new Set([
    ...apparelPrefixes,
    ...discovery.suggestedPrefixes,
    ...officialNamePrefixes,
  ])).slice(0, 5 + apparelPrefixes.length);
  const expandedCandidateCodes = await expandCandidateContext(
    initialCandidateCodes,
    discoveryPrefixes,
    debugItemId,
    // 의류는 성별·소재 조합으로 여러 호를 한꺼번에 끌어오므로 상한을 넉넉히 둔다.
    apparelPrefixes.length > 0 ? APPAREL_CANDIDATE_LIMIT : LOCAL_CANDIDATE_LIMIT
  );
  // 사용자가 고른 소호가 있으면 그 안에서만 추천한다.
  // 확장 과정에서 다른 소호가 다시 섞이면 선택이 무시된 것처럼 보인다.
  const candidateCodes = chosenSubheading
    ? expandedCandidateCodes.filter(
        (candidate) => subheadingOf(candidate.code) === chosenSubheading
      )
    : expandedCandidateCodes;
  if (import.meta.env.DEV) {
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] request:`,
      {
        action: 'suggest-hs-code',
        itemName: normalizedItemName,
        candidateCodes,
      }
    );
  }
  // 되묻기 판정은 LLM이 분류 방향을 잡아 후보가 확장된 뒤에 한다.
  // 로컬 검색만 보고 판단하면 "engine" 이 오일여과기(8421), "bag" 이 종이자루(4819)로
  // 갈리는 등 엉뚱한 선택지가 나온다.
  if (!chosenSubheading && !itemDetails) {
    const disambiguation = detectDisambiguation(
      normalizedItemName,
      candidateCodes
    );
    if (disambiguation) {
      if (import.meta.env.DEV) {
        console.debug(
          `[HS Suggest][${debugItemId ?? 'unknown'}] disambiguation:`,
          disambiguation.options.map((option) => option.formattedSubheading)
        );
      }
      return {
        suggestions: [],
        additionalInformationRequired: true,
        requiredAdditionalInfo: discovery.requiredAdditionalInfo,
        disambiguation,
      };
    }
  }

  const decision = debugItemId
    ? await suggestHSCodeFromCandidates(
        normalizedItemName,
        candidateCodes,
        itemDetails,
        debugItemId
      )
    : await suggestHSCodeFromCandidates(
        normalizedItemName,
        candidateCodes,
        itemDetails
      );

  // 판정 근거가 부족하다는 신호. 추천을 내더라도 확신 표시는 낮춘다.
  const needsMoreInfo =
    decision.additionalInformationRequired ||
    discovery.additionalInformationRequired;

  const allowedCodes = new Set(
    candidateCodes.map((candidate) => candidate.code)
  );
  const verified = new Map<string, VerifiedHSCodeSuggestion>();

  for (const suggestion of decision.suggestions) {
    const code = normalizeHSKCode(suggestion.code);

    if (import.meta.env.DEV) {
      console.debug(
        `[HS Suggest][${debugItemId ?? 'unknown'}] normalized:`,
        { before: suggestion.code, after: code }
      );
      console.debug(
        `[HS Suggest][${debugItemId ?? 'unknown'}] confidence raw:`,
        suggestion.confidence
      );
    }

    let rejectedReason = '';
    const confidenceLabel = parseDisplayConfidence(
      suggestion.confidence
    );
    if (!isTenDigitHSK(code)) {
      rejectedReason = `not a 10-digit HSK (${code.length} digits)`;
    } else if (!allowedCodes.has(code)) {
      rejectedReason = 'not included in local candidateCodes';
    } else if (!confidenceLabel) {
      rejectedReason = 'OpenAI confidence is low or unsupported';
    } else if (verified.has(code)) {
      rejectedReason = 'duplicate code';
    }

    if (rejectedReason) {
      if (import.meta.env.DEV) {
        console.debug(
          `[HS Suggest][${debugItemId ?? 'unknown'}] rejected reason:`,
          rejectedReason
        );
      }
      continue;
    }

    const officialEntry = await lookupHSByCode(code);
    const lookupVerified =
      officialEntry !== null && officialEntry.code === code;
    if (import.meta.env.DEV) {
      console.debug(
        `[HS Suggest][${debugItemId ?? 'unknown'}] lookup verified:`,
        lookupVerified
      );
    }
    if (!lookupVerified || !officialEntry) {
      if (import.meta.env.DEV) {
        console.debug(
          `[HS Suggest][${debugItemId ?? 'unknown'}] rejected reason:`,
          'lookupHSByCode did not verify the exact code'
        );
      }
      continue;
    }

    verified.set(code, {
      code,
      formattedCode: formatCode(code),
      koreanName: officialEntry.ko,
      englishName: officialEntry.en,
      classificationName: officialEntry.category,
      reasoning: suggestion.reasoning,
      // 시스템 스스로 추가 정보가 필요하다고 판단한 상태에서는 '높음'을 주지 않는다.
      // (예: "pants" 는 재질·성별이 정해지지 않아 하나로 확정할 수 없다.)
      confidenceLabel: needsMoreInfo ? '보통' : confidenceLabel!,
      distinguishingFactors:
        suggestion.distinguishingFactors ?? [],
      missingInformation:
        suggestion.missingInformation ?? [],
      source: 'openai-verified',
    });

    if (verified.size >= DISPLAY_SUGGESTION_LIMIT) break;
  }

  // 방향이 불확실해도 추천 자체는 내보낸다.
  // 추천을 통째로 막으면 사용자가 다음 단계로 갈 수 없어 흐름이 끊긴다.
  // 대신 확신 표시를 '보통'으로 낮추고 확인 항목을 함께 노출해 경고한다.
  const suggestions = Array.from(verified.values());
  if (import.meta.env.DEV) {
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] final:`,
      suggestions.length
    );
  }
  return {
    suggestions,
    disambiguation: null,
    additionalInformationRequired:
      decision.additionalInformationRequired ||
      discovery.additionalInformationRequired ||
      suggestions.length === 0,
    requiredAdditionalInfo: Array.from(new Set([
      ...discovery.requiredAdditionalInfo,
      ...decision.requiredAdditionalInfo,
    ])).slice(0, 6),
  };
}
