import { describe, expect, it } from 'vitest';
import { fillImporterFromConsignee, normalizeImportExtractedFields } from './importDocumentAnalysisService';

const consignee = { name: 'PORTAI TRADING CO., LTD.', address: '45, JUNGANG-DAERO, BUSAN, KOREA', country: 'KR', contactName: '', phone: '051-123-4567', email: '' };

describe('수입자(Importer) 비었을 때 Consignee로 채우기', () => {
  it('Importer가 비어 있으면 Consignee 정보를 그대로 가져온다', () => {
    const fields = normalizeImportExtractedFields({ consigneeDetails: consignee });
    const filled = fillImporterFromConsignee(fields);
    expect(filled.importerDetails).toEqual(consignee);
    expect(filled.importer).toBe('PORTAI TRADING CO., LTD.');
  });

  it('서류에서 찾은 Importer가 있으면 건드리지 않는다', () => {
    const fields = normalizeImportExtractedFields({
      consigneeDetails: consignee,
      importerDetails: { ...consignee, name: 'OTHER IMPORTER' },
    });
    expect(fillImporterFromConsignee(fields).importerDetails.name).toBe('OTHER IMPORTER');
  });

  it('Consignee가 지시식(TO ORDER)이면 채우지 않는다', () => {
    const fields = normalizeImportExtractedFields({ consigneeDetails: { ...consignee, name: 'TO ORDER OF KOOKMIN BANK' } });
    expect(fillImporterFromConsignee(fields).importerDetails.name).toBe('');
  });
});
