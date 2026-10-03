import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./customsApiService', () => ({
  getCustomsExchangeRateStrict: vi.fn(),
}));
vi.mock('./unipassService', () => ({
  getTariffRates: vi.fn(),
  pickBasicRate: vi.fn((rates: unknown[]) => rates[0] ?? null),
}));

import { getCustomsExchangeRateStrict } from './customsApiService';
import { getTariffRates } from './unipassService';
import { calculateEstimatedImportDuty, resolveDutiableAdditions } from './importDutyService';
import { normalizeImportExtractedFields } from './importDocumentAnalysisService';

const exchangeMock = vi.mocked(getCustomsExchangeRateStrict);
const tariffMock = vi.mocked(getTariffRates);

describe('수입 예상세액 계산', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeMock.mockResolvedValue({
      currency: 'CNY',
      currencyName: '중국 위안',
      rate: 200,
      effectiveDate: '20260727',
      tradeType: 'import',
      source: 'api',
    });
    tariffMock.mockResolvedValue([{
      hsCode: '6109100000',
      typeCode: 'A',
      typeName: '기본세율',
      rate: 13,
      applyStart: '20260101',
      applyEnd: '20261231',
      source: 'api',
    }]);
  });

  it('외화 Invoice 금액에 실제 API 환율을 적용하고 FTA 0%를 추정하지 않는다', async () => {
    const fields = normalizeImportExtractedFields({
      currency: 'CNY',
      totalAmount: '300000',
      destinationCountry: 'South Korea',
      items: [{
        id: '1',
        description: 'Cotton T-shirts',
        confirmedHSCode: '6109100000',
        originCountry: 'China',
        amount: '300000',
      }],
    });
    const duty = await calculateEstimatedImportDuty({
      items: fields.items,
      invoiceCurrency: fields.currency,
      invoiceAmount: fields.totalAmount,
      originCountry: 'China',
      destinationCountry: fields.destinationCountry,
    });

    expect(duty.convertedInvoiceKrw).toBe(60_000_000);
    expect(duty.customsValue).toBe(60_000_000);
    expect(duty.ftaAgreement).toBe('확인 필요');
    expect(duty.ftaRate).toBeNull();
    expect(duty.totalTax).toBeGreaterThan(0);
  });

  it('환율 API 실패를 임의 환율이나 0원 결과로 대체하지 않는다', async () => {
    exchangeMock.mockRejectedValueOnce(new Error('service unavailable'));
    const fields = normalizeImportExtractedFields({
      items: [{ id: '1', description: 'Goods', confirmedHSCode: '6109100000', originCountry: 'China' }],
    });
    await expect(calculateEstimatedImportDuty({
      items: fields.items,
      invoiceCurrency: 'CNY',
      invoiceAmount: '300000',
      originCountry: 'China',
      destinationCountry: 'South Korea',
    })).rejects.toThrow('환율 API 조회 실패: service unavailable');
    expect(tariffMock).not.toHaveBeenCalled();
  });

  const item = { id: '1', description: 'Goods', confirmedHSCode: '6109100000', originCountry: 'China', amount: '1000' };
  const dutyFor = (incoterms: string) => calculateEstimatedImportDuty({
    items: normalizeImportExtractedFields({ items: [item] }).items,
    invoiceCurrency: 'CNY',
    invoiceAmount: '1000',
    originCountry: 'China',
    destinationCountry: 'South Korea',
    incoterms,
    freight: '100',
    insurance: '10',
  });

  it('FOB는 운임과 보험료를 과세가격에 더한다', async () => {
    const duty = await dutyFor('FOB Shanghai');
    expect(duty.convertedInvoiceKrw).toBe(200_000);
    expect(duty.additionsKrw).toBe(22_000);
    expect(duty.customsValue).toBe(222_000);
    expect(duty.basicDuty).toBe(Math.round(222_000 * 0.13));
  });

  it('CFR은 보험료만 더한다', async () => {
    const duty = await dutyFor('CFR Busan');
    expect(duty.customsValue).toBe(202_000);
  });

  it('CIF는 Invoice 가격에 이미 운임·보험료가 있어 더하지 않는다', async () => {
    const duty = await dutyFor('CIF Busan');
    expect(duty.customsValue).toBe(200_000);
    expect(duty.valuation?.notes).toEqual([]);
  });

  it('FOB인데 운임이 없으면 0으로 넘기지 않고 확인 안내를 남긴다', () => {
    const valuation = resolveDutiableAdditions({ incoterms: 'FOB', freight: '', insurance: '' });
    expect(valuation.freight).toBe(0);
    expect(valuation.notes.join(' ')).toContain('운임을 찾지 못했습니다');
  });

  it('Incoterms를 모르면 가산하지 않고 확인 안내를 남긴다', () => {
    const valuation = resolveDutiableAdditions({ incoterms: '', freight: '100', insurance: '10' });
    expect(valuation.freight + valuation.insurance).toBe(0);
    expect(valuation.notes[0]).toContain('Incoterms를 확인하지 못해');
  });
});
