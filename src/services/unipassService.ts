/**
 * UNI-PASS Open API 서비스 (관세청 전자통관)
 *
 * 발급 완료 키 4종 (2026-07-02, 서비스별 개별 키):
 *  1. 관세율기본조회 (trrtQry)                 → getTariffRates
 *  2. 수출입요건승인내역조회 (xtrnUserReqApreBrkdQry) → getRequirementApproval
 *  3. 화물통관진행정보조회 (cargCsclPrgsInfoQry)     → getCargoProgress
 *  4. 수출신고번호별수출이행내역조회 (expDclrNoPrExpFfmnBrkdQry) → getExportFulfillment
 *
 * ⚠ CORS: UNI-PASS(38010 포트)는 Access-Control-Allow-Origin 미제공.
 *  - 로컬 개발: vite.config.ts의 '/unipass-api' 프록시 경유 → 실데이터
 *  - 배포(GitHub Pages): 직호출 불가 → 시뮬레이션 폴백
 *  - 실서비스: 백엔드(Express) 프록시로 전환 예정
 */

import type { DataSource } from './customsApiService';

// ===== 키 관리 (localStorage, 테스트 환경 가드) =====

const storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> =
  typeof localStorage !== 'undefined'
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

export type UnipassKeyId = 'tariff' | 'requirement' | 'cargo' | 'fulfillment';

const KEY_PREFIX = 'portai_unipass_';

export function setUnipassKey(id: UnipassKeyId, key: string): void {
  storage.setItem(KEY_PREFIX + id, key);
}
export function getUnipassKey(id: UnipassKeyId): string | null {
  return storage.getItem(KEY_PREFIX + id);
}
export function hasUnipassKey(id: UnipassKeyId): boolean {
  const k = getUnipassKey(id);
  return !!k && k.length > 10;
}
export function clearUnipassKey(id: UnipassKeyId): void {
  storage.removeItem(KEY_PREFIX + id);
}

// ===== 공통 =====

/** 개발 서버에서는 Vite 프록시 경유, 그 외에는 직호출 시도(대부분 CORS 실패 → 폴백) */
function baseUrl(): string {
  const isDev =
    typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  return isDev ? '/unipass-api/ext/rest' : 'https://unipass.customs.go.kr:38010/ext/rest';
}

function parseXmlItems(xml: string, itemTag: string): Record<string, string>[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  return Array.from(doc.getElementsByTagName(itemTag)).map((item) => {
    const rec: Record<string, string> = {};
    Array.from(item.children).forEach((c) => {
      rec[c.tagName] = c.textContent ?? '';
    });
    return rec;
  });
}

// ===== 1. 관세율 기본조회 =====

export interface TariffRate {
  hsCode: string;
  typeCode: string; // A: 기본세율, C: WTO협정 등
  typeName: string;
  rate: number; // %
  applyStart: string; // yyyyMMdd
  applyEnd: string;
  source: DataSource;
}

/** HSK 10자리 → 세율 목록 (기본/WTO/FTA 등). 실패 시 시뮬레이션. */
export async function getTariffRates(hsCode: string): Promise<TariffRate[]> {
  const key = getUnipassKey('tariff');
  const cleaned = hsCode.replace(/[^0-9]/g, '');

  if (key && cleaned.length === 10) {
    try {
      const url = `${baseUrl()}/trrtQry/retrieveTrrt?crkyCn=${encodeURIComponent(key)}&hsSgn=${cleaned}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`관세율 API 오류 (${res.status})`);
      const items = parseXmlItems(await res.text(), 'trrtQryRsltVo');
      const rates = items.map((i) => ({
        hsCode: cleaned,
        typeCode: i.trrtTpcd || '',
        typeName: i.trrtTpNm || '',
        rate: parseFloat(i.trrt || '0'),
        applyStart: i.aplyStrtDt || '',
        applyEnd: i.aplyEndDt || '',
        source: 'api' as DataSource,
      }));
      if (rates.length > 0) return rates;
      throw new Error('세율 데이터 없음');
    } catch (err) {
      console.warn('UNI-PASS 관세율 API 실패, 시뮬레이션 폴백:', err);
    }
  }

  // 시뮬레이션: 기본세율 8% (공산품 일반적 기본세율)
  return [
    {
      hsCode: cleaned,
      typeCode: 'A',
      typeName: '기본세율',
      rate: 8,
      applyStart: '20260101',
      applyEnd: '20261231',
      source: 'simulation',
    },
  ];
}

/** 세율 목록에서 대표 세율 선택: 기본세율(A) 우선, 없으면 첫 항목 */
export function pickBasicRate(rates: TariffRate[]): TariffRate | null {
  if (rates.length === 0) return null;
  return rates.find((r) => r.typeCode === 'A') ?? rates[0];
}

// ===== 2. 수출입 요건승인내역 조회 =====

export interface RequirementApproval {
  approvalNo: string;
  approvalCondition: string;
  issueDate: string;
  formName: string; // 관련서식명 (예: 화학물질확인증명서)
  relatedLaw: string;
  validUntil: string;
  source: DataSource;
}

/**
 * 요건승인번호로 승인내역 조회 (imexTpcd — I: 수입, E: 수출).
 * 주의: HS코드 → 필요요건 판단용이 아니라 이미 발급된 승인 확인용.
 */
export async function getRequirementApproval(
  approvalNo: string,
  imexTpcd: 'I' | 'E'
): Promise<RequirementApproval | null> {
  const key = getUnipassKey('requirement');
  const cleaned = approvalNo.trim();
  if (!cleaned) return null;

  if (key) {
    try {
      const url =
        `${baseUrl()}/xtrnUserReqApreBrkdQry/retrieveXtrnUserReqApreBrkd` +
        `?crkyCn=${encodeURIComponent(key)}&imexTpcd=${imexTpcd}&reqApreNo=${encodeURIComponent(cleaned)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`요건승인 API 오류 (${res.status})`);
      const tag = imexTpcd === 'I' ? 'xtrnUserImpReqApreBrkdQryRsltVo' : 'xtrnUserExpReqApreBrkdQryRsltVo';
      const items = parseXmlItems(await res.text(), tag);
      const hit = items[0];
      if (hit) {
        return {
          approvalNo: hit.reqApreNo || cleaned,
          approvalCondition: hit.apreCond || '',
          issueDate: hit.issDt || '',
          formName: hit.relaFrmlNm || '',
          relatedLaw: hit.relaLwor || '',
          validUntil: hit.valtPrid || '',
          source: 'api',
        };
      }
      return null; // 조회 결과 없음 = 유효하지 않은 승인번호
    } catch (err) {
      console.warn('UNI-PASS 요건승인 API 실패, 시뮬레이션 폴백:', err);
    }
  }

  // 시뮬레이션: 형식만 통과 처리
  return {
    approvalNo: cleaned,
    approvalCondition: '(시뮬레이션) 전자문서에 의해 확인할 것',
    issueDate: '20260101',
    formName: '(시뮬레이션) 요건승인서',
    relatedLaw: '',
    validUntil: '20261231',
    source: 'simulation',
  };
}

// ===== 3. 화물통관 진행정보 조회 =====

export interface CargoProgress {
  cargoNo: string;
  status: string; // 통관진행상태
  progressDetail: string;
  arrivalPort: string;
  source: DataSource;
}

/** 화물관리번호 또는 B/L번호로 통관 진행상태 조회 */
export async function getCargoProgress(blNo: string, blYear?: string): Promise<CargoProgress | null> {
  const key = getUnipassKey('cargo');
  const cleaned = blNo.trim();
  if (!cleaned) return null;

  if (key) {
    try {
      const yy = blYear ?? String(new Date().getFullYear());
      const url =
        `${baseUrl()}/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo` +
        `?crkyCn=${encodeURIComponent(key)}&blYy=${yy}&hblNo=${encodeURIComponent(cleaned)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`화물통관 API 오류 (${res.status})`);
      const items = parseXmlItems(await res.text(), 'cargCsclPrgsInfoQryVo');
      const hit = items[0];
      if (hit) {
        return {
          cargoNo: hit.cargMtNo || cleaned,
          status: hit.csclPrgsStts || '',
          progressDetail: hit.prgsStts || '',
          arrivalPort: hit.dsprNm || '',
          source: 'api',
        };
      }
      return null;
    } catch (err) {
      console.warn('UNI-PASS 화물통관 API 실패:', err);
    }
  }

  return null; // 화물추적은 시뮬 의미 없음 — 키 없으면 미지원 처리
}

// ===== 4. 수출이행내역 조회 =====

export interface ExportFulfillment {
  declarationNo: string;
  shipmentCompleted: boolean;
  acceptDate: string;
  loadDeadline: string;
  source: DataSource;
}

/** 수출신고번호 → 선적 이행 여부 (적재의무기한 관리) */
export async function getExportFulfillment(declarationNo: string): Promise<ExportFulfillment | null> {
  const key = getUnipassKey('fulfillment');
  const cleaned = declarationNo.replace(/[^0-9]/g, '');
  if (!cleaned) return null;

  if (key) {
    try {
      const url =
        `${baseUrl()}/expDclrNoPrExpFfmnBrkdQry/retrieveExpDclrNoPrExpFfmnBrkd` +
        `?crkyCn=${encodeURIComponent(key)}&expDclrNo=${cleaned}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`수출이행 API 오류 (${res.status})`);
      const items = parseXmlItems(await res.text(), 'expDclrNoPrExpFfmnBrkdQryRsltVo');
      const hit = items[0];
      if (hit) {
        return {
          declarationNo: cleaned,
          shipmentCompleted: hit.shpmCmplYn === 'Y',
          acceptDate: hit.acptDt || '',
          loadDeadline: hit.loadDtyTmlm || '',
          source: 'api',
        };
      }
      return null;
    } catch (err) {
      console.warn('UNI-PASS 수출이행 API 실패:', err);
    }
  }

  return null;
}

// ===== 예상 관세 계산 헬퍼 =====

export interface EstimatedDuty {
  hsCode: string;
  dutiableValueKrw: number; // 원화 과세가격
  rate: number; // 적용 세율 %
  rateName: string;
  estimatedDutyKrw: number; // 예상 관세액
  source: DataSource;
}

/** 원화 과세가격 × 기본세율 → 예상 관세액 */
export async function estimateDuty(hsCode: string, dutiableValueKrw: number): Promise<EstimatedDuty | null> {
  if (dutiableValueKrw <= 0) return null;
  const rates = await getTariffRates(hsCode);
  const basic = pickBasicRate(rates);
  if (!basic) return null;
  return {
    hsCode: basic.hsCode,
    dutiableValueKrw,
    rate: basic.rate,
    rateName: basic.typeName,
    estimatedDutyKrw: Math.round(dutiableValueKrw * (basic.rate / 100)),
    source: basic.source,
  };
}
