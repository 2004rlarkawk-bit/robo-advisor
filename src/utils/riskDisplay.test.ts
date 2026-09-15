import { describe, expect, it } from 'vitest';
import type { ImportAnalysisResult, ImportDocumentMeta } from '../types/importTrade';
import { normalizeImportExtractedFields } from '../services/importDocumentAnalysisService';
import { assessImportRisks } from '../services/importRiskService';
import { cleanRiskTitle, displayRelatedDocuments } from './riskDisplay';

describe('확인 항목 표시 정리', () => {
  it('제목 앞 규칙 번호(IR8. 등)를 뗀다', () => {
    expect(cleanRiskTitle('IR8. HS CODE 유효')).toBe('HS CODE 유효');
    expect(cleanRiskTitle('품목 1 HS Code 미확정')).toBe('품목 1 HS Code 미확정');
  });

  it('관련 서류 칩에서 업로드 파일 내부 id는 빼고 중복은 합친다', () => {
    expect(displayRelatedDocuments([
      '34f7f52e-8a83-4194-b334-2a2d72f61a98',
      'Commercial Invoice',
      'Commercial Invoice',
      'Packing List',
    ])).toEqual(['Commercial Invoice', 'Packing List']);
  });

  it('HS Code 미확정 항목의 관련 서류를 파일 id가 아니라 문서 이름으로 만든다', () => {
    const doc = (id: string, type: ImportDocumentMeta['type']): ImportDocumentMeta => ({
      id, name: `${id}.pdf`, size: 1, mimeType: 'application/pdf', type, status: 'analyzed',
    });
    const documents = [doc('34f7f52e-8a83-4194-b334-2a2d72f61a98', 'commercial_invoice'), doc('a00d7e48-086e-45de-bd46-06d878ff3773', 'packing_list')];
    const fields = normalizeImportExtractedFields({
      items: [{ id: 'item-1', description: 'Coat', originCountry: 'China', confirmedHSCode: '', sourceDocumentIds: documents.map((d) => d.id) }],
    });
    const analysis = { extracted: fields, validations: [], comparison: [] } as unknown as ImportAnalysisResult;

    const hsRisk = assessImportRisks(documents, analysis).find((risk) => risk.id === 'hs-item-1');
    expect(hsRisk?.relatedDocuments).toEqual(['Commercial Invoice', 'Packing List']);
  });
});
