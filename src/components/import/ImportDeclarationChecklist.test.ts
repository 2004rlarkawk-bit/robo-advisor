import { describe, expect, it } from 'vitest';
import { buildDeclarationChecklist } from './ImportDeclarationChecklist';
import type { ImportExtractedFields, ImportRisk } from '../../types/importTrade';

const fields = (overrides: Partial<ImportExtractedFields> = {}): ImportExtractedFields => ({
  currency: 'USD',
  totalAmount: '25,000',
  grossWeight: '550',
  grossWeightUnit: 'KG',
  netWeight: '500',
  netWeightUnit: 'KG',
  incoterms: 'FOB',
  items: [{ id: 'i1', description: 'CASHMERE COATS', quantity: '100', quantityUnit: 'EA', originCountry: 'KR', confirmedHSCode: '6202110000' }],
  ...overrides,
} as unknown as ImportExtractedFields);

const risk = (id: string, item: string, status: ImportRisk['status'] = 'unresolved'): ImportRisk => ({
  id, item, level: 'high', cause: `${item} 확인이 필요합니다.`, recommendation: '', relatedDocuments: [], status,
});

const rowOf = (rows: ReturnType<typeof buildDeclarationChecklist>, key: string) => rows.find((row) => row.key === key)!;

describe('수입신고 준비 현황 체크리스트', () => {
  it('신고서에 들어갈 항목과 현재 값을 보여준다', () => {
    const rows = buildDeclarationChecklist(fields(), []);
    expect(rows.map((row) => row.label)).toEqual(['품명', '수량', '금액', '중량', '원산지', '거래조건', 'HSK']);
    expect(rowOf(rows, 'quantity').value).toBe('100 EA');
    expect(rowOf(rows, 'amount').value).toBe('USD 25,000');
    expect(rowOf(rows, 'weight').value).toBe('총 550 KG · 순 500 KG');
    expect(rows.every((row) => row.status === 'ready')).toBe(true);
  });

  it('값이 없으면 미입력으로 본다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: '' }), []);
    expect(rowOf(rows, 'incoterms').status).toBe('missing');
  });

  it('서류 대사 규칙이 걸린 항목은 확인 필요로 바뀐다', () => {
    const rows = buildDeclarationChecklist(fields(), [risk('reconcile-IR2', '신고 수량 확정 필요')]);
    expect(rowOf(rows, 'quantity').status).toBe('check');
    expect(rowOf(rows, 'quantity').riskId).toBe('reconcile-IR2');
    expect(rowOf(rows, 'amount').status).toBe('ready');
  });

  it('AI 검증 제목만 있어도 같은 신고 항목으로 묶는다', () => {
    const rows = buildDeclarationChecklist(fields(), [risk('VAL-006', '총중량 불일치')]);
    expect(rowOf(rows, 'weight').status).toBe('check');
  });

  it('값을 이미 정한 항목은 준비됨으로 둔다', () => {
    const rows = buildDeclarationChecklist(fields(), [risk('reconcile-IR2', '신고 수량 확정 필요', 'resolved')]);
    expect(rowOf(rows, 'quantity').status).toBe('ready');
  });

  it('HSK 미확정은 HSK 줄에서 확인 필요로 잡는다', () => {
    const rows = buildDeclarationChecklist(
      fields({ items: [{ id: 'i1', description: 'CASHMERE COATS', quantity: '100', quantityUnit: 'EA', originCountry: 'KR', confirmedHSCode: '' }] } as Partial<ImportExtractedFields>),
      [risk('hs-i1', '품목 1 HS Code 미확정')],
    );
    expect(rowOf(rows, 'hsk').status).toBe('check');
    expect(rowOf(rows, 'hsk').value).toBe('');
  });
});

describe('거래조건 표기 정리', () => {
  it('점·공백만 다른 정상 값은 정리해서 준비됨으로 본다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: 'F.O.B BUSAN' } as Partial<ImportExtractedFields>), [
      risk('reconcile-IR9', 'Incoterms 유효'),
    ]);
    expect(rowOf(rows, 'incoterms').value).toBe('FOB BUSAN');
    expect(rowOf(rows, 'incoterms').status).toBe('ready');
  });

  it('표준 11종이 아니면 확인 필요로 남긴다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: 'FOP BUSAN' } as Partial<ImportExtractedFields>), [
      risk('reconcile-IR9', 'Incoterms 유효'),
    ]);
    expect(rowOf(rows, 'incoterms').status).toBe('check');
  });

  it('값이 비어 있으면 미입력이다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: '' } as Partial<ImportExtractedFields>), []);
    expect(rowOf(rows, 'incoterms').status).toBe('missing');
  });

  it('모든 항목이 정상이면 7/7 준비됨이다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: 'C.I.F. LOS ANGELES' } as Partial<ImportExtractedFields>), []);
    expect(rows.filter((row) => row.status === 'ready')).toHaveLength(7);
    expect(rowOf(rows, 'incoterms').value).toBe('CIF LOS ANGELES');
  });
});
