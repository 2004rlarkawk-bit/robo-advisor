import { describe, expect, it } from 'vitest';
import { evaluateHandoffReadiness, handoffDocumentLabel } from './importHandoffReadiness';
import type { ImportExtractedFields } from '../types/importTrade';

const fields = (overrides: Partial<ImportExtractedFields> = {}): ImportExtractedFields => ({
  blNo: 'HLCUBU12345',
  productDescription: 'CASHMERE COATS',
  totalAmount: '25,000',
  currency: 'USD',
  ...overrides,
} as unknown as ImportExtractedFields);

const allDocuments = ['commercial_invoice', 'packing_list', 'bill_of_lading'] as const;

describe('포워더 전달 준비 상태 — 존재 여부만 본다', () => {
  it('필수 서류와 신고 준비 정보가 모두 있으면 준비 완료다', () => {
    const readiness = evaluateHandoffReadiness({
      documentTypes: [...allDocuments],
      fields: fields(),
      confirmedHsCodes: ['6202110000'],
    });
    expect(readiness).toEqual({ missingDocuments: [], missingFields: [], ready: true });
  });

  it('필수 서류가 없으면 그 서류만 추가 필요로 집어낸다', () => {
    const readiness = evaluateHandoffReadiness({
      documentTypes: ['commercial_invoice'],
      fields: fields(),
    });
    expect(readiness.missingDocuments).toEqual(['packing_list', 'bill_of_lading']);
    expect(readiness.ready).toBe(false);
  });

  it('필수 서류가 아닌 자료(C/O 등)가 없어도 준비 완료를 막지 않는다', () => {
    const readiness = evaluateHandoffReadiness({
      documentTypes: [...allDocuments],
      fields: fields(),
    });
    expect(readiness.ready).toBe(true);
  });

  it('신고 준비 정보가 비어 있으면 그 항목을 알려준다', () => {
    const readiness = evaluateHandoffReadiness({
      documentTypes: [...allDocuments],
      fields: fields({ currency: '', blNo: '' }),
    });
    expect(readiness.missingFields).toEqual(['B/L 번호', '통화']);
    expect(readiness.ready).toBe(false);
  });

  it('HSK가 확정되지 않은 품목이 있으면 준비 완료로 보지 않는다', () => {
    const readiness = evaluateHandoffReadiness({
      documentTypes: [...allDocuments],
      fields: fields(),
      confirmedHsCodes: ['6202110000', ''],
    });
    expect(readiness.missingFields).toContain('품목별 HSK 확정');
    expect(readiness.ready).toBe(false);
  });

  it('DRAFT B/L처럼 값의 내용은 판정하지 않는다 — 값이 있으면 그대로 준비된 것으로 본다', () => {
    const readiness = evaluateHandoffReadiness({
      documentTypes: [...allDocuments],
      fields: fields({ blNo: 'DRAFT - NOT ISSUED' }),
      confirmedHsCodes: ['6202110000'],
    });
    expect(readiness.ready).toBe(true);
  });

  it('서류 라벨은 실무 표기로 보여준다', () => {
    expect(handoffDocumentLabel('commercial_invoice')).toBe('상업송장(C/I)');
    expect(handoffDocumentLabel('bill_of_lading')).toBe('선하증권(B/L)');
  });
});
