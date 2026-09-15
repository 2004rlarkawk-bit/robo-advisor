import { describe, expect, it } from 'vitest';
import { duplicateImportDocumentsMessage, findDuplicateImportDocuments } from './importDocumentDuplicates';

describe('수입 서류 중복 업로드 차단', () => {
  it('상업송장·포장명세서가 2개 이상이면 중복으로 잡는다', () => {
    const duplicates = findDuplicateImportDocuments([
      { type: 'commercial_invoice' },
      { type: 'commercial_invoice' },
      { type: 'packing_list' },
      { type: 'packing_list' },
      { type: 'bill_of_lading' },
    ]);
    expect(duplicates.map((entry) => [entry.type, entry.count])).toEqual([
      ['commercial_invoice', 2],
      ['packing_list', 2],
    ]);
    expect(duplicateImportDocumentsMessage(duplicates)).toBe(
      '상업송장(Commercial Invoice) 2개, 포장명세서(Packing List) 2개가 올라가 있어 분석할 수 없습니다. 서류끼리 대조하려면 종류마다 1개만 필요하니, 중복된 파일은 삭제하고 다른 서류를 올려 주세요.',
    );
  });

  it('종류마다 1개씩이거나 기타서류가 여러 개인 것은 막지 않는다', () => {
    expect(findDuplicateImportDocuments([
      { type: 'commercial_invoice' },
      { type: 'packing_list' },
      { type: 'bill_of_lading' },
      { type: 'other' },
      { type: 'other' },
    ])).toEqual([]);
    expect(duplicateImportDocumentsMessage([])).toBe('');
  });
});
