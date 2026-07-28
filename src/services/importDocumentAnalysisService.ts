import { supabase } from '../lib/supabase';
import type {
  ImportDocumentAnalysisResponse,
  ImportDocumentMeta,
  ImportDocumentType,
} from '../types/importTrade';

const TYPE_HINTS: Array<[RegExp, ImportDocumentType]> = [
  [/(commercial.?invoice|invoice|c[._ -]?i)/i, 'commercial_invoice'],
  [/(packing.?list|packing|p[._ -]?l)/i, 'packing_list'],
  [/(bill.?of.?lading|lading|b[._ -]?l)/i, 'bill_of_lading'],
];

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_SIZE = 25 * 1024 * 1024;

function resolveMimeType(file: File): string {
  if (ALLOWED_MIME_TYPES.has(file.type)) return file.type;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
  return file.type;
}

export async function classifyImportDocument(file: File): Promise<ImportDocumentType> {
  return TYPE_HINTS.find(([pattern]) => pattern.test(file.name))?.[1] ?? 'unknown';
}

function readFileAsDataUrl(file: File, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`${file.name} 파일을 읽지 못했습니다.`));
        return;
      }
      resolve(`data:${mimeType};base64,${reader.result.slice(reader.result.indexOf(',') + 1)}`);
    };
    reader.onerror = () => reject(new Error(`${file.name} 파일을 읽는 중 오류가 발생했습니다.`));
    reader.readAsDataURL(file);
  });
}

export async function analyzeImportDocuments(
  documents: ImportDocumentMeta[],
  filesById: Record<string, File>,
): Promise<ImportDocumentAnalysisResponse> {
  if (documents.length === 0) throw new Error('분석할 파일을 먼저 업로드해 주세요.');

  const files = documents.map((document) => {
    const file = filesById[document.id];
    if (!file) throw new Error(`${document.name} 원본 파일이 없습니다. 새로고침했다면 파일을 다시 선택해 주세요.`);
    const mimeType = resolveMimeType(file);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error(`${file.name}은 지원하지 않는 파일 형식입니다.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name}은 10MB를 초과합니다.`);
    return { document, file, mimeType };
  });

  if (files.reduce((total, item) => total + item.file.size, 0) > MAX_TOTAL_SIZE) {
    throw new Error('분석할 파일의 전체 크기는 25MB 이하여야 합니다.');
  }

  const payload = await Promise.all(files.map(async ({ document, file, mimeType }) => ({
    id: document.id,
    fileName: file.name,
    mimeType,
    documentType: document.type,
    dataUrl: await readFileAsDataUrl(file, mimeType),
  })));

  const { data, error } = await supabase.functions.invoke('import-document-analysis', {
    body: { documents: payload },
  });

  if (error) throw new Error(`AI 문서 분석 요청에 실패했습니다: ${error.message}`);
  if (!data?.success || !data?.analysis) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'AI 문서 분석 응답이 올바르지 않습니다.');
  }

  return {
    analysis: data.analysis,
    classifications: Array.isArray(data.classifications) ? data.classifications : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    source: 'openai',
    model: typeof data.model === 'string' ? data.model : 'unknown',
  };
}
