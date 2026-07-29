import { describe, expect, it } from 'vitest';
import {
  normalizeImportExtractedFields,
  syncLegacyImportFields,
} from './importDocumentAnalysisService';
import {
  createImportDeclarationDocx,
  generateImportDeclarationHtml,
  generateImportDeclarationRequest,
} from './importDeclarationService';
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

  it('웹 미리보기와 PDF 원본 HTML이 같은 확정 데이터를 사용하고 여러 품목을 출력한다', () => {
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
    const html = generateImportDeclarationHtml({ fields, dutyError: '환율 API 조회 실패' });
    const text = generateImportDeclarationRequest({ fields, dutyError: '환율 API 조회 실패' });

    for (const value of ['CI-001', 'Cotton T-shirts', 'Kitchen tongs', '6109100000', '8215999000']) {
      expect(html).toContain(value);
      expect(text).toContain(value);
    }
    expect(html).toContain('계산 불가');
    expect(html).not.toContain('0원');
  });

  it('같은 의뢰서 데이터로 유효한 DOCX 다운로드 데이터를 만든다', async () => {
    const fields = normalizeImportExtractedFields({
      importerDetails: { name: 'ABC Korea' },
      invoiceNo: 'CI-002',
      items: [{ id: '1', description: 'Kitchen tongs', confirmedHSCode: '8215999000' }],
    });
    const docx = createImportDeclarationDocx({ fields });
    const docxHeader = new Uint8Array(await docx.arrayBuffer()).slice(0, 2);

    expect(Array.from(docxHeader)).toEqual([0x50, 0x4b]);
    expect(docx.type).toContain('wordprocessingml');
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
