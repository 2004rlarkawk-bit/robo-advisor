import { describe, expect, it } from 'vitest';
import { classifyImportDocumentName } from './importDocumentAnalysisService';
import type { ImportDocumentType } from '../types/importTrade';

const cases: Array<[ImportDocumentType, string[]]> = [
  ['commercial_invoice', [
    '상업송장.pdf', '상업 송장.pdf', '상업송장서.pdf', '인보이스.pdf',
    'Commercial Invoice.pdf', 'Invoice.pdf', 'C-I.pdf', 'CI.pdf',
  ]],
  ['packing_list', [
    '포장명세서.pdf', '포장 명세서.pdf', '포장내역서.pdf', '포장 내역서.pdf',
    '포장목록.pdf', '포장 목록.pdf', 'Packing List.pdf', 'P-L.pdf', 'PL.pdf',
    '패킹리스트.pdf', '패킹 리스트.pdf', '팩킹리스트.pdf', '패킹명세서.pdf',
  ]],
  ['bill_of_lading', [
    '선하증권.pdf', '선하 증권.pdf', '선하증권서.pdf', '해상선하증권.pdf',
    '해상 선하증권.pdf', 'Bill of Lading.pdf', 'B-L.pdf', 'BL.pdf',
  ]],
  ['certificate_of_origin', [
    '원산지증명서.pdf', '원산지 증명서.pdf', '원산지증명.pdf', '원산지 증명.pdf',
    'Certificate of Origin.pdf', 'C-O.pdf', 'CO.pdf',
  ]],
  ['transport_request', [
    '수출운송의뢰서.pdf', '운송 의뢰서.pdf', '선적의뢰서.pdf', '선적 요청.pdf',
    'Shipping Request.pdf', 'Shipping Instruction.pdf', 'Shipping Order.pdf',
    'Export Transport Request.pdf', 'T-R.pdf', 'S-I.pdf',
  ]],
];

describe('수출입 첨부 문서 파일명 자동분류', () => {
  it.each(cases.flatMap(([type, names]) => names.map((name) => [name, type] as const)))(
    '%s를 %s로 분류한다',
    (fileName, expected) => {
      expect(classifyImportDocumentName(fileName)).toBe(expected);
    },
  );

  it('공백·구분자·대소문자와 날짜 접미사를 정규화한다', () => {
    expect(classifyImportDocumentName('20260814_EXPORT_commercial.invoice_01.PDF'))
      .toBe('commercial_invoice');
    expect(classifyImportDocumentName('03_EXPORT_FIXED_Bill_of_Lading_final.pdf'))
      .toBe('bill_of_lading');
  });

  it('약한 키워드는 독립된 파일명 토큰일 때만 힌트로 사용한다', () => {
    expect(classifyImportDocumentName('수출_송장_20260814.pdf')).toBe('commercial_invoice');
    expect(classifyImportDocumentName('invoice_20260814.pdf')).toBe('commercial_invoice');
    expect(classifyImportDocumentName('배송송장처리내역.pdf')).toBe('other');
    expect(classifyImportDocumentName('shipping_manifest.pdf')).toBe('other');
    expect(classifyImportDocumentName('포장재_구매목록.pdf')).toBe('other');
  });

  it('괄호로 묶인 약어도 해당 서류로 분류한다', () => {
    // 실제 업로드 사례: 전각 솔리드스(／)를 포함한 괄호 표기
    expect(classifyImportDocumentName('패킹리스트(P／L).pdf')).toBe('packing_list');
    expect(classifyImportDocumentName('상업송장(C／I).pdf')).toBe('commercial_invoice');
    expect(classifyImportDocumentName('선하증권(B／L).pdf')).toBe('bill_of_lading');
    expect(classifyImportDocumentName('[P/L] 2026.pdf')).toBe('packing_list');
    expect(classifyImportDocumentName('원산지증명서(C/O).pdf')).toBe('certificate_of_origin');
  });

  it('세금계산서와 견적송장은 Commercial Invoice로 확정하지 않는다', () => {
    expect(classifyImportDocumentName('tax_invoice_20260814.pdf')).toBe('other');
    expect(classifyImportDocumentName('견적송장.pdf')).toBe('other');
    expect(classifyImportDocumentName('proforma_invoice.pdf')).toBe('other');
  });
});
