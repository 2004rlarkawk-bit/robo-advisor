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
  HSCodeItemDetails,
  HSCodeSuggestionResponse,
  VerifiedHSCodeSuggestion,
} from '../types/hsCodeSuggestion';

const LOCAL_CANDIDATE_LIMIT = 30;
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
      koreanName: result.ko,
      englishName: result.en,
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
  debugItemId?: string
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
        koreanName: result.ko,
        englishName: result.en,
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
    LOCAL_CANDIDATE_LIMIT
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

export async function recommendShipperHSCode(
  itemName: string,
  itemDetails?: HSCodeItemDetails,
  debugItemId?: string
): Promise<HSCodeSuggestionResponse> {
  const normalizedItemName = itemName.trim();
  if (normalizedItemName.length < 3) {
    return {
      suggestions: [],
      additionalInformationRequired: false,
      requiredAdditionalInfo: [],
    };
  }

  const initialCandidateCodes =
    await buildCandidateContext(
      normalizedItemName,
      debugItemId
    );
  const discovery = await discoverHSCodePrefixes(
    normalizedItemName,
    initialCandidateCodes,
    itemDetails
  );
  const officialNamePrefixes = inferOfficialNamePrefixes(
    normalizedItemName,
    initialCandidateCodes
  );
  const discoveryPrefixes = Array.from(new Set([
    ...discovery.suggestedPrefixes,
    ...officialNamePrefixes,
  ])).slice(0, 5);
  const candidateCodes = await expandCandidateContext(
    initialCandidateCodes,
    discoveryPrefixes,
    debugItemId
  );
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
      confidenceLabel: confidenceLabel!,
      distinguishingFactors:
        suggestion.distinguishingFactors ?? [],
      missingInformation:
        suggestion.missingInformation ?? [],
      source: 'openai-verified',
    });

    if (verified.size >= DISPLAY_SUGGESTION_LIMIT) break;
  }

  const suggestions = Array.from(verified.values());
  if (import.meta.env.DEV) {
    console.debug(
      `[HS Suggest][${debugItemId ?? 'unknown'}] final:`,
      suggestions.length
    );
  }
  return {
    suggestions,
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
