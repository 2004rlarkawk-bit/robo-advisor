import { supabase } from '../lib/supabase';
import type { ImportComparisonRow, ImportDocumentType } from '../types/importTrade';

const REQUEST_DOCUMENTS: ImportDocumentType[] = [
  'commercial_invoice', 'packing_list', 'bill_of_lading', 'certificate_of_origin', 'other',
];

export interface InterpretedImportReturnRequest {
  comparisonFields: string[];
  documentTypes: string[];
}

const FIELD_ALIASES: Record<string, string[]> = {
  '수량': ['수량', 'quantity', 'qty'], quantity: ['수량', 'quantity', 'qty'],
  '품명': ['품명', '품목명', 'description'], productDescription: ['품명', '품목명', 'description'],
  '총중량': ['총중량', 'gross weight', 'g/w'], '총중량(G/W)': ['총중량', 'gross weight', 'g/w'], grossWeight: ['총중량', 'gross weight', 'g/w'],
  '순중량': ['순중량', 'net weight', 'n/w'], '순중량(N/W)': ['순중량', 'net weight', 'n/w'], netWeight: ['순중량', 'net weight', 'n/w'],
  '포장수': ['포장수', '포장 수량', '박스 수'], packageCount: ['포장수', '포장 수량', '박스 수'],
  '총액': ['총액', '총금액', 'invoice amount'], totalAmount: ['총액', '총금액', 'invoice amount'],
  '원산지': ['원산지', 'country of origin'], originCountry: ['원산지', 'country of origin'],
};
const DOCUMENT_ALIASES: Record<string, string[]> = {
  commercial_invoice: ['c/i', '상업송장', 'commercial invoice'],
  packing_list: ['p/l', '포장명세서', '패킹리스트', 'packing list'],
  bill_of_lading: ['b/l', '선하증권', 'bill of lading'],
  certificate_of_origin: ['c/o', '원산지증명서', 'certificate of origin'],
};

/** Edge Function 배포 전·장애 시에도 명시된 단어와 실제 불일치가 겹칠 때만 보수적으로 연결한다. */
export function conservativelyInterpretImportReturnRequest(note: string, rows: ImportComparisonRow[]): InterpretedImportReturnRequest {
  const text = note.toLowerCase();
  const candidates = returnRequestComparisonCandidates(rows);
  const comparisonFields = candidates
    .filter((candidate) => {
      if ((candidate.field === '수량' || candidate.field === 'quantity')
        && /포장\s*수량|박스\s*수/.test(text)
        && !/품목\s*수량|상품\s*수량|총\s*수량/.test(text)) return false;
      if ((candidate.field === '원산지' || candidate.field === 'originCountry')
        && /원산지증명서/.test(text)
        && !/원산지(?:가|값|표기|정보)/.test(text)) return false;
      return (FIELD_ALIASES[candidate.field] ?? [candidate.field]).some((alias) => text.includes(alias.toLowerCase()));
    })
    .map((candidate) => candidate.field);
  const asksForDocument = /누락|다시|재발행|수정본|재업로드|다른 파일|새 파일/i.test(note);
  const mentionedDocuments = asksForDocument
    ? Object.entries(DOCUMENT_ALIASES).filter(([, aliases]) => aliases.some((alias) => text.includes(alias.toLowerCase()))).map(([type]) => type)
    : [];
  // 여러 서류를 비교한 문장에서 어느 원본을 다시 발행해야 하는지는 결정할 수 없다.
  const documentTypes = mentionedDocuments.length === 1 ? mentionedDocuments : [];
  return { comparisonFields: [...new Set(comparisonFields)].slice(0, 5), documentTypes };
}

/** 실측·원본 값을 AI가 만들어 내지 않도록, 실제 서류 대사에 나타난 서로 다른 값만 후보로 보낸다. */
export function returnRequestComparisonCandidates(rows: ImportComparisonRow[]) {
  return rows.flatMap((row) => {
    if (row.matches) return [];
    const values = [
      { source: 'C/I', value: row.invoice },
      { source: 'P/L', value: row.packingList },
      { source: 'B/L', value: row.billOfLading },
      { source: 'C/O', value: row.certificateOfOrigin ?? '' },
    ].filter((entry) => entry.value?.trim() && entry.value.trim() !== '-');
    if (values.length < 2 || new Set(values.map((entry) => entry.value.trim().toLowerCase())).size < 2) return [];
    return [{ field: row.field, values }];
  });
}

/** 해석 실패 시 원문만 보내는 별도 선택지를 제공하며, AI의 제안은 전송 전에 포워더가 확인한다. */
export async function interpretImportReturnRequest(
  note: string,
  rows: ImportComparisonRow[],
): Promise<InterpretedImportReturnRequest> {
  const candidates = returnRequestComparisonCandidates(rows);
  try {
    const { data, error } = await supabase.functions.invoke('openai-assistant', {
      body: {
        action: 'interpret-import-return-request',
        note: note.trim(),
        comparisonCandidates: candidates,
        availableDocumentTypes: REQUEST_DOCUMENTS,
      },
    });
    if (error || !data || data.success !== true || data.action !== 'interpret-import-return-request') {
      return conservativelyInterpretImportReturnRequest(note, rows);
    }
    const allowedFields = new Set(candidates.map((candidate) => candidate.field));
    const allowedDocs = new Set<string>(REQUEST_DOCUMENTS);
    const returnedFields: unknown[] = Array.isArray(data.comparisonFields) ? data.comparisonFields : [];
    const returnedDocuments: unknown[] = Array.isArray(data.documentTypes) ? data.documentTypes : [];
    return {
      comparisonFields: [...new Set(returnedFields.filter((field): field is string => typeof field === 'string' && allowedFields.has(field)))],
      documentTypes: [...new Set(returnedDocuments.filter((type): type is string => typeof type === 'string' && allowedDocs.has(type)))],
    };
  } catch {
    return conservativelyInterpretImportReturnRequest(note, rows);
  }
}
