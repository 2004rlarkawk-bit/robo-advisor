import { describe, expect, it } from 'vitest';
import { buildDeclarationChecklist } from './ImportDeclarationChecklist';
import type { ImportExtractedFields } from '../../types/importTrade';

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

const rowOf = (rows: ReturnType<typeof buildDeclarationChecklist>, key: string) => rows.find((row) => row.key === key)!;

describe('수입신고 준비 현황 체크리스트', () => {
  it('신고서에 들어갈 항목과 현재 값을 보여준다', () => {
    const rows = buildDeclarationChecklist(fields());
    expect(rows.map((row) => row.label)).toEqual(['품명', '수량', '금액', '중량', '원산지', '거래조건', 'HSK']);
    expect(rowOf(rows, 'quantity').value).toBe('100 EA');
    expect(rowOf(rows, 'amount').value).toBe('USD 25,000');
    expect(rowOf(rows, 'weight').value).toBe('총 550 KG · 순 500 KG');
    expect(rows.every((row) => row.status === 'ready')).toBe(true);
  });

  it('값이 없으면 미입력으로 본다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: '' }));
    expect(rowOf(rows, 'incoterms').status).toBe('missing');
  });

  it('값이 채워져 있으면 서류끼리 달라도 준비됨으로 둔다 — 불일치는 여기서 판정하지 않는다', () => {
    const rows = buildDeclarationChecklist(fields());
    expect(rowOf(rows, 'quantity').status).toBe('ready');
    expect(rowOf(rows, 'weight').status).toBe('ready');
    // '확인 필요' 상태 자체가 없어졌다.
    expect(rows.some((row) => (row.status as string) === 'check')).toBe(false);
  });

  it('HSK가 비어 있으면 미입력으로만 표시한다', () => {
    const rows = buildDeclarationChecklist(
      fields({ items: [{ id: 'i1', description: 'CASHMERE COATS', quantity: '100', quantityUnit: 'EA', originCountry: 'KR', confirmedHSCode: '' }] } as Partial<ImportExtractedFields>),
    );
    expect(rowOf(rows, 'hsk').status).toBe('missing');
    expect(rowOf(rows, 'hsk').value).toBe('');
  });
});

describe('거래조건 표기 정리', () => {
  it('점·공백만 다른 값은 표기를 정리해 그대로 쓴다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: 'F.O.B BUSAN' } as Partial<ImportExtractedFields>));
    expect(rowOf(rows, 'incoterms').value).toBe('FOB BUSAN');
    expect(rowOf(rows, 'incoterms').status).toBe('ready');
  });

  it('표준 11종이 아니어도 값이 있으면 준비됨으로 둔다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: 'FOP BUSAN' } as Partial<ImportExtractedFields>));
    expect(rowOf(rows, 'incoterms').status).toBe('ready');
  });

  it('모든 항목이 채워지면 7/7 준비됨이다', () => {
    const rows = buildDeclarationChecklist(fields({ incoterms: 'C.I.F. LOS ANGELES' } as Partial<ImportExtractedFields>));
    expect(rows.filter((row) => row.status === 'ready')).toHaveLength(7);
    expect(rowOf(rows, 'incoterms').value).toBe('CIF LOS ANGELES');
  });
});
