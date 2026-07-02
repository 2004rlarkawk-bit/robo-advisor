/**
 * 공공 API 서비스 (관세청 GW / 국세청)
 *
 * 발급 완료 키 기준 (data.go.kr, 2026-07):
 *  - 관세청_관세환율정보(GW)            → getCustomsExchangeRate
 *  - 국세청_사업자등록정보 진위확인/상태조회 → verifyBusinessRegistration
 *  - 관세청_품목별 수출입실적(GW)        → getItemTradeStats
 *  - 관세청_수출입총괄 / 국가별 / 품목별국가별 / 성질별 → (2차 확장 예정)
 *
 * claudeService.ts 패턴 답습:
 *  - 키는 localStorage 보관 (Settings 페이지에서 입력)
 *  - 호출 실패(CORS/네트워크/키없음) 시 시뮬레이션 폴백 → 데모 항상 동작
 *
 * 주의: data.go.kr 일부 엔드포인트는 브라우저 CORS 차단 가능.
 * 차단 확인 시 백엔드 프록시(팀원4 Express) 경유로 전환.
 */

// ===== 키 관리 =====

const KEY_DATA_GO_KR = 'portai_data_go_kr_key'; // 관세청 GW 공통 (환율·통계)
const KEY_NTS_BUSINESS = 'portai_nts_business_key'; // 국세청 사업자 진위확인

export function setDataGoKrKey(key: string): void {
  localStorage.setItem(KEY_DATA_GO_KR, key);
}
export function getDataGoKrKey(): string | null {
  return localStorage.getItem(KEY_DATA_GO_KR);
}
export function hasDataGoKrKey(): boolean {
  const k = getDataGoKrKey();
  return !!k && k.length > 10;
}
export function clearDataGoKrKey(): void {
  localStorage.removeItem(KEY_DATA_GO_KR);
}

export function setNtsBusinessKey(key: string): void {
  localStorage.setItem(KEY_NTS_BUSINESS, key);
}
export function getNtsBusinessKey(): string | null {
  return localStorage.getItem(KEY_NTS_BUSINESS);
}
export function hasNtsBusinessKey(): boolean {
  const k = getNtsBusinessKey();
  return !!k && k.length > 10;
}
export function clearNtsBusinessKey(): void {
  localStorage.removeItem(KEY_NTS_BUSINESS);
}

// ===== 공통 =====

/** 데이터 소스 표시: 실 API 응답인지 시뮬레이션 폴백인지 UI에서 구분 */
export type DataSource = 'api' | 'simulation';

const BASE_1220000 = 'https://apis.data.go.kr/1220000';

/** yyyyMMdd */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** XML 응답에서 태그 배열 추출 (관세청 GW는 XML 기본) */
function xmlItems(xml: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.getElementsByTagName('item')).map((item) => {
    const rec: Record<string, string> = {};
    Array.from(item.children).forEach((c) => {
      rec[c.tagName] = c.textContent ?? '';
    });
    return rec;
  });
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

/**
 * 관세청 주간 적용환율 조회.
 * 통관 과세가격 환산은 이 환율이 기준 (한국은행 매매기준율 아님).
 */
export async function getCustomsExchangeRate(
  currency: string,
  tradeType: 'export' | 'import' = 'import',
  date?: string
): Promise<ExchangeRate> {
  const key = getDataGoKrKey();
  const aplyBgnDt = date ?? toYmd(new Date());
  // 1: 수출(관세환급), 2: 수입(과세환율)
  const tpcd = tradeType === 'export' ? '1' : '2';

  if (key) {
    try {
      const url =
        `${BASE_1220000}/retrieveTrifFxrtInfo/getRetrieveTrifFxrtInfo` +
        `?serviceKey=${encodeURIComponent(key)}&aplyBgnDt=${aplyBgnDt}&weekFxrtTpcd=${tpcd}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`환율 API 오류 (${res.status})`);
      const items = xmlItems(await res.text());
      const hit = items.find((i) => i.currSgn === currency.toUpperCase());
      if (hit) {
        return {
          currency: hit.currSgn,
          currencyName: hit.mtryUtNm || hit.currKorNm || '',
          rate: parseFloat(hit.fxrt),
          effectiveDate: hit.aplyBgnDt || aplyBgnDt,
          tradeType,
          source: 'api',
        };
      }
      throw new Error(`통화 ${currency} 미발견`);
    } catch (err) {
      console.warn('관세환율 API 실패, 시뮬레이션 폴백:', err);
    }
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
    rate: hit.rate,
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

/**
 * 국세청 사업자등록 상태조회 (api.odcloud.kr — CORS 허용, POST JSON).
 * 진위확인(validate)은 대표자명·개업일 필요해서 상태조회(status)만 사용.
 */
export async function verifyBusinessRegistration(bizNo: string): Promise<BusinessStatus> {
  const key = getNtsBusinessKey();
  const cleaned = bizNo.replace(/[^0-9]/g, '');

  if (cleaned.length !== 10) {
    return {
      bizNo: cleaned,
      valid: false,
      statusText: '사업자등록번호는 10자리 숫자여야 합니다.',
      source: 'simulation',
    };
  }

  if (key) {
    try {
      const url = `https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b_no: [cleaned] }),
      });
      if (!res.ok) throw new Error(`사업자 API 오류 (${res.status})`);
      const data = await res.json();
      const item = data?.data?.[0];
      if (item) {
        const stt: string = item.b_stt || '';
        return {
          bizNo: cleaned,
          valid: stt === '계속사업자',
          statusText: stt || '국세청에 등록되지 않은 사업자등록번호입니다.',
          taxType: item.tax_type,
          source: 'api',
        };
      }
      throw new Error('응답 데이터 없음');
    } catch (err) {
      console.warn('사업자 진위확인 API 실패, 시뮬레이션 폴백:', err);
    }
  }

  // 시뮬레이션: 체크섬 검증만 수행 (국세청 사업자번호 검증 로직)
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
      ? '형식 유효 (시뮬레이션 — 실제 등록 여부는 API 키 설정 후 확인 가능)'
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
  // JPY 등 100단위 통화 처리: 관세청 응답은 이미 1단위 환산 기준이므로 그대로 곱함
  return {
    totalForeign,
    currency: fx.currency,
    rate: fx.rate,
    totalKrw: Math.round(totalForeign * fx.rate),
    effectiveDate: fx.effectiveDate,
    source: fx.source,
  };
}
