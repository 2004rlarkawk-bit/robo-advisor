import { describe, expect, it } from 'vitest';
import { normalizeImportExtractedFields } from './importDocumentAnalysisService';

describe('수입 문서 품목 정규화', () => {
  it('서로 다른 문서에서 추출한 동일 품목을 하나로 병합한다', () => {
    const fields = normalizeImportExtractedFields({
      items: [
        {
          id: 'invoice-item',
          description: 'ITEM 1: CASHMERE COATS',
          quantity: '100',
          quantityUnit: 'EA',
          unitPrice: '250.00',
          currency: 'USD',
          amount: '25000.00',
          documentHSCode: '6202110000',
          sourceDocumentIds: ['invoice-id'],
        },
        {
          id: 'packing-item',
          description: 'CASHMERE COATS',
          originCountry: 'South Korea',
          netWeight: '450',
          grossWeight: '500',
          sourceDocumentIds: ['packing-id'],
        },
        {
          id: 'bl-item',
          description: 'ITEM 1 - CASHMERE COATS',
          packageCount: '10',
          packageUnit: 'CARTONS',
          sourceDocumentIds: ['bl-id'],
        },
      ],
    });

    expect(fields.items).toHaveLength(1);
    expect(fields.items[0]).toMatchObject({
      id: 'invoice-item',
      description: 'ITEM 1: CASHMERE COATS',
      amount: '25000.00',
      originCountry: 'South Korea',
      netWeight: '450',
      packageCount: '10',
    });
    expect(fields.items[0].sourceDocumentIds).toEqual(['invoice-id', 'packing-id', 'bl-id']);
  });

  it('같은 문서 안의 동일 품명 행은 별도 품목으로 유지한다', () => {
    const fields = normalizeImportExtractedFields({
      items: [
        { id: 'item-1', description: 'CASHMERE COATS', quantity: '50', sourceDocumentIds: ['invoice-id'] },
        { id: 'item-2', description: 'CASHMERE COATS', quantity: '50', sourceDocumentIds: ['invoice-id'] },
      ],
    });

    expect(fields.items).toHaveLength(2);
  });

  it('모델명이 다른 품목은 출처 문서가 달라도 병합하지 않는다', () => {
    const fields = normalizeImportExtractedFields({
      items: [
        { id: 'item-1', description: 'CASHMERE COATS', modelName: 'A', sourceDocumentIds: ['invoice-id'] },
        { id: 'item-2', description: 'CASHMERE COATS', modelName: 'B', sourceDocumentIds: ['packing-id'] },
      ],
    });

    expect(fields.items).toHaveLength(2);
  });
});
