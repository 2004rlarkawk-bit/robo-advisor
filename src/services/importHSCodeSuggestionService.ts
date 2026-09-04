import { discoverHSCodePrefixes, suggestHSCodeFromCandidates } from './claudeService';
import {
  findTenDigitHSKByPrefix,
  isOfficialTenDigitHSK,
  lookupHSByCode,
  searchHSByKeyword,
  type HSDataEntry,
} from './hsDataService';
import type { ImportHSCodeSuggestion, ImportItem } from '../types/importTrade';
import type { HSCodeCandidateContext, HSCodeItemDetails } from '../types/hsCodeSuggestion';

const CANDIDATE_LIMIT = 30;
const DISPLAY_LIMIT = 3;
export const INVALID_IMPORT_HSK_MESSAGE =
  '대한민국 HSK 10자리 코드가 아니거나 현재 관세청 HSK 목록에 존재하지 않는 코드입니다.';

export interface ImportHSKRecommendationResult {
  suggestions: ImportHSCodeSuggestion[];
  requiredAdditionalInfo: string[];
}

export interface ImportHSKValidationResult {
  valid: boolean;
  normalizedCode: string;
  error: string;
}

export function normalizeDocumentHSCode(value: string): string {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 6 ? digits.slice(0, 6) : '';
}

function candidateContext(entry: HSDataEntry): HSCodeCandidateContext {
  return {
    code: entry.code,
    koreanName: entry.ko,
    englishName: entry.en,
    ...(entry.category ? { classificationName: entry.category } : {}),
  };
}

function itemDetails(item: ImportItem): HSCodeItemDetails {
  return {
    material: item.material,
    composition: item.composition,
    fabricConstruction: item.fabricConstruction,
    intendedUse: item.intendedUse,
    productForm: item.productForm,
    processingState: item.processingState,
    gender: item.gender,
    koreanDescription: item.koreanDescription,
    modelName: item.modelName,
    specification: item.specification,
    originCountry: item.originCountry,
    documentHSCode: item.documentHSCode,
  };
}

function itemSummary(item: ImportItem): string {
  return [
    item.description,
    item.koreanDescription,
    item.material,
    item.composition,
    item.fabricConstruction,
    item.productForm,
    item.processingState,
    item.gender,
    item.intendedUse,
    item.modelName,
    item.specification,
  ].map((value) => value.trim()).filter(Boolean).join(' · ');
}

async function searchProductCandidates(item: ImportItem): Promise<HSCodeCandidateContext[]> {
  const queries = Array.from(new Set([
    item.description,
    item.koreanDescription,
    item.productForm,
    item.intendedUse,
    [item.material, item.composition].filter(Boolean).join(' '),
    [item.modelName, item.specification].filter(Boolean).join(' '),
  ].map((value) => value.trim()).filter((value) => value.length >= 2)));
  const groups = await Promise.all(queries.map((query) => searchHSByKeyword(query, 16)));
  const ranked = new Map<string, { entry: HSDataEntry; score: number; hits: number }>();
  for (const results of groups) {
    for (const result of results) {
      if (!/^\d{10}$/.test(result.code)) continue;
      const current = ranked.get(result.code);
      ranked.set(result.code, {
        entry: result,
        score: Math.max(current?.score ?? 0, result.score),
        hits: (current?.hits ?? 0) + 1,
      });
    }
  }
  return Array.from(ranked.values())
    .sort((a, b) => b.hits - a.hits || b.score - a.score || a.entry.code.localeCompare(b.entry.code))
    .slice(0, CANDIDATE_LIMIT)
    .map(({ entry }) => candidateContext(entry));
}

function isClearDocumentConflict(
  documentPrefix: string,
  productCandidates: HSCodeCandidateContext[],
): boolean {
  const sample = productCandidates.slice(0, 12);
  if (!documentPrefix || sample.length < 3 || sample.some(({ code }) => code.startsWith(documentPrefix))) return false;
  const headingCounts = new Map<string, number>();
  for (const { code } of sample) {
    const heading = code.slice(0, 4);
    headingCounts.set(heading, (headingCounts.get(heading) ?? 0) + 1);
  }
  const strongest = Math.max(0, ...headingCounts.values());
  return strongest >= 3 && strongest / sample.length >= 0.6
    && !headingCounts.has(documentPrefix.slice(0, 4));
}

function mergeCandidates(...groups: HSCodeCandidateContext[][]): HSCodeCandidateContext[] {
  const merged = new Map<string, HSCodeCandidateContext>();
  for (const group of groups) {
    for (const candidate of group) {
      if (/^\d{10}$/.test(candidate.code) && !merged.has(candidate.code)) merged.set(candidate.code, candidate);
      if (merged.size >= CANDIDATE_LIMIT) return Array.from(merged.values());
    }
  }
  return Array.from(merged.values());
}

async function retainOfficialCandidates(
  candidates: HSCodeCandidateContext[],
): Promise<HSCodeCandidateContext[]> {
  const verified = await Promise.all(candidates.map(async ({ code }) => {
    const official = await lookupHSByCode(code);
    return official?.code === code ? candidateContext(official) : null;
  }));
  return verified.filter((candidate): candidate is HSCodeCandidateContext => candidate !== null);
}

function inferredMissingInformation(item: ImportItem, candidates: HSCodeCandidateContext[]): string[] {
  const missing: string[] = [];
  if (candidates.some(({ code }) => /^(61|62)/.test(code))) {
    if (!item.fabricConstruction) missing.push('직물/편물 여부');
    if (!item.composition) missing.push('정확한 섬유 성분비');
    if (!item.gender) missing.push('성별 또는 연령 구분');
  }
  if (!item.productForm) missing.push('제품 형태');
  if (!item.intendedUse) missing.push('구체적인 용도');
  return missing.slice(0, 6);
}

async function verifiedSuggestions(
  item: ImportItem,
  candidates: HSCodeCandidateContext[],
): Promise<ImportHSKRecommendationResult> {
  const allowedCodes = new Set(candidates.map(({ code }) => code));
  const summary = itemSummary(item) || item.description || item.koreanDescription || '품목 정보 미확인';
  try {
    const decision = await suggestHSCodeFromCandidates(summary, candidates, itemDetails(item), item.id);
    const commonMissing = Array.from(new Set([
      ...decision.requiredAdditionalInfo,
      ...inferredMissingInformation(item, candidates),
    ])).slice(0, 6);
    const suggestions: ImportHSCodeSuggestion[] = [];
    for (const ranked of decision.suggestions) {
      const code = ranked.code.replace(/[^0-9]/g, '');
      if (!allowedCodes.has(code)) continue;
      const official = await lookupHSByCode(code);
      if (!official || official.code !== code) continue;
      suggestions.push({
        itemId: item.id,
        code,
        description: official.ko,
        reasoning: ranked.reasoning,
        confidence: ['높음', 'high'].includes(ranked.confidence.trim().toLowerCase()) ? 0.85 : 0.65,
        missingInformation: Array.from(new Set([
          ...(ranked.missingInformation ?? []),
          ...commonMissing,
        ])).slice(0, 6),
        source: 'official_hsk_ai_ranked',
      });
      if (suggestions.length >= DISPLAY_LIMIT) break;
    }
    if (suggestions.length > 0) return { suggestions, requiredAdditionalInfo: commonMissing };
  } catch (error) {
    console.warn('[Import HSK Suggest] AI 순위 판단 실패, 공식 후보를 그대로 표시합니다.', error);
  }

  const requiredAdditionalInfo = inferredMissingInformation(item, candidates);
  return {
    suggestions: candidates.slice(0, DISPLAY_LIMIT).map((candidate) => ({
      itemId: item.id,
      code: candidate.code,
      description: candidate.koreanName,
      reasoning: '관세청 HSK 공식 후보이며, 문서의 상품정보를 추가 확인해 최종 선택해야 합니다.',
      confidence: 0.55,
      missingInformation: requiredAdditionalInfo,
      source: 'official_hsk_fallback',
    })),
    requiredAdditionalInfo,
  };
}

export async function recommendImportHSK(item: ImportItem): Promise<ImportHSKRecommendationResult> {
  const documentPrefix = normalizeDocumentHSCode(item.documentHSCode);
  const [documentEntries, productCandidates] = await Promise.all([
    documentPrefix ? findTenDigitHSKByPrefix(documentPrefix, CANDIDATE_LIMIT) : Promise.resolve([]),
    searchProductCandidates(item),
  ]);
  const documentCandidates = documentEntries.map(candidateContext);
  const conflict = isClearDocumentConflict(documentPrefix, productCandidates);
  let candidates = documentCandidates.length > 0 && !conflict ? documentCandidates : productCandidates;

  if (!documentPrefix || documentCandidates.length === 0 || conflict) {
    try {
      const discovery = await discoverHSCodePrefixes(itemSummary(item), productCandidates, itemDetails(item));
      const expanded = (await Promise.all(
        discovery.suggestedPrefixes.map((prefix) => findTenDigitHSKByPrefix(prefix, CANDIDATE_LIMIT)),
      )).flat().map(candidateContext);
      candidates = mergeCandidates(expanded, productCandidates, conflict ? documentCandidates : []);
    } catch (error) {
      console.warn('[Import HSK Suggest] 공식 후보 방향 탐색 실패, 문자열 검색 후보를 사용합니다.', error);
    }
  }

  candidates = await retainOfficialCandidates(mergeCandidates(candidates));
  if (candidates.length === 0) {
    return {
      suggestions: [],
      requiredAdditionalInfo: ['관세청 HSK 후보를 찾기 위한 구체적인 품명·재질·용도'],
    };
  }
  return verifiedSuggestions(item, candidates);
}

export async function recommendImportHSKForItems(items: ImportItem[]): Promise<ImportHSCodeSuggestion[]> {
  const results = await Promise.all(items.map((item) => recommendImportHSK(item)));
  return results.flatMap(({ suggestions }) => suggestions);
}

export async function validateOfficialImportHSK(input: string): Promise<ImportHSKValidationResult> {
  const permittedCharacters = /^[0-9\s.-]+$/.test(input.trim());
  const normalizedCode = input.replace(/[^0-9]/g, '');
  const valid = permittedCharacters
    && /^\d{10}$/.test(normalizedCode)
    && await isOfficialTenDigitHSK(normalizedCode);
  return { valid, normalizedCode, error: valid ? '' : INVALID_IMPORT_HSK_MESSAGE };
}
