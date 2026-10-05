import { getCustomsExchangeRateStrict } from './customsApiService';
import { normalizeCurrencyCode } from '../utils/currencyCode';
import { getTariffRates, pickBasicRate } from './unipassService';
import type { ImportDutyEstimate, ImportDutyValuation, ImportItem } from '../types/importTrade';
import { buildFtaCandidate } from './ftaAgreementService';
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
/** 송장 가격이 수출국 내 운송·선적 전 단계에서 끝나는 조건 */
const BEFORE_MAIN_CARRIAGE = new Set(['EXW', 'FCA', 'FAS']);
/** 송장 가격에 수입항 이후 운송비가 들어 있을 수 있는 조건 */
const BEYOND_PORT = new Set(['CPT', 'CIP']);

type CostReading =
  | { status: 'found'; amount: number; currency: 'invoice' | 'KRW' }
  | { status: 'missing' }
  | { status: 'other-currency'; currency: string };

/**
 * 서류에서 읽은 운임·보험료 문자열을 해석한다.
 * 빈 값은 '확인된 0원'이 아니라 '찾지 못함'으로 남긴다. 원화 금액에는 환율을 다시 곱하지 않는다.
 */
function readCost(value: string | number | undefined, invoiceCurrency: string): CostReading {
  const amount = parseTradeNumber(value);
  if (amount == null) return { status: 'missing' };
  if (typeof value !== 'string') return { status: 'found', amount, currency: 'invoice' };
  const text = value.normalize('NFKC').toUpperCase();
  if (/KRW|₩|원/.test(text)) return { status: 'found', amount, currency: 'KRW' };
  const code = text.match(/\b([A-Z]{3})\b/)?.[1];
  if (code && normalizeCurrencyCode(code) !== invoiceCurrency) return { status: 'other-currency', currency: code };
  return { status: 'found', amount, currency: 'invoice' };
}

/**
 * 과세가격은 우리나라 수입항 도착까지의 운임·보험료를 포함한다(관세법 제30조).
 * Invoice 가격에 이미 들어 있는 비용은 다시 더하지 않도록 Incoterms로 가산 범위를 정한다.
 * 다룰 수 없는 경우는 계산을 완성된 것처럼 두지 않고 unconfirmed에 남긴다.
 */
export function resolveDutiableAdditions(
  input: Pick<ImportDutyInput, 'incoterms' | 'freight' | 'insurance'>,
  invoiceCurrency = '',
): ImportDutyValuation {
  const code = (input.incoterms ?? '').toUpperCase().match(/\b(EXW|FCA|FAS|FOB|CFR|CPT|CIF|CIP|DAP|DPU|DDP)\b/)?.[1] ?? null;
  const notes: string[] = [];
  const unconfirmed: string[] = [];
  let freight = 0;
  let insurance = 0;
  let krw = 0;

  const add = (label: '운임' | '보험료', value: string | number | undefined, missingNote: string) => {
    const reading = readCost(value, invoiceCurrency);
    if (reading.status === 'missing') {
      unconfirmed.push(label);
      notes.push(missingNote);
      return;
    }
    if (reading.status === 'other-currency') {
      unconfirmed.push(label);
      notes.push(`${label}가 ${reading.currency}로 적혀 있어 Invoice 통화(${invoiceCurrency})와 달라 가산하지 않았습니다. 환산 기준을 확인한 뒤 다시 계산합니다.`);
      return;
    }
    if (reading.currency === 'KRW') krw += reading.amount;
    else if (label === '운임') freight = reading.amount;
    else insurance = reading.amount;
  };

  if (!code) {
    unconfirmed.push('Incoterms');
    notes.push('Incoterms를 확인하지 못해 운임·보험료를 가산하지 않았습니다. 조건을 확인한 뒤 다시 계산합니다.');
  } else if (DELIVERED.has(code)) {
    unconfirmed.push('수입항 이후 비용 공제');
    notes.push(`${code} 가격에는 수입항 이후 국내 운송비 등이 들어 있을 수 있습니다. 공제할 금액을 확인하기 전까지는 Invoice 금액 그대로 계산한 참고값입니다.`);
  } else {
    if (ADD_FREIGHT_AND_INSURANCE.has(code)) {
      add('운임', input.freight, `${code} 조건이라 수입항까지의 국제운임을 더해야 하는데, 서류에서 운임을 확인하지 못했습니다. 실제 운임을 확인한 뒤 과세가격과 예상세액을 다시 계산합니다.`);
    }
    if (ADD_FREIGHT_AND_INSURANCE.has(code) || ADD_INSURANCE_ONLY.has(code)) {
      add('보험료', input.insurance, `${code} 조건이라 보험료를 더해야 하는데, 서류에서 보험료를 확인하지 못했습니다. 적하보험에 들지 않았다면 가산하지 않습니다.`);
    }
    if (BEFORE_MAIN_CARRIAGE.has(code)) {
      unconfirmed.push('수출국 내 운송비');
      notes.push(`${code} 가격에는 수출국 안의 운송·선적 비용이 빠져 있습니다. 이 비용도 과세가격에 들어가므로, 서류의 운임이 그 구간까지 포함하는지 확인해야 합니다.`);
    }
    if (BEYOND_PORT.has(code)) {
      notes.push(`${code} 가격에 수입항 이후 운송비가 들어 있다면 구분해 공제할 수 있습니다. 송장의 지정 장소가 수입항인지 확인하세요.`);
    }
    if (!ADD_FREIGHT_AND_INSURANCE.has(code) && !ADD_INSURANCE_ONLY.has(code) && !ADD_NOTHING.has(code)) {
      unconfirmed.push('Incoterms');
      notes.push(`${code} 조건의 가산 범위를 확인해야 합니다.`);
    }
  }

  return { incoterms: code, freight, insurance, krw, unconfirmed, notes };
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
  const valuation = resolveDutiableAdditions(input, currency);
  const additionsForeign = valuation.freight + valuation.insurance + numberValue(input.otherAdditions);
  const customsValue = Math.round((invoiceAmount + additionsForeign) * exchangeRate.rate + valuation.krw);
  const itemAmounts = input.items.map((item) => numberValue(item.amount));
  const itemAmountTotal = itemAmounts.reduce((sum, amount) => sum + amount, 0);

  const itemEstimates = await Promise.all(input.items.map(async (item, index) => {
    let rates;
    let basic;
    try {
      rates = await getTariffRates(item.confirmedHSCode);
      basic = pickBasicRate(rates);
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
      rates,
    };
  }));
  // 같은 조회 결과에 협정세율 행도 들어 있으므로 다시 부르지 않고 FTA 후보를 뽑는다.
  const fta = buildFtaCandidate(input.originCountry, input.destinationCountry, itemEstimates);

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
    fta,
    ftaAgreement: fta.agreement ?? (fta.agreements.length ? '확인 필요' : '해당 없음'),
    ftaRate: null,
    ftaDuty: null,
    estimatedSavings: null,
    vat,
    otherTaxes: null,
    totalTax: basicDuty + vat,
    items: itemEstimates.map(({ rates: _rates, ...item }) => item),
    source: 'api',
  };
}
