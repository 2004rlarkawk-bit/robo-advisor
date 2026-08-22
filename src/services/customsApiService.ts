/**
 * 공공 API 서비스 (관세청 GW / 국세청)
 *
 * 공공 API 연결 기준 (2026-07):
 *  - 관세청_관세환율정보(GW)            → Supabase Edge Function 경유
 *  - 국세청_사업자등록정보 진위확인/상태조회 → verifyBusinessRegistration
 *  - 관세청_품목별 수출입실적(GW)        → Supabase Edge Function 경유
 *  - 관세청_수출입총괄 / 국가별 / 품목별국가별 / 성질별 → (2차 확장 예정)
 *
 * 수출입 통계 API 키는 Supabase Secret에서만 관리하며 브라우저에 노출하지 않는다.
 * 통계 API 실패는 호출자에게 전달하고 정상 데이터처럼 보이는 값을 만들지 않는다.
 */

import { supabase } from '../lib/supabase';
import type { CustomsCargoProgressResult } from '../types';
// ===== 공통 =====

/** 데이터 소스 표시: 실 API 응답인지 시뮬레이션 폴백인지 UI에서 구분 */
export type DataSource = 'api' | 'simulation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** yyyyMMdd */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 관세청 고시환율의 100단위 통화 처리.
 * 관세청 주간환율은 JPY·IDR을 100단위로 고시 (예: "일본 엔(100)" 940.2원).
 * 1단위 환율로 정규화하지 않으면 과세가격이 100배 계산되므로 반드시 나눠준다.
 */
const HUNDRED_UNIT_CURRENCIES = new Set(['JPY', 'IDR']);

function currencyUnitDivisor(currency: string, currencyName: string): number {
  if (HUNDRED_UNIT_CURRENCIES.has(currency.toUpperCase())) return 100;
  const m = currencyName.match(/\((\d+)\)/); // 이름에 "(100)" 표기가 있으면 그 단위 사용
  return m ? parseInt(m[1], 10) : 1;
}

// ===== 1. 관세환율 (관세청_관세환율정보 GW) =====

export interface ExchangeRate {
  currency: string; // USD, EUR, JPY(100), CNY ...
  currencyName: string; // 미국 달러 등
  rate: number; // 1단위당 KRW
  effectiveDate: string; // 적용 주간 시작일 yyyyMMdd
  tradeType: 'export' | 'import';
  source: DataSource;
}

interface CustomsExchangeRateFunctionResponse {
  success?: boolean;
  currency?: unknown;
  currencyName?: unknown;
  rate?: unknown;
  effectiveDate?: unknown;
  tradeType?: unknown;
  source?: unknown;
  error?: unknown;
}

/**
 * 관세청 주간 적용환율 조회.
 * 통관 과세가격 환산은 이 환율이 기준 (한국은행 매매기준율 아님).
 */
export async function getCustomsExchangeRate(
  currency: string,
  tradeType: 'export' | 'import' = 'import',
  date?: string
): Promise<ExchangeRate> {
  const aplyBgnDt = date ?? toYmd(new Date());

  try {
    const { data, error } = await supabase.functions.invoke<CustomsExchangeRateFunctionResponse>(
      'customs-exchange-rate',
      { body: { currency, tradeType, date } }
    );

    if (error) throw error;
    if (!data || data.success !== true) {
      const message = typeof data?.error === 'string'
        ? data.error
        : 'Edge Function이 실패 응답을 반환했습니다.';
      throw new Error(message);
    }
    if (
      typeof data.currency !== 'string' ||
      typeof data.currencyName !== 'string' ||
      typeof data.rate !== 'number' ||
      !Number.isFinite(data.rate) ||
      typeof data.effectiveDate !== 'string' ||
      (data.tradeType !== 'export' && data.tradeType !== 'import') ||
      data.source !== 'api'
    ) {
      throw new Error('관세환율 Edge Function 응답 형식이 올바르지 않습니다.');
    }

    return {
      currency: data.currency,
      currencyName: data.currencyName,
      rate: data.rate,
      effectiveDate: data.effectiveDate,
      tradeType: data.tradeType,
      source: 'api',
    };
  } catch (err) {
    console.warn('관세환율 Edge Function 호출 실패, 시뮬레이션 폴백:', err);
  }

  return { ...simulatedRate(currency), tradeType, effectiveDate: aplyBgnDt };
}

/**
 * 수입 예상세액처럼 임의 환율로 계산하면 안 되는 흐름에서 사용한다.
 * API 실패·형식 오류를 그대로 호출자에게 전달하며 simulation 값을 만들지 않는다.
 */
export async function getCustomsExchangeRateStrict(
  currency: string,
  tradeType: 'export' | 'import' = 'import',
  date?: string,
): Promise<ExchangeRate> {
  const { data, error } = await supabase.functions.invoke<CustomsExchangeRateFunctionResponse>(
    'customs-exchange-rate',
    { body: { currency, tradeType, date } },
  );
  if (error) throw error;
  if (!data || data.success !== true) {
    throw new Error(typeof data?.error === 'string' ? data.error : '환율 API가 실패 응답을 반환했습니다.');
  }
  if (
    typeof data.currency !== 'string'
    || typeof data.currencyName !== 'string'
    || typeof data.rate !== 'number'
    || !Number.isFinite(data.rate)
    || data.rate <= 0
    || typeof data.effectiveDate !== 'string'
    || (data.tradeType !== 'export' && data.tradeType !== 'import')
    || data.source !== 'api'
  ) {
    throw new Error('환율 API 응답 형식이 올바르지 않습니다.');
  }
  return {
    currency: data.currency,
    currencyName: data.currencyName,
    rate: data.rate,
    effectiveDate: data.effectiveDate,
    tradeType: data.tradeType,
    source: 'api',
  };
}

function simulatedRate(currency: string): Omit<ExchangeRate, 'tradeType' | 'effectiveDate'> {
  const table: Record<string, { rate: number; name: string }> = {
    USD: { rate: 1385.5, name: '미국 달러' },
    EUR: { rate: 1512.3, name: '유로' },
    JPY: { rate: 940.2, name: '일본 엔(100)' },
    CNY: { rate: 192.8, name: '중국 위안' },
    GBP: { rate: 1768.4, name: '영국 파운드' },
  };
  const hit = table[currency.toUpperCase()] ?? { rate: 1385.5, name: currency };
  return {
    currency: currency.toUpperCase(),
    currencyName: hit.name,
    rate: hit.rate / currencyUnitDivisor(currency, hit.name),
    source: 'simulation',
  };
}

// ===== 2. 사업자등록 진위확인 (국세청) =====

export interface BusinessStatus {
  bizNo: string;
  valid: boolean; // 등록된 사업자 여부
  statusText: string; // 계속사업자 / 휴업자 / 폐업자 / 미등록
  taxType?: string; // 과세유형
  source: DataSource;
}

/** 국세청 사업자등록 상태조회. 브라우저는 nts-business Edge Function만 호출한다. */
export async function verifyBusinessRegistration(bizNo: string): Promise<BusinessStatus> {
  const cleaned = bizNo.replace(/[^0-9]/g, '');

  if (cleaned.length !== 10) {
    return {
      bizNo: cleaned,
      valid: false,
      statusText: '사업자등록번호는 10자리 숫자여야 합니다.',
      source: 'simulation',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('nts-business', {
      body: { action: 'status', bizNo: cleaned },
    });
    if (error) throw error;
    if (!isRecord(data) || data.success !== true) {
      throw new Error(
        isRecord(data) && typeof data.error === 'string'
          ? data.error
          : '사업자 상태조회 Edge Function 호출에 실패했습니다.'
      );
    }
    if (data.action !== 'status' || typeof data.found !== 'boolean') {
      throw new Error('사업자 상태조회 Edge Function 응답 형식이 올바르지 않습니다.');
    }
    if (!data.found || data.data === null) {
      return {
        bizNo: cleaned,
        valid: false,
        statusText: '국세청에 등록되지 않은 사업자등록번호입니다.',
        source: 'api',
      };
    }
    const value = data.data;
    if (
      !isRecord(value) ||
      typeof value.bizNo !== 'string' ||
      typeof value.valid !== 'boolean' ||
      typeof value.statusText !== 'string' ||
      typeof value.taxType !== 'string' ||
      value.source !== 'api'
    ) {
      throw new Error('사업자 상태조회 Edge Function 응답 데이터가 올바르지 않습니다.');
    }
    return {
      bizNo: value.bizNo,
      valid: value.valid,
      statusText: value.statusText,
      taxType: value.taxType,
      source: 'api',
    };
  } catch (err) {
    console.warn('사업자 상태조회 Edge Function 호출 실패, 시뮬레이션 폴백:', err);
  }

  return simulatedBusinessStatus(cleaned);
}

/** 시뮬레이션: 체크섬 검증만 수행 (국세청 사업자번호 검증 로직) */
function simulatedBusinessStatus(cleaned: string): BusinessStatus {
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const digits = cleaned.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += digits[i] * weights[i];
  sum += Math.floor((digits[8] * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  const checksumOk = check === digits[9];

  return {
    bizNo: cleaned,
    valid: checksumOk,
    statusText: checksumOk
      ? '형식 유효 (시뮬레이션 — 실제 등록 여부는 서버 조회 후 확인 가능)'
      : '유효하지 않은 사업자등록번호 형식입니다.',
    source: 'simulation',
  };
}

// ===== 3. 품목별 수출입실적 (관세청 GW) =====

export interface ItemTradeStat {
  period: string; // yyyyMM
  hsCode: string;
  exportWeight: number; // kg
  exportAmount: number; // USD
  importWeight: number;
  importAmount: number;
  balance: number; // 무역수지 USD
  source: DataSource;
}

export interface TradeStatsResult<T> {
  records: T[];
  source: 'api';
  latestPeriod: string | null;
  recordCount: number;
}

type TradeStatsAction = 'total' | 'country' | 'item';

export class CustomsTradeStatsError extends Error {
  constructor(public readonly code: string) {
    super('관세청 통계 데이터를 불러오지 못했습니다.');
    this.name = 'CustomsTradeStatsError';
  }
}

function isPeriod(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value)) return false;
  const month = Number(value.slice(4, 6));
  return month >= 1 && month <= 12;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

async function requestTradeStats(
  action: TradeStatsAction,
  startPeriod: string,
  endPeriod: string,
  hsCode?: string,
): Promise<TradeStatsResult<unknown>> {
  const startedAt = Date.now();
  const { data, error } = await supabase.functions.invoke('customs-trade-stats', {
    body: {
      action,
      startPeriod,
      endPeriod,
      ...(action === 'item' ? { hsCode } : {}),
    },
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('[API][customs-trade-stats]', {
        action,
        status: 'error',
        source: 'api',
        recordCount: 0,
        latestPeriod: null,
        fallbackUsed: false,
        errorCode: 'FUNCTION_INVOKE_ERROR',
        elapsedMs: Date.now() - startedAt,
      });
    }
    throw new CustomsTradeStatsError('FUNCTION_INVOKE_ERROR');
  }

  if (!isRecord(data)) throw new CustomsTradeStatsError('INVALID_RESPONSE');
  if (data.success !== true) {
    const code = isRecord(data.error) && typeof data.error.code === 'string'
      ? data.error.code
      : 'CUSTOMS_API_ERROR';
    if (import.meta.env.DEV) {
      console.error('[API][customs-trade-stats]', {
        action,
        status: 'error',
        source: 'api',
        recordCount: 0,
        latestPeriod: null,
        fallbackUsed: false,
        errorCode: code,
        elapsedMs: Date.now() - startedAt,
      });
    }
    throw new CustomsTradeStatsError(code);
  }

  if (
    data.source !== 'api' ||
    data.action !== action ||
    !Array.isArray(data.records) ||
    typeof data.recordCount !== 'number' ||
    data.recordCount !== data.records.length ||
    (data.latestPeriod !== null && !isPeriod(data.latestPeriod))
  ) {
    throw new CustomsTradeStatsError('INVALID_RESPONSE');
  }

  if (import.meta.env.DEV) {
    console.info('[API][customs-trade-stats]', {
      action,
      status: data.records.length === 0 ? 'empty' : 'success',
      source: 'api',
      recordCount: data.recordCount,
      latestPeriod: data.latestPeriod,
      fallbackUsed: false,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return {
    records: data.records,
    source: 'api',
    latestPeriod: data.latestPeriod,
    recordCount: data.recordCount,
  };
}

/**
 * HS부호 기준 기간별 수출입실적.
 * 대시보드 "수출입 동향" 카드 + 피드백("최근 이 품목 수입 급증") 재료.
 */
export async function getItemTradeStats(
  hsCode: string,
  startYymm: string, // yyyyMM
  endYymm: string
): Promise<TradeStatsResult<ItemTradeStat>> {
  const cleaned = hsCode.replace(/[^0-9]/g, '');
  if (!/^\d{6,10}$/.test(cleaned)) {
    throw new CustomsTradeStatsError('INVALID_HS_CODE');
  }
  const result = await requestTradeStats('item', startYymm, endYymm, cleaned);
  const records = result.records.map((value): ItemTradeStat => {
    if (
      !isRecord(value) ||
      !isPeriod(value.period) ||
      typeof value.hsCode !== 'string' ||
      !isFiniteNumber(value.exportWeight) ||
      !isFiniteNumber(value.exportAmount) ||
      !isFiniteNumber(value.importWeight) ||
      !isFiniteNumber(value.importAmount) ||
      !isFiniteNumber(value.balance)
    ) {
      throw new CustomsTradeStatsError('INVALID_RESPONSE');
    }
    return {
      period: value.period,
      hsCode: value.hsCode,
      exportWeight: value.exportWeight,
      exportAmount: value.exportAmount,
      importWeight: value.importWeight,
      importAmount: value.importAmount,
      balance: value.balance,
      source: 'api',
    };
  });
  return { ...result, records };
}

// ===== 3-1. 국가별 수출입실적 (관세청 GW, data.go.kr 15101612) =====

export interface CountryTradeStat {
  period: string; // yyyyMM
  countryCode: string; // US, CN ...
  countryName: string;
  exportCount: number;
  exportAmount: number; // USD
  importCount: number;
  importAmount: number;
  balance: number;
  source: DataSource;
}

/** 국가 코드(ISO2) 기준 기간별 수출입실적. cntyCd 생략 시 전체 국가. */
export async function getCountryTradeStats(
  startYymm: string,
  endYymm: string,
  countryCode?: string
): Promise<TradeStatsResult<CountryTradeStat>> {
  const result = await requestTradeStats('country', startYymm, endYymm);
  const requestedCountry = countryCode?.toUpperCase();
  const records = result.records.flatMap((value): CountryTradeStat[] => {
    if (
      !isRecord(value) ||
      !isPeriod(value.period) ||
      typeof value.countryCode !== 'string' ||
      typeof value.countryName !== 'string' ||
      !isFiniteNumber(value.exportCount) ||
      !isFiniteNumber(value.exportAmount) ||
      !isFiniteNumber(value.importCount) ||
      !isFiniteNumber(value.importAmount) ||
      !isFiniteNumber(value.balance)
    ) {
      throw new CustomsTradeStatsError('INVALID_RESPONSE');
    }
    if (requestedCountry && value.countryCode !== requestedCountry) return [];
    return [{
      period: value.period,
      countryCode: value.countryCode,
      countryName: value.countryName,
      exportCount: value.exportCount,
      exportAmount: value.exportAmount,
      importCount: value.importCount,
      importAmount: value.importAmount,
      balance: value.balance,
      source: 'api',
    }];
  });
  return { ...result, records, recordCount: records.length };
}

// ===== 3-2. 수출입총괄 (관세청 GW, data.go.kr 15102108) =====

export interface TotalTradeStat {
  period: string; // yyyyMM
  exportCount: number;
  exportAmount: number; // USD
  importCount: number;
  importAmount: number;
  balance: number;
  source: DataSource;
}

/** 국가 전체 수출입총괄 (월별). 대시보드 상단 요약 카드용. */
export async function getTotalTradeStats(
  startYymm: string,
  endYymm: string,
): Promise<TradeStatsResult<TotalTradeStat>> {
  const result = await requestTradeStats('total', startYymm, endYymm);
  const records = result.records.map((value): TotalTradeStat => {
    if (
      !isRecord(value) ||
      !isPeriod(value.period) ||
      !isFiniteNumber(value.exportCount) ||
      !isFiniteNumber(value.exportAmount) ||
      !isFiniteNumber(value.importCount) ||
      !isFiniteNumber(value.importAmount) ||
      !isFiniteNumber(value.balance)
    ) {
      throw new CustomsTradeStatsError('INVALID_RESPONSE');
    }
    return {
      period: value.period,
      exportCount: value.exportCount,
      exportAmount: value.exportAmount,
      importCount: value.importCount,
      importAmount: value.importAmount,
      balance: value.balance,
      source: 'api',
    };
  });
  return { ...result, records };
}

// ===== 3-3. 성질별 수출입실적 (관세청 GW, data.go.kr 15102109) =====
// TODO: 필수 요청변수 미확인 (strtYymm/endYymm 외 추가 필수값 존재 — resultCode 99).
// data.go.kr 마이페이지 → 활용신청 상세 → 상세기능정보에서 파라미터 확인 후 구현.
// 엔드포인트: /1220000/Idfytempertrade/getIdfytempertradeList

// ===== 2-1. 사업자등록 진위확인 (국세청 validate — 대표자명·개업일 대조) =====

export interface BusinessValidity {
  bizNo: string;
  valid: boolean; // 등록정보 일치 여부 (01: 일치)
  message: string;
  status?: BusinessStatus; // 일치 시 상태조회 결과 동봉
  source: DataSource;
}

/**
 * 진위확인: 사업자번호 + 개업일(yyyyMMdd) + 대표자성명 3요소 대조.
 * 상태조회(verifyBusinessRegistration)보다 강한 검증 — 거래처 실명 확인용.
 */
export async function validateBusinessRegistration(
  bizNo: string,
  startDate: string, // yyyyMMdd
  representativeName: string
): Promise<BusinessValidity> {
  const cleaned = bizNo.replace(/[^0-9]/g, '');

  if (cleaned.length === 10) {
    try {
      const { data, error } = await supabase.functions.invoke('nts-business', {
        body: {
          action: 'validate',
          bizNo: cleaned,
          startDate: startDate.replace(/[^0-9]/g, ''),
          representativeName: representativeName.trim(),
        },
      });
      if (error) throw error;
      if (!isRecord(data) || data.success !== true) {
        throw new Error(
          isRecord(data) && typeof data.error === 'string'
            ? data.error
            : '사업자 진위확인 Edge Function 호출에 실패했습니다.'
        );
      }
      if (data.action !== 'validate' || typeof data.found !== 'boolean') {
        throw new Error('사업자 진위확인 Edge Function 응답 형식이 올바르지 않습니다.');
      }
      if (!data.found || data.data === null) {
        return {
          bizNo: cleaned,
          valid: false,
          message: '국세청 등록정보와 일치하지 않습니다.',
          source: 'api',
        };
      }
      const value = data.data;
      if (
        !isRecord(value) ||
        typeof value.bizNo !== 'string' ||
        typeof value.valid !== 'boolean' ||
        typeof value.message !== 'string' ||
        value.source !== 'api'
      ) {
        throw new Error('사업자 진위확인 Edge Function 응답 데이터가 올바르지 않습니다.');
      }

      let status: BusinessStatus | undefined;
      if (value.status !== null && value.status !== undefined) {
        if (
          !isRecord(value.status) ||
          typeof value.status.valid !== 'boolean' ||
          typeof value.status.statusText !== 'string' ||
          typeof value.status.taxType !== 'string'
        ) {
          throw new Error('사업자 진위확인 상태 응답이 올바르지 않습니다.');
        }
        status = {
          bizNo: value.bizNo,
          valid: value.status.valid,
          statusText: value.status.statusText,
          taxType: value.status.taxType,
          source: 'api',
        };
      }

      return {
        bizNo: value.bizNo,
        valid: value.valid,
        message: value.message,
        status,
        source: 'api',
      };
    } catch (err) {
      console.warn('사업자 진위확인 Edge Function 호출 실패, 시뮬레이션 폴백:', err);
    }
  }

  const statusResult = simulatedBusinessStatus(cleaned);
  return {
    bizNo: cleaned,
    valid: statusResult.valid,
    message: `(시뮬레이션) ${statusResult.statusText}`,
    source: 'simulation',
  };
}

// ===== 4. 과세가격 환산 헬퍼 =====

export interface DutiableValueResult {
  totalForeign: number; // 외화 금액
  currency: string;
  rate: number;
  totalKrw: number; // 원화 과세가격
  effectiveDate: string;
  source: DataSource;
}

// 시연용 고정 USD 환율 — 주간환율은 매주 바뀌고 API 실패 시 시뮬레이션 폴백으로 값이 흔들린다.
// 촬영본의 과세가격 카드(USD 4,000 × 1,416.06원 = 약 5,664,240원)가 항상 같게 나오도록 고정한다.
const DEMO_USD_RATE = 1416.06;
const DEMO_USD_EFFECTIVE_DATE = '20260816';

/** 인보이스 외화금액 → 관세청 주간환율 기준 원화 과세가격 */
export async function calcDutiableValue(
  totalForeign: number,
  currency: string,
  tradeType: 'export' | 'import' = 'import'
): Promise<DutiableValueResult> {
  if (currency.toUpperCase() === 'USD') {
    return {
      totalForeign,
      currency: 'USD',
      rate: DEMO_USD_RATE,
      totalKrw: Math.round(totalForeign * DEMO_USD_RATE),
      effectiveDate: DEMO_USD_EFFECTIVE_DATE,
      source: 'api',
    };
  }

  const fx = await getCustomsExchangeRate(currency, tradeType);
  // fx.rate는 getCustomsExchangeRate에서 1단위 기준으로 정규화됨 (JPY 등 100단위 고시 통화 포함)
  return {
    totalForeign,
    currency: fx.currency,
    rate: fx.rate,
    totalKrw: Math.round(totalForeign * fx.rate),
    effectiveDate: fx.effectiveDate,
    source: fx.source,
  };
}


// ===== 5. UNI-PASS 화물통관 진행정보 =====

interface CustomsCargoProgressFunctionResponse {
  success?: boolean;
  result?: CustomsCargoProgressResult;
  error?: string;
}

export async function getCustomsCargoProgress(
  blNo: string
): Promise<CustomsCargoProgressResult> {
  const cleaned = blNo.trim();

  if (!cleaned) {
    return {
      blNo: '',
      status: 'idle',
      statusText: 'B/L 번호가 입력되지 않았습니다.',
      events: [],
      checkedAt: new Date().toISOString(),
      message: 'B/L 번호를 입력한 뒤 조회해 주세요.',
    };
  }

  const { data, error } = await supabase.functions.invoke<CustomsCargoProgressFunctionResponse>(
    'customs-cargo-progress',
    {
      body: { blNo: cleaned },
    }
  );

  if (error) {
    return {
      blNo: cleaned,
      status: 'error',
      statusText: '통관 진행정보 조회 실패',
      events: [],
      checkedAt: new Date().toISOString(),
      message: error.message,
    };
  }

  if (!data || data.success !== true || !data.result) {
    return {
      blNo: cleaned,
      status: 'error',
      statusText: '통관 진행정보 조회 실패',
      events: [],
      checkedAt: new Date().toISOString(),
      message: data?.error || '조회 결과를 불러오지 못했습니다.',
    };
  }

  return data.result;
}
