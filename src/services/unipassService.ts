/** UNI-PASS 조회는 Supabase Edge Function을 통해서만 수행한다. */
import type { DataSource } from './customsApiService';
import { supabase } from '../lib/supabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertEdgeSuccess(data: unknown, fallbackMessage: string): asserts data is Record<string, unknown> {
  if (!isRecord(data) || data.success !== true) {
    throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : fallbackMessage);
  }
}

export interface TariffRate {
  hsCode: string;
  typeCode: string;
  typeName: string;
  rate: number;
  applyStart: string;
  applyEnd: string;
  source: DataSource;
}

export async function getTariffRates(hsCode: string): Promise<TariffRate[]> {
  const cleaned = hsCode.replace(/[^0-9]/g, '');
  if (cleaned.length !== 10) throw new Error('HS Code는 10자리 숫자여야 합니다.');

  const { data, error } = await supabase.functions.invoke('unipass-tariff-basic', {
    body: { hsCode: cleaned },
  });
  if (error) throw error;
  assertEdgeSuccess(data, '관세율 Edge Function 호출에 실패했습니다.');
  if (!Array.isArray(data.rates) || data.rates.length === 0) {
    throw new Error('조회된 관세율이 없습니다.');
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
}

export function pickBasicRate(rates: TariffRate[]): TariffRate | null {
  if (rates.length === 0) return null;
  return rates.find((rate) => rate.typeCode === 'A') ?? rates[0];
}

export interface RequirementApproval {
  approvalNo: string;
  approvalCondition: string;
  issueDate: string;
  formName: string;
  relatedLaw: string;
  validUntil: string;
  source: DataSource;
}

export async function getRequirementApproval(
  approvalNo: string,
  imexTpcd: 'I' | 'E'
): Promise<RequirementApproval | null> {
  const cleaned = approvalNo.trim();
  if (!cleaned) return null;
  const { data, error } = await supabase.functions.invoke('unipass-requirement-approval', {
    body: { approvalNo: cleaned, imexTpcd },
  });
  if (error) throw error;
  assertEdgeSuccess(data, '요건승인 Edge Function 호출에 실패했습니다.');
  if (typeof data.found !== 'boolean') throw new Error('요건승인 Edge Function 응답 형식이 올바르지 않습니다.');
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
}

export interface CargoProgress {
  cargoNo: string;
  status: string;
  progressDetail: string;
  arrivalPort: string;
  source: DataSource;
}

export async function getCargoProgress(blNo: string, blYear?: string): Promise<CargoProgress | null> {
  const cleaned = blNo.trim();
  if (!cleaned) return null;
  const year = blYear ?? String(new Date().getFullYear());
  const { data, error } = await supabase.functions.invoke('unipass-cargo-clearance', {
    body: { blNo: cleaned, blYear: year },
  });
  if (error) throw error;
  assertEdgeSuccess(data, '화물통관 Edge Function 호출에 실패했습니다.');
  if (typeof data.found !== 'boolean') throw new Error('화물통관 Edge Function 응답 형식이 올바르지 않습니다.');
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
}

export interface ExportFulfillment {
  declarationNo: string;
  shipmentCompleted: boolean;
  acceptDate: string;
  loadDeadline: string;
  source: DataSource;
}

export async function getExportFulfillment(declarationNo: string): Promise<ExportFulfillment | null> {
  const cleaned = declarationNo.replace(/[^0-9]/g, '');
  if (!cleaned) return null;
  try {
    const { data, error } = await supabase.functions.invoke('unipass-export-fulfillment', {
      body: { declarationNo: cleaned },
    });
    if (error) throw error;
    assertEdgeSuccess(data, '수출이행 Edge Function 호출에 실패했습니다.');
    if (typeof data.found !== 'boolean') throw new Error('수출이행 Edge Function 응답 형식이 올바르지 않습니다.');
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
  } catch (error) {
    console.warn('UNI-PASS 수출이행 Edge Function 호출 실패:', error);
    return null;
  }
}

export interface EstimatedDuty {
  hsCode: string;
  dutiableValueKrw: number;
  rate: number;
  rateName: string;
  estimatedDutyKrw: number;
  source: DataSource;
}

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
