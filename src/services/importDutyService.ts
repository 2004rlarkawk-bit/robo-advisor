import { getCustomsExchangeRateStrict } from './customsApiService';
import { getTariffRates, pickBasicRate } from './unipassService';
import type { ImportDutyEstimate, ImportItem } from '../types/importTrade';

const numberValue = (value: string | number | undefined): number => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export interface ImportDutyInput {
  items: ImportItem[];
  invoiceCurrency: string;
  invoiceAmount: string | number;
  invoiceDate?: string;
  originCountry: string;
  destinationCountry: string;
  freight?: string | number;
  insurance?: string | number;
  otherAdditions?: string | number;
}

export async function calculateEstimatedImportDuty(input: ImportDutyInput): Promise<ImportDutyEstimate> {
  const currency = input.invoiceCurrency.trim().toUpperCase();
  const invoiceAmount = numberValue(input.invoiceAmount);
  if (!currency) throw new Error('환율 조회 불가: Invoice 통화가 없습니다.');
  if (invoiceAmount <= 0) throw new Error('예상세액 계산 불가: Invoice 총금액이 없습니다.');
  if (!input.destinationCountry.trim()) throw new Error('예상세액 계산 불가: 수입국이 없습니다.');
  if (!input.originCountry.trim()) throw new Error('예상세액 계산 불가: 원산지가 없습니다.');
  if (!input.items.length || input.items.some((item) => !item.confirmedHSCode.trim())) {
    throw new Error('관세율 조회 불가: 모든 품목의 HS Code를 먼저 확정해 주세요.');
  }

  let exchangeRate;
  try {
    exchangeRate = await getCustomsExchangeRateStrict(
      currency,
      'import',
      input.invoiceDate?.replace(/-/g, '') || undefined,
    );
  } catch (error) {
    throw new Error(`환율 API 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
  }

  const convertedInvoiceKrw = Math.round(invoiceAmount * exchangeRate.rate);
  const additionsForeign = numberValue(input.freight) + numberValue(input.insurance) + numberValue(input.otherAdditions);
  const customsValue = Math.round((invoiceAmount + additionsForeign) * exchangeRate.rate);
  const itemAmounts = input.items.map((item) => numberValue(item.amount));
  const itemAmountTotal = itemAmounts.reduce((sum, amount) => sum + amount, 0);

  const itemEstimates = await Promise.all(input.items.map(async (item, index) => {
    let basic;
    try {
      basic = pickBasicRate(await getTariffRates(item.confirmedHSCode));
    } catch (error) {
      throw new Error(`관세율 API 조회 실패 (${item.confirmedHSCode}): ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!basic) throw new Error(`관세율 API 조회 실패 (${item.confirmedHSCode}): 기본 관세율이 없습니다.`);
    const allocatedValue = itemAmountTotal > 0
      ? Math.round(customsValue * itemAmounts[index] / itemAmountTotal)
      : input.items.length === 1 ? customsValue : 0;
    if (allocatedValue <= 0) {
      throw new Error(`예상세액 계산 불가: 품목 ${index + 1}의 금액 배분 기준이 없습니다.`);
    }
    return {
      itemId: item.id,
      hsCode: item.confirmedHSCode,
      customsValue: allocatedValue,
      basicRate: basic.rate,
      basicDuty: Math.round(allocatedValue * basic.rate / 100),
    };
  }));

  const basicDuty = itemEstimates.reduce((sum, item) => sum + item.basicDuty, 0);
  const vat = Math.round((customsValue + basicDuty) * 0.1);
  const weightedBasicRate = customsValue
    ? itemEstimates.reduce((sum, item) => sum + item.customsValue * item.basicRate, 0) / customsValue
    : 0;

  return {
    status: 'calculated',
    invoiceCurrency: currency,
    invoiceAmount,
    exchangeRate: exchangeRate.rate,
    exchangeRateDate: exchangeRate.effectiveDate,
    convertedInvoiceKrw,
    customsValue,
    basicRate: Number(weightedBasicRate.toFixed(4)),
    basicDuty,
    ftaAgreement: '확인 필요',
    ftaRate: null,
    ftaDuty: null,
    estimatedSavings: null,
    vat,
    otherTaxes: null,
    totalTax: basicDuty + vat,
    items: itemEstimates,
    source: 'api',
  };
}
