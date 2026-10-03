import { getCustomsExchangeRateStrict } from './customsApiService';
import { normalizeCurrencyCode } from '../utils/currencyCode';
import { getTariffRates, pickBasicRate } from './unipassService';
import type { ImportDutyEstimate, ImportDutyValuation, ImportItem } from '../types/importTrade';
import { parseTradeNumber } from '../utils/number';

const numberValue = (value: string | number | undefined): number => parseTradeNumber(value) ?? 0;

export interface ImportDutyInput {
  items: ImportItem[];
  invoiceCurrency: string;
  invoiceAmount: string | number;
  invoiceDate?: string;
  originCountry: string;
  destinationCountry: string;
  /** 'FOB Ho Chi Minh'처럼 장소가 붙어 와도 된다. 운임·보험료 가산 범위를 정한다. */
  incoterms?: string;
  freight?: string | number;
  insurance?: string | number;
  otherAdditions?: string | number;
}

const ADD_FREIGHT_AND_INSURANCE = new Set(['EXW', 'FCA', 'FAS', 'FOB']);
const ADD_INSURANCE_ONLY = new Set(['CFR', 'CPT']);
const ADD_NOTHING = new Set(['CIF', 'CIP']);
const DELIVERED = new Set(['DAP', 'DPU', 'DDP']);

/**
 * 과세가격은 우리나라 수입항 도착까지의 운임·보험료를 포함한다(관세법 제30조).
 * Invoice 가격에 이미 들어 있는 비용은 다시 더하지 않도록 Incoterms로 가산 범위를 정한다.
 */
export function resolveDutiableAdditions(input: Pick<ImportDutyInput, 'incoterms' | 'freight' | 'insurance'>): ImportDutyValuation {
  const code = (input.incoterms ?? '').toUpperCase().match(/\b(EXW|FCA|FAS|FOB|CFR|CPT|CIF|CIP|DAP|DPU|DDP)\b/)?.[1] ?? null;
  const freight = numberValue(input.freight);
  const insurance = numberValue(input.insurance);
  const notes: string[] = [];
  let addFreight = false;
  let addInsurance = false;
  if (!code) {
    notes.push('Incoterms를 확인하지 못해 운임·보험료를 가산하지 않았습니다. 조건이 FOB·CFR 등이면 과세가격이 늘어납니다.');
  } else if (ADD_FREIGHT_AND_INSURANCE.has(code)) {
    addFreight = true;
    addInsurance = true;
  } else if (ADD_INSURANCE_ONLY.has(code)) {
    addInsurance = true;
  } else if (DELIVERED.has(code)) {
    notes.push(`${code} 가격에는 수입항 이후 국내 운송비 등이 포함될 수 있어, 과세가격에서 공제할 금액을 관세사와 확인해야 합니다.`);
  } else if (!ADD_NOTHING.has(code)) {
    notes.push(`${code} 조건의 가산 범위를 확인해야 합니다.`);
  }
  if (addFreight && freight <= 0) {
    notes.push(`${code} 조건이라 수입항까지의 국제운임을 더해야 하는데, 서류에서 운임을 찾지 못했습니다. 운임을 확인하면 과세가격이 늘어납니다.`);
  }
  if (addInsurance && insurance <= 0) {
    notes.push(`${code} 조건이라 보험료를 더해야 하는데 서류에서 찾지 못했습니다. 적하보험에 들지 않았다면 가산하지 않습니다.`);
  }
  return {
    incoterms: code,
    freight: addFreight ? freight : 0,
    insurance: addInsurance ? insurance : 0,
    notes,
  };
}

export async function calculateEstimatedImportDuty(input: ImportDutyInput): Promise<ImportDutyEstimate> {
  // 이미 저장된 분석 결과에는 'US$'가 그대로 남아 있을 수 있어 여기서도 코드로 맞춘다.
  const currency = normalizeCurrencyCode(input.invoiceCurrency) || input.invoiceCurrency.trim().toUpperCase();
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
    // 과세환율은 '수입신고일이 속한 주'의 고시 환율을 쓴다. 송장 작성일이 아니다.
    // 날짜를 넘기지 않으면 Edge Function이 오늘(한국 시간) 기준 주의 환율을 찾는다.
    // 송장일을 넘기던 때에는 아직 고시되지 않은 주(=미래 날짜)를 조회해 통째로 실패했다.
    exchangeRate = await getCustomsExchangeRateStrict(currency, 'import');
  } catch (error) {
    throw new Error(`환율 API 조회 실패: ${error instanceof Error ? error.message : String(error)}`);
  }

  const convertedInvoiceKrw = Math.round(invoiceAmount * exchangeRate.rate);
  const valuation = resolveDutiableAdditions(input);
  const additionsForeign = valuation.freight + valuation.insurance + numberValue(input.otherAdditions);
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
    additionsKrw: customsValue - convertedInvoiceKrw,
    valuation,
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
