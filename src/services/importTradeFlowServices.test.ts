import { describe, expect, it } from 'vitest';
import {
  normalizeImportExtractedFields,
  syncLegacyImportFields,
} from './importDocumentAnalysisService';
import { readFileSync } from 'node:fs';
import PizZip from 'pizzip';
import { mapImportDeclarationToSchema } from './importDeclarationService';
import { assessImportRisks } from './importRiskService';

describe('수입 화주 문서 기반 흐름 서비스', () => {
  it('기존 단일 품목 초안을 구조화된 품목과 당사자로 마이그레이션한다', () => {
    const fields = normalizeImportExtractedFields({
      shipper: 'Overseas Exporter',
      importer: 'Korea Importer',
      consignee: 'Korea Consignee',
      productDescription: 'Stainless kitchen tongs',
      quantity: '300',
      originCountry: 'China',
      containerNo: 'CONT1, CONT2',
    });

    expect(fields.exporterDetails.name).toBe('Overseas Exporter');
    expect(fields.importerDetails.name).toBe('Korea Importer');
    expect(fields.items).toHaveLength(1);
    expect(fields.items[0]).toMatchObject({
      description: 'Stainless kitchen tongs',
      quantity: '300',
      originCountry: 'China',
      confirmedHSCode: '',
    });
    expect(fields.containerNumbers).toEqual(['CONT1', 'CONT2']);
  });

  it('품목 수정값을 기존 저장 필드와 동기화하지만 HS 추천을 자동 확정하지 않는다', () => {
    const fields = normalizeImportExtractedFields({
      items: [{
        id: 'line-1',
        description: 'Cotton T-shirts',
        documentHSCode: '6109100000',
        confirmedHSCode: '',
        quantity: '10',
      }],
    });
    const synced = syncLegacyImportFields(fields);

    expect(synced.productDescription).toBe('Cotton T-shirts');
    expect(synced.items[0].documentHSCode).toBe('6109100000');
    expect(synced.items[0].confirmedHSCode).toBe('');
  });

  it('수입신고의뢰서 양식에 서류 값·품목 행·체크박스를 채운다', () => {
    const fields = normalizeImportExtractedFields({
      importerDetails: { name: 'ABC Korea' },
      exporterDetails: { name: 'ABC Trading' },
      invoiceNo: 'CI-001',
      currency: 'CNY',
      totalAmount: '300000',
      blNo: 'BL-001',
      items: [
        { id: '1', description: 'Cotton T-shirts', confirmedHSCode: '6109100000', originCountry: 'China', quantity: '100', quantityUnit: 'PCS' },
        { id: '2', description: 'Kitchen tongs', confirmedHSCode: '8215999000', originCountry: 'China', quantity: '200', quantityUnit: 'PCS' },
      ],
    });
    const schema = mapImportDeclarationToSchema({
      fields,
      dutyError: '환율 API 조회 실패',
      requestDate: new Date(2026, 8, 15),
      tradeId: 'trade-abc123',
      documents: [
        { id: 'd1', name: 'ci.pdf', size: 1, mimeType: 'application/pdf', type: 'commercial_invoice', status: 'analyzed' },
        { id: 'd2', name: 'bl.pdf', size: 1, mimeType: 'application/pdf', type: 'bill_of_lading', status: 'analyzed' },
      ],
    });

    expect(schema.request_no).toBe('20260915-C123');
    expect(schema.request_date).toBe('2026. 09. 15');
    expect(schema.items.map((item) => item.name)).toEqual(['Cotton T-shirts', 'Kitchen tongs']);
    expect(schema.items.map((item) => item.hs_code)).toEqual(['6109100000', '8215999000']);
    expect(schema.cb_att_ci).toBe('■');
    expect(schema.cb_att_bl).toBe('■');
    expect(schema.cb_att_pl).toBe('□');
    // 신고 구분·수입요건은 화주·관세사가 정하므로 체크하지 않는다.
    expect(schema.cb_decl_general).toBe('□');
    expect(schema.cb_req_none).toBe('□');
    expect(JSON.stringify(schema)).not.toContain('0원');
  });

  it('Incoterms는 FOB·CIF·CFR 외 조건을 기타로 표시하고 원산지증명서 유무로 FTA 칸을 고른다', () => {
    const base = normalizeImportExtractedFields({ incoterms: 'EXW Shanghai', items: [] });
    const exw = mapImportDeclarationToSchema({ fields: base });
    expect(exw.cb_inco_other).toBe('■');
    expect(exw.inco_other).toBe(' (EXW)');
    expect(exw.cb_fta_check).toBe('■');
    expect(exw.items).toHaveLength(1); // 품목이 없어도 빈 행 하나는 남긴다

    const cif = mapImportDeclarationToSchema({
      fields: normalizeImportExtractedFields({ incoterms: 'CIF', items: [] }),
      documents: [{ id: 'c', name: 'co.pdf', size: 1, mimeType: 'application/pdf', type: 'certificate_of_origin', status: 'analyzed' }],
    });
    expect(cif.cb_cif).toBe('■');
    expect(cif.cb_inco_other).toBe('□');
    expect(cif.cb_fta_apply).toBe('■');
    expect(cif.cb_fta_check).toBe('□');
  });

  it('템플릿의 모든 칸이 스키마와 1:1로 맞는다', () => {
    const xml = new PizZip(readFileSync('templates/import_declaration_request_template.docx')).file('word/document.xml')!.asText();
    const tags = new Set((xml.match(/\{\{[#/]?([a-z_]+)\}\}/g) ?? []).map((tag) => tag.replace(/[{}#/]/g, '')));
    const schema = mapImportDeclarationToSchema({ fields: normalizeImportExtractedFields({}) });
    const keys = new Set([...Object.keys(schema), ...Object.keys(schema.items[0])]);
    expect([...tags].filter((tag) => !keys.has(tag))).toEqual([]);
    expect([...keys].filter((key) => !tags.has(key))).toEqual([]);
    expect(xml).not.toContain('____');
  });

  it('필수 해상문서, 품목금액, 중량, HS 미확정과 API 실패를 구체적 리스크로 만든다', () => {
    const fields = normalizeImportExtractedFields({
      currency: 'CNY',
      totalAmount: '300000',
      grossWeight: '100',
      netWeight: '120',
      items: [
        { id: '1', description: 'Goods A', amount: '100000', originCountry: '', confirmedHSCode: '' },
        { id: '2', description: 'Goods B', amount: '100000', originCountry: 'China', confirmedHSCode: '' },
      ],
    });
    const risks = assessImportRisks(
      [{ id: 'ci', name: 'ci.pdf', size: 10, mimeType: 'application/pdf', type: 'commercial_invoice', status: 'analyzed' }],
      { extracted: fields, validations: [], comparison: [] },
      [],
      '환율 API 조회 실패: service unavailable',
    );

    expect(risks.map((risk) => risk.id)).toEqual(expect.arrayContaining([
      'missing-packing_list',
      'missing-bill_of_lading',
      'net-over-gross',
      'item-total-mismatch',
      'hs-1',
      'origin-1',
      'exchange-api-failed',
    ]));
    expect(risks.find((risk) => risk.id === 'net-over-gross')?.recommendation).toContain('Packing List');
  });
});
