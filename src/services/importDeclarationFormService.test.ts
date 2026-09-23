import { describe, expect, it } from 'vitest';
import { mapImportDeclarationForm } from './importDeclarationFormService';
import { normalizeImportExtractedFields } from './importDocumentAnalysisService';
import type { ImportDutyEstimate } from '../types/importTrade';

const fields = (overrides: Record<string, unknown> = {}) => normalizeImportExtractedFields({
  blNo: 'KMTCSGN2609001',
  estimatedArrivalDate: '2026-09-12',
  importerDetails: { name: 'PORTAI TRADING CO., LTD.', address: '서울 강남구 테헤란로 123', phone: '02-1234-5678', email: 'trade@portai.com', contactName: '홍길동' },
  exporterDetails: { name: 'SAIGON HOMEWARE CO., LTD.' },
  dischargePort: 'BUSAN',
  vesselName: 'KMTC HOCHIMINH',
  grossWeight: '550',
  grossWeightUnit: 'KG',
  totalPackageCount: '50',
  packageUnit: 'CTNS',
  currency: 'USD',
  totalAmount: '7800',
  incoterms: 'FOB HO CHI MINH',
  paymentTerms: 'T/T',
  certificateOfOriginAvailable: true,
  items: [{
    id: 'i1', description: 'STAINLESS STEEL VACUUM FLASK', documentHSCode: '9617.00',
    confirmedHSCode: '9617001000', quantity: '1200', quantityUnit: 'EA', unitPrice: '6.5',
    amount: '7800', netWeight: '480', originCountry: 'VIETNAM', material: 'SUS304', modelName: 'VF-500',
  }],
  ...overrides,
});

const duty: ImportDutyEstimate = {
  status: 'calculated', invoiceCurrency: 'USD', invoiceAmount: 7800, exchangeRate: 1358.72,
  exchangeRateDate: '2026-09-20', convertedInvoiceKrw: 10598016, customsValue: 10598016,
  basicRate: 8, basicDuty: 847841, ftaAgreement: '확인 필요', ftaRate: null, ftaDuty: null,
  estimatedSavings: null, vat: 1144586, otherTaxes: null, totalTax: 1992427,
  items: [{ itemId: 'i1', hsCode: '9617001000', customsValue: 10598016, basicRate: 8, basicDuty: 847841 }],
  source: 'api',
};

describe('수입신고서(초안) 값 채우기', () => {
  it('서류에서 읽은 값을 관세청 서식 칸에 넣는다', () => {
    const form = mapImportDeclarationForm({ fields: fields(), duty });
    expect(form.bl_no).toBe('KMTCSGN2609001');
    expect(form.arrival_date).toBe('2026-09-12');
    expect(form.importer).toBe('PORTAI TRADING CO., LTD.');
    expect(form.taxpayer_tel).toBe('02-1234-5678');
    expect(form.arrival_port).toBe('BUSAN');
    expect(form.vessel_name).toBe('KMTC HOCHIMINH');
    expect(form.total_weight).toBe('550 KG');
    expect(form.total_packages).toBe('50 CTNS');
    expect(form.overseas_partner).toBe('SAIGON HOMEWARE CO., LTD.');
    expect(form.co_yn).toBe('Y');
  });

  it('품목번호는 확정 HSK를 쓰고, 결제금액은 인도조건-통화-금액-결제방법으로 적는다', () => {
    const form = mapImportDeclarationForm({ fields: fields(), duty });
    expect(form.first_hs_code).toBe('9617001000');
    expect(form.first_goods_name).toBe('STAINLESS STEEL VACUUM FLASK');
    expect(form.first_spec_qty).toBe('1,200 EA');
    expect(form.payment_amount).toBe('FOB-USD-7,800-T/T');
  });

  it('세액은 계산 결과에서 채우고, 계산 전이면 비워 둔다', () => {
    const withDuty = mapImportDeclarationForm({ fields: fields(), duty });
    expect(withDuty.tax_customs).toBe('847,841');
    expect(withDuty.tax_vat).toBe('1,144,586');
    expect(withDuty.total_tax).toBe('1,992,427');
    expect(withDuty.exchange_rate).toBe('1,358.72');
    expect(withDuty.first_tax_rate).toBe('8%');

    const noDuty = mapImportDeclarationForm({ fields: fields() });
    expect(noDuty.tax_customs).toBe('');
    expect(noDuty.total_tax).toBe('');
    expect(noDuty.exchange_rate).toBe('');
  });

  it('신고번호·부호칸처럼 신고자가 적지 않는 칸은 비워 둔다', () => {
    const form = mapImportDeclarationForm({ fields: fields(), duty });
    ['decl_no', 'customs_office', 'collect_type', 'clearance_plan', 'decl_kind', 'trade_kind', 'goods_kind', 'declarant']
      .forEach((key) => expect(form[key]).toBe(''));
  });

  it('품목이 여러 건이면 갑지 1란에 "외 N건"을 덧붙인다', () => {
    const many = fields({
      items: [
        { id: 'i1', description: 'FLASK', quantity: '100', quantityUnit: 'EA' },
        { id: 'i2', description: 'MUG', quantity: '50', quantityUnit: 'EA' },
        { id: 'i3', description: 'TUMBLER', quantity: '30', quantityUnit: 'EA' },
      ],
    });
    expect(mapImportDeclarationForm({ fields: many }).first_goods_name).toBe('FLASK 외 2건');
  });
});
