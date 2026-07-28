/**
 * 공공 API 서비스 (관세청 GW / 국세청)
 *
 * 공공 API 연결 기준 (2026-07):
 *  - 관세청_관세환율정보(GW)            → Supabase Edge Function 경유
 *  - 국세청_사업자등록정보 진위확인/상태조회 → verifyBusinessRegistration
 *  - 관세청_품목별 수출입실적(GW)        → getItemTradeStats
 *  - 관세청_수출입총괄 / 국가별 / 품목별국가별 / 성질별 → (2차 확장 예정)
 *
 * 수출입 통계 API 호출:
 *  - 키는 localStorage 보관 (Settings 페이지에서 입력)
 *  - 호출 실패(CORS/네트워크/키없음) 시 시뮬레이션 폴백 → 데모 항상 동작
 *
 * 주의: data.go.kr 일부 엔드포인트는 브라우저 CORS 차단 가능.
 * 차단 확인 시 백엔드 프록시(팀원4 Express) 경유로 전환.
 */

import { supabase } from '../lib/supabase';

// ===== 키 관리 =====

const KEY_DATA_GO_KR = 'portai_data_go_kr_key'; // 관세청 GW 수출입 통계용

/** 테스트(node) 환경에는 localStorage가 없음 → 키 없음으로 처리해 시뮬 폴백 유도 */
const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export function setDataGoKrKey(key: string): void {
  storage.setItem(KEY_DATA_GO_KR, key);
}
export function getDataGoKrKey(): string | null {
  return storage.getItem(KEY_DATA_GO_KR);
}
export function hasDataGoKrKey(): boolean {
  const k = getDataGoKrKey();
  return !!k && k.length > 10;
}
export function clearDataGoKrKey(): void {
  storage.removeItem(KEY_DATA_GO_KR);
}

// ===== 공통 =====

/** 데이터 소스 표시: 실 API 응답인지 시뮬레이션 폴백인지 UI에서 구분 */
export type DataSource = 'api' | 'simulation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const BASE_1220000 = 'https://apis.data.go.kr/1220000';

/** yyyyMMdd */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * XML 응답에서 태그 배열 추출 (관세청 GW는 XML 기본).
 * resultCode가 정상(00)이 아니면 throw — 키 만료/인증 실패가
 * "데이터 없음"으로 위장되어 조용히 시뮬 폴백되는 것을 방지.
 */
function xmlItems(xml: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const resultCode = doc.getElementsByTagName('resultCode')[0]?.textContent?.trim();
  if (resultCode && resultCode !== '00') {
    const resultMsg = doc.getElementsByTagName('resultMsg')[0]?.textContent?.trim() ?? '';
    throw new Error(`관세청 GW 오류 (resultCode ${resultCode}): ${resultMsg || '사유 미상 — 키 상태를 확인하세요'}`);
  }
  return Array.from(doc.getElementsByTagName('item')).map((item) => {
    const rec: Record<string, string> = {};
    Array.from(item.children).forEach((c) => {
      rec[c.tagName] = c.textContent ?? '';
    });
    return rec;
  });
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
  period: string; // yyyy.mm
  hsCode: string;
  exportWeight: number; // kg
  exportAmount: number; // USD
  importWeight: number;
  importAmount: number;
  balance: number; // 무역수지 USD
  source: DataSource;
}

/**
 * HS부호 기준 기간별 수출입실적.
 * 대시보드 "수출입 동향" 카드 + 피드백("최근 이 품목 수입 급증") 재료.
 */
export async function getItemTradeStats(
  hsCode: string,
  startYymm: string, // yyyyMM
  endYymm: string
): Promise<ItemTradeStat[]> {
  const key = getDataGoKrKey();
  const cleaned = hsCode.replace(/[^0-9]/g, '');

  if (key && cleaned.length >= 6) {
    try {
      const url =
        `${BASE_1220000}/nitemtrade/getNitemtradeList` +
        `?serviceKey=${encodeURIComponent(key)}&strtYymm=${startYymm}&endYymm=${endYymm}&hsSgn=${cleaned}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`수출입실적 API 오류 (${res.status})`);
      const items = xmlItems(await res.text());
      // 응답 행 = 기간 × 상대국가 breakdown → 기간별로 합산
      const byPeriod = new Map<string, ItemTradeStat>();
      for (const i of items) {
        if (!i.year || i.year === '총계') continue;
        const cur = byPeriod.get(i.year) ?? {
          period: i.year,
          hsCode: cleaned,
          exportWeight: 0,
          exportAmount: 0,
          importWeight: 0,
          importAmount: 0,
          balance: 0,
          source: 'api' as DataSource,
        };
        cur.exportWeight += parseFloat(i.expWgt || '0');
        cur.exportAmount += parseFloat(i.expDlr || '0');
        cur.importWeight += parseFloat(i.impWgt || '0');
        cur.importAmount += parseFloat(i.impDlr || '0');
        cur.balance += parseFloat(i.balPayments || '0');
        byPeriod.set(i.year, cur);
      }
      const stats = [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
      if (stats.length > 0) return stats;
      throw new Error('실적 데이터 없음');
    } catch (err) {
      console.warn('품목별 수출입실적 API 실패, 시뮬레이션 폴백:', err);
    }
  }

  return simulatedTradeStats(cleaned, startYymm, endYymm);
}

function simulatedTradeStats(hsCode: string, startYymm: string, endYymm: string): ItemTradeStat[] {
  // hsCode 기반 결정적 의사난수 → 데모 시 같은 품목은 같은 그래프
  let seed = 0;
  for (const ch of hsCode) seed = (seed * 31 + ch.charCodeAt(0)) % 97;

  const out: ItemTradeStat[] = [];
  let y = parseInt(startYymm.slice(0, 4), 10);
  let m = parseInt(startYymm.slice(4, 6), 10);
  const endY = parseInt(endYymm.slice(0, 4), 10);
  const endM = parseInt(endYymm.slice(4, 6), 10);

  while (y < endY || (y === endY && m <= endM)) {
    const wave = Math.sin((m + seed) / 2) * 0.3 + 1;
    const expAmt = Math.round((500_000 + seed * 20_000) * wave);
    const impAmt = Math.round((420_000 + seed * 15_000) * (2 - wave));
    out.push({
      period: `${y}.${String(m).padStart(2, '0')}`,
      hsCode,
      exportWeight: Math.round(expAmt / 12),
      exportAmount: expAmt,
      importWeight: Math.round(impAmt / 10),
      importAmount: impAmt,
      balance: expAmt - impAmt,
      source: 'simulation',
    });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

// ===== 3-1. 국가별 수출입실적 (관세청 GW, data.go.kr 15101612) =====

export interface CountryTradeStat {
  period: string; // yyyy.mm
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
): Promise<CountryTradeStat[]> {
  const key = getDataGoKrKey();

  if (key) {
    try {
      let url =
        `${BASE_1220000}/nationtrade/getNationtradeList` +
        `?serviceKey=${encodeURIComponent(key)}&strtYymm=${startYymm}&endYymm=${endYymm}`;
      if (countryCode) url += `&cntyCd=${countryCode.toUpperCase()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`국가별 실적 API 오류 (${res.status})`);
      const items = xmlItems(await res.text());
      const stats = items
        .filter((i) => i.year && i.year !== '총계')
        .map((i) => ({
          period: i.year,
          countryCode: i.statCd || '',
          countryName: i.statCdCntnKor1 || '',
          exportCount: parseFloat(i.expCnt || '0'),
          exportAmount: parseFloat(i.expDlr || '0'),
          importCount: parseFloat(i.impCnt || '0'),
          importAmount: parseFloat(i.impDlr || '0'),
          balance: parseFloat(i.balPayments || '0'),
          source: 'api' as DataSource,
        }));
      if (stats.length > 0) return stats;
      throw new Error('실적 데이터 없음');
    } catch (err) {
      console.warn('국가별 수출입실적 API 실패, 시뮬레이션 폴백:', err);
    }
  }

  // 시뮬레이션: 주요 3개국 고정 샘플
  const samples = [
    { countryCode: 'US', countryName: '미국' },
    { countryCode: 'CN', countryName: '중국' },
    { countryCode: 'JP', countryName: '일본' },
  ].filter((s) => !countryCode || s.countryCode === countryCode.toUpperCase());
  return samples.map((s, idx) => ({
    period: `${startYymm.slice(0, 4)}.${startYymm.slice(4, 6)}`,
    ...s,
    exportCount: 100000 - idx * 20000,
    exportAmount: 10_000_000_000 - idx * 2_000_000_000,
    importCount: 120000 - idx * 25000,
    importAmount: 8_000_000_000 - idx * 1_500_000_000,
    balance: 2_000_000_000 - idx * 500_000_000,
    source: 'simulation' as DataSource,
  }));
}

// ===== 3-2. 수출입총괄 (관세청 GW, data.go.kr 15102108) =====

export interface TotalTradeStat {
  period: string; // yyyy.mm
  exportCount: number;
  exportAmount: number; // USD
  importCount: number;
  importAmount: number;
  balance: number;
  source: DataSource;
}

/** 국가 전체 수출입총괄 (월별). 대시보드 상단 요약 카드용. */
export async function getTotalTradeStats(startYymm: string, endYymm: string): Promise<TotalTradeStat[]> {
  const key = getDataGoKrKey();

  if (key) {
    try {
      const url =
        `${BASE_1220000}/Newtrade/getNewtradeList` +
        `?serviceKey=${encodeURIComponent(key)}&strtYymm=${startYymm}&endYymm=${endYymm}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`수출입총괄 API 오류 (${res.status})`);
      const items = xmlItems(await res.text());
      const stats = items
        .filter((i) => i.year && i.year !== '총계')
        .map((i) => ({
          period: i.year,
          exportCount: parseFloat(i.expCnt || '0'),
          exportAmount: parseFloat(i.expDlr || '0'),
          importCount: parseFloat(i.impCnt || '0'),
          importAmount: parseFloat(i.impDlr || '0'),
          balance: parseFloat(i.balPayments || '0'),
          source: 'api' as DataSource,
        }))
        .sort((a, b) => a.period.localeCompare(b.period));
      if (stats.length > 0) return stats;
      throw new Error('실적 데이터 없음');
    } catch (err) {
      console.warn('수출입총괄 API 실패, 시뮬레이션 폴백:', err);
    }
  }

  return [
    {
      period: `${startYymm.slice(0, 4)}.${startYymm.slice(4, 6)}`,
      exportCount: 1_000_000,
      exportAmount: 65_000_000_000,
      importCount: 4_900_000,
      importAmount: 57_000_000_000,
      balance: 8_000_000_000,
      source: 'simulation',
    },
  ];
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

/** 인보이스 외화금액 → 관세청 주간환율 기준 원화 과세가격 */
export async function calcDutiableValue(
  totalForeign: number,
  currency: string,
  tradeType: 'export' | 'import' = 'import'
): Promise<DutiableValueResult> {
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
