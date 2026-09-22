// 신고가격(FOB) 빈칸이 실제 DOCX 생성 과정에서 0원·NaN으로 바뀌지 않는지 템플릿을 채워 확인한다.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExportDeclarationDocx } from './exportDeclarationDocxService';
import type { CustomsDeclarationData } from '../types';

const template = readFileSync(resolve(__dirname, '../../templates/export_declaration_template.docx'));

afterEach(() => { vi.unstubAllGlobals(); });

const data = (o: Partial<CustomsDeclarationData>): CustomsDeclarationData => ({
  declarationNo: 'CD-1', declarationDate: '2026-09-17', tradeType: 'export',
  exporter: { name: 'EXPORTER CO', address: 'BUSAN', contact: '' },
  importer: { name: 'BUYER CO', address: 'LA', contact: '' },
  itemName: 'COTTON SHIRT', hsCode: '6105.10', quantity: 100, unit: 'PCS', weight: 100,
  currency: 'USD', invoiceAmount: 10000, incoterms: 'CIF', loadPort: 'BUSAN', dischargePort: 'LOS ANGELES',
  countryOfOrigin: 'KOREA', fobRate: 1300,
  items: [{ description: 'COTTON SHIRT', hsCode: '6105.10', quantity: 100, unit: 'PCS', unitPrice: 100, netWeight: 90, grossWeight: 100, measurement: '1 CBM', packageCount: 10, packageUnit: 'CTNS' }],
  ...o,
});

async function documentXml(cd: CustomsDeclarationData): Promise<string> {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(template)));
  const blob = await buildExportDeclarationDocx(cd);
  const zip = new PizZip(await blob.arrayBuffer());
  return zip.file('word/document.xml')!.asText().replace(/<[^>]+>/g, '');
}

describe('수출신고서 DOCX — 신고가격(FOB) 빈칸', () => {
  it('CIF·환율 누락은 신고가격 금액 없이 생성되고 0원·NaN·미치환 표식이 남지 않는다', async () => {
    for (const cd of [data({ incoterms: 'CIF' }), data({ incoterms: 'FOB', fobRate: null })]) {
      const text = await documentXml(cd);
      expect(text).not.toContain('13,000,000');
      expect(text).not.toMatch(/₩\s?0(?![\d,])|NaN|\{\{/);
      expect(text).toContain('USD 10,000'); // 결제금액은 그대로
    }
  });

  it('FOB·환율이 있으면 신고가격이 채워진다', async () => {
    const text = await documentXml(data({ incoterms: 'FOB' }));
    expect(text).toContain('13,000,000');
  });
});
