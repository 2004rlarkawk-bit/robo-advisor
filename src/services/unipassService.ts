/**
 * UNI-PASS Open API 서비스 (관세청 전자통관)
 *
 * Supabase Edge Function 4종:
 *  1. 관세율기본조회 (trrtQry)                 → getTariffRates
 *  2. 수출입요건승인내역조회 (xtrnUserReqApreBrkdQry) → getRequirementApproval
 *  3. 화물통관진행정보조회 (cargCsclPrgsInfoQry)     → getCargoProgress
 *  4. 수출신고번호별수출이행내역조회 (expDclrNoPrExpFfmnBrkdQry) → getExportFulfillment
 *
 * 브라우저는 UNI-PASS를 직접 호출하지 않고 배포된 Edge Function만 호출한다.
 */

import type { DataSource } from './customsApiService';
import { supabase } from '../lib/supabase';

// ===== 공통 =====

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertEdgeSuccess(data: unknown, fallbackMessage: string): asserts data is Record<string, unknown> {
  if (!isRecord(data) || data.success !== true) {
    throw new Error(
      isRecord(data) && typeof data.error === 'string' ? data.error : fallbackMessage
    );
  }
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
  const cleaned = hsCode.replace(/[^0-9]/g, '');

  if (cleaned.length === 10) {
    try {
      const { data, error } = await supabase.functions.invoke('unipass-tariff-basic', {
        body: { hsCode: cleaned },
      });
      if (error) throw error;
      assertEdgeSuccess(data, '관세율 Edge Function 호출에 실패했습니다.');
      if (!Array.isArray(data.rates) || data.rates.length === 0) {
        throw new Error('관세율 Edge Function 응답에 세율 목록이 없습니다.');
      }

      return data.rates.map((value) => {
        if (
          !isRecord(value) ||
          typeof value.hsCode !== 'string' ||
          typeof value.typeCode !== 'string' ||
          typeof value.typeName !== 'string' ||
          typeof value.rate !== 'number' ||
          !Number.isFinite(value.rate) ||
          typeof value.applyStart !== 'string' ||
          typeof value.applyEnd !== 'string' ||
          value.source !== 'api'
        ) {
          throw new Error('관세율 Edge Function 응답 형식이 올바르지 않습니다.');
        }
        return {
          hsCode: value.hsCode,
          typeCode: value.typeCode,
          typeName: value.typeName,
          rate: value.rate,
          applyStart: value.applyStart,
          applyEnd: value.applyEnd,
          source: 'api' as DataSource,
        };
      });
    } catch (err) {
      console.warn('UNI-PASS 관세율 Edge Function 호출 실패, 시뮬레이션 폴백:', err);
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
  const cleaned = approvalNo.trim();
  if (!cleaned) return null;

  try {
    const { data, error } = await supabase.functions.invoke('unipass-requirement-approval', {
      body: { approvalNo: cleaned, imexTpcd },
    });
    if (error) throw error;
    assertEdgeSuccess(data, '요건승인 Edge Function 호출에 실패했습니다.');
    if (typeof data.found !== 'boolean') {
      throw new Error('요건승인 Edge Function 응답 형식이 올바르지 않습니다.');
    }
    if (!data.found || data.data === null) return null;
    const value = data.data;
    if (
      !isRecord(value) ||
      typeof value.approvalNo !== 'string' ||
      typeof value.approvalCondition !== 'string' ||
      typeof value.issueDate !== 'string' ||
      typeof value.formName !== 'string' ||
      typeof value.relatedLaw !== 'string' ||
      typeof value.validUntil !== 'string' ||
      value.source !== 'api'
    ) {
      throw new Error('요건승인 Edge Function 응답 데이터가 올바르지 않습니다.');
    }
    return {
      approvalNo: value.approvalNo,
      approvalCondition: value.approvalCondition,
      issueDate: value.issueDate,
      formName: value.formName,
      relatedLaw: value.relatedLaw,
      validUntil: value.validUntil,
      source: 'api',
    };
  } catch (err) {
    console.warn('UNI-PASS 요건승인 Edge Function 호출 실패, 시뮬레이션 폴백:', err);
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
  const cleaned = blNo.trim();
  if (!cleaned) return null;
  const year = blYear ?? String(new Date().getFullYear());

  try {
    const { data, error } = await supabase.functions.invoke('unipass-cargo-clearance', {
      body: { blNo: cleaned, blYear: year },
    });
    if (error) throw error;
    assertEdgeSuccess(data, '화물통관 Edge Function 호출에 실패했습니다.');
    if (typeof data.found !== 'boolean') {
      throw new Error('화물통관 Edge Function 응답 형식이 올바르지 않습니다.');
    }
    if (!data.found || data.data === null) return null;
    const value = data.data;
    if (
      !isRecord(value) ||
      typeof value.cargoNo !== 'string' ||
      typeof value.status !== 'string' ||
      typeof value.progressDetail !== 'string' ||
      typeof value.arrivalPort !== 'string' ||
      value.source !== 'api'
    ) {
      throw new Error('화물통관 Edge Function 응답 데이터가 올바르지 않습니다.');
    }
    return {
      cargoNo: value.cargoNo,
      status: value.status,
      progressDetail: value.progressDetail,
      arrivalPort: value.arrivalPort,
      source: 'api',
    };
  } catch (err) {
    console.warn('UNI-PASS 화물통관 Edge Function 호출 실패:', err);
  }

  return null; // 화물추적은 시뮬레이션 의미가 없음
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
  const cleaned = declarationNo.replace(/[^0-9]/g, '');
  if (!cleaned) return null;

  try {
    const { data, error } = await supabase.functions.invoke('unipass-export-fulfillment', {
      body: { declarationNo: cleaned },
    });
    if (error) throw error;
    assertEdgeSuccess(data, '수출이행 Edge Function 호출에 실패했습니다.');
    if (typeof data.found !== 'boolean') {
      throw new Error('수출이행 Edge Function 응답 형식이 올바르지 않습니다.');
    }
    if (!data.found || data.data === null) return null;
    const value = data.data;
    if (
      !isRecord(value) ||
      typeof value.declarationNo !== 'string' ||
      typeof value.shipmentCompleted !== 'boolean' ||
      typeof value.acceptDate !== 'string' ||
      typeof value.loadDeadline !== 'string' ||
      value.source !== 'api'
    ) {
      throw new Error('수출이행 Edge Function 응답 데이터가 올바르지 않습니다.');
    }
    return {
      declarationNo: value.declarationNo,
      shipmentCompleted: value.shipmentCompleted,
      acceptDate: value.acceptDate,
      loadDeadline: value.loadDeadline,
      source: 'api',
    };
  } catch (err) {
    console.warn('UNI-PASS 수출이행 Edge Function 호출 실패:', err);
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
