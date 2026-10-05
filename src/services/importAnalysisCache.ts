/**
 * 수입 서류 AI 분석 결과 캐시.
 *
 * 같은 파일 묶음(내용 해시가 같은 C/I·P/L·B/L 등)을 다시 올리면 서류 읽기(비전 LLM)와
 * HS 추천을 다시 돌리지 않고, 이 브라우저에서 앞서 받은 실제 분석 결과를 쓴다.
 * 결과는 그 파일로 실제 AI가 낸 값 그대로이고, 문서 id만 이번 업로드의 id로 바꿔 끼운다.
 *
 * 저장소는 localStorage(브라우저별)라 다른 브라우저·시크릿 창에서는 처음 한 번은 실제 분석을 한다.
 * 단, 시연용 스위트콘 서류 3장은 같은 방식으로 실제 AI가 분석한 결과를 importAnalysisSeed.json에
 * 담아 두어, 어느 브라우저에서든 첫 업로드부터 그 결과를 쓴다.
 */
import type {
  ImportDocumentAnalysisResponse,
  ImportDocumentMeta,
  ImportHSCodeSuggestion,
} from '../types/importTrade';
import seedEntry from './importAnalysisSeed.json';

const CACHE_PREFIX = 'portai:import-analysis-cache:v1:';

/** 캐시 키 → 함께 배포되는 분석 결과(시연용 스위트콘 서류). */
const SEEDED_ENTRIES: Record<string, ImportAnalysisCacheEntry> = {
  [seedEntry.key]: seedEntry as unknown as ImportAnalysisCacheEntry,
};

export interface ImportAnalysisCacheEntry {
  result: ImportDocumentAnalysisResponse;
  suggestions: ImportHSCodeSuggestion[];
  /** 파일 해시 → 분석 당시 문서 id. 다시 쓸 때 이번 업로드의 문서 id로 바꾸는 데 쓴다. */
  documentIdByHash: Record<string, string>;
  savedAt: string;
}

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 문서별 파일 내용 해시와 묶음 전체의 캐시 키. 해시를 못 구하면 null(캐시 사용 안 함). */
export async function computeImportAnalysisCacheKey(
  documents: ImportDocumentMeta[],
  filesById: Record<string, File>,
  role: string,
): Promise<{ key: string; hashById: Record<string, string> } | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const hashById: Record<string, string> = {};
    for (const document of documents) {
      const file = filesById[document.id];
      if (!file) return null;
      hashById[document.id] = await sha256Hex(await file.arrayBuffer());
    }
    const key = await sha256Hex([role, ...Object.values(hashById).sort()].join('|'));
    return { key, hashById };
  } catch {
    return null;
  }
}

/** 문자열 안의 옛 문서 id를 새 id로 바꾼다 — 분류·추출 출처·추천이 이번 업로드를 가리키게. */
function remapIds<T>(value: T, idMap: Record<string, string>): T {
  let text = JSON.stringify(value);
  for (const [oldId, newId] of Object.entries(idMap)) {
    if (oldId && oldId !== newId) text = text.split(oldId).join(newId);
  }
  return JSON.parse(text) as T;
}

export function loadImportAnalysisCache(
  key: string,
  hashById: Record<string, string>,
): { result: ImportDocumentAnalysisResponse; suggestions: ImportHSCodeSuggestion[] } | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_PREFIX + key);
    const entry = raw ? JSON.parse(raw) as ImportAnalysisCacheEntry : SEEDED_ENTRIES[key];
    if (!entry) return null;
    if (!entry?.result?.analysis || !Array.isArray(entry.suggestions)) return null;
    const idMap: Record<string, string> = {};
    for (const [newId, hash] of Object.entries(hashById)) {
      const oldId = entry.documentIdByHash?.[hash];
      if (!oldId) return null;
      idMap[oldId] = newId;
    }
    return { result: remapIds(entry.result, idMap), suggestions: remapIds(entry.suggestions, idMap) };
  } catch {
    return null;
  }
}

export function saveImportAnalysisCache(
  key: string,
  hashById: Record<string, string>,
  result: ImportDocumentAnalysisResponse,
  suggestions: ImportHSCodeSuggestion[],
): void {
  try {
    const documentIdByHash = Object.fromEntries(Object.entries(hashById).map(([id, hash]) => [hash, id]));
    const entry: ImportAnalysisCacheEntry = { result, suggestions, documentIdByHash, savedAt: new Date().toISOString() };
    globalThis.localStorage?.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // 저장 공간 부족 등 — 캐시는 없어도 분석은 정상 동작한다.
  }
}
