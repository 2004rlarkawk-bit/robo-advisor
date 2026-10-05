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
    expect(valuation.unconfirmed).toContain('운임');
  });

  it('Incoterms를 모르면 가산하지 않고 확인 안내를 남긴다', () => {
    const valuation = resolveDutiableAdditions({ incoterms: '', freight: '100', insurance: '10' });
    expect(valuation.freight + valuation.insurance).toBe(0);
    expect(valuation.unconfirmed).toEqual(['Incoterms']);
  });
});

describe('과세가격 가산 — 미확인·통화·중복 가산', () => {
  it('빈 운임은 0원이 아니라 미확인으로 남는다', () => {
    const missing = resolveDutiableAdditions({ incoterms: 'FOB', freight: '', insurance: '10' }, 'USD');
    expect(missing.unconfirmed).toContain('운임');
    const zero = resolveDutiableAdditions({ incoterms: 'FOB', freight: '0', insurance: '10' }, 'USD');
    expect(zero.unconfirmed).not.toContain('운임');
  });

  it('원화로 적힌 운임에는 환율을 다시 곱하지 않는다', () => {
    const valuation = resolveDutiableAdditions({ incoterms: 'FOB', freight: 'KRW 500,000', insurance: 'USD 10' }, 'USD');
    expect(valuation.krw).toBe(500_000);
    expect(valuation.freight).toBe(0);
    expect(valuation.insurance).toBe(10);
  });

  it('Invoice와 다른 외화 운임은 가산하지 않고 미확인으로 남긴다', () => {
    const valuation = resolveDutiableAdditions({ incoterms: 'FOB', freight: 'EUR 300', insurance: '10' }, 'USD');
    expect(valuation.freight).toBe(0);
    expect(valuation.unconfirmed).toContain('운임');
  });

  it('CIF는 운임이 추출돼 있어도 다시 더하지 않는다', () => {
    const valuation = resolveDutiableAdditions({ incoterms: 'CIF Busan', freight: 'USD 300', insurance: 'USD 10' }, 'USD');
    expect(valuation.freight + valuation.insurance + valuation.krw).toBe(0);
    expect(valuation.unconfirmed).toEqual([]);
  });

  it('EXW·FCA·FAS는 수출국 내 운송비를 미확인으로 남긴다', () => {
    expect(resolveDutiableAdditions({ incoterms: 'FCA', freight: '100', insurance: '10' }, 'USD').unconfirmed)
      .toEqual(['수출국 내 운송비']);
  });

  it('D조건은 Invoice 그대로의 값을 참고값으로 표시한다', () => {
    expect(resolveDutiableAdditions({ incoterms: 'DAP Seoul' }, 'USD').unconfirmed).toEqual(['수입항 이후 비용 공제']);
  });

  it('미국산이면 같은 관세율 조회 결과에서 한·미 FTA 세율을 후보로 뽑되 예상세액에는 반영하지 않는다', async () => {
    tariffMock.mockResolvedValueOnce([
      { hsCode: '0710400000', typeCode: 'A', typeName: '기본세율', rate: 30, applyStart: '20260101', applyEnd: '20261231', source: 'api' },
      { hsCode: '0710400000', typeCode: 'FUS1', typeName: '한·미 FTA협정세율', rate: 0, applyStart: '20260101', applyEnd: '20261231', source: 'api' },
    ]);
    const duty = await calculateEstimatedImportDuty({
      items: normalizeImportExtractedFields({ items: [{ id: '1', description: 'Frozen sweet corn', confirmedHSCode: '0710400000', originCountry: 'U.S.A.', amount: '1000' }] }).items,
      invoiceCurrency: 'CNY',
      invoiceAmount: '1000',
      originCountry: 'U.S.A.',
      destinationCountry: 'KOREA',
      incoterms: 'CIF',
    });
    expect(duty.fta?.agreement).toBe('한·미 FTA');
    expect(duty.fta?.rate).toBe(0);
    expect(duty.fta?.savings).toBe(duty.basicDuty);
    expect(duty.ftaAgreement).toBe('한·미 FTA');
    expect(duty.ftaRate).toBeNull();
    expect(duty.totalTax).toBe(duty.basicDuty + duty.vat);
  });
});
