/**
 * 규칙 엔진 - Incoterms별 서류 분기 포함
 */
import { TradeProfile, DocumentStatus } from '../types';
import { getIncotermsRule } from '../agents/incotermsRules';

export function determineRequiredDocuments(profile: TradeProfile): DocumentStatus[] {
  const docs: DocumentStatus[] = [];
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const rule = getIncotermsRule(profile.incoterms);

  // 1. 상업송장 (Commercial Invoice) - 항상 필수
  const hasInvoiceInfo = !!(profile.itemName && profile.companyName && profile.incoterms);
  docs.push({
    id: 'invoice',
    name: '상업송장(Invoice)',
    status: hasInvoiceInfo ? 'completed' : 'not_started',
    statusText: hasInvoiceInfo ? '생성 완료' : '작성 필요',
    lastReviewed: hasInvoiceInfo ? timestamp : undefined
  });

  // 2. 패킹리스트 (Packing List) - 항상 필수
  const hasPackingInfo = profile.quantity !== '' && Number(profile.quantity) > 0;
  const hasWeightInfo = profile.weight !== '' && Number(profile.weight) > 0;
  
  let packingStatus: DocumentStatus['status'] = 'not_started';
  let packingStatusText = '작성 필요';
  
  if (hasPackingInfo && hasWeightInfo) {
    packingStatus = 'completed';
    packingStatusText = '생성 완료';
  } else if (hasPackingInfo && !hasWeightInfo) {
    packingStatus = 'review_required';
    packingStatusText = '검토 필요';
  }
  
  docs.push({
    id: 'packing_list',
    name: '패킹리스트(Packing List)',
    status: packingStatus,
    statusText: packingStatusText,
    lastReviewed: hasPackingInfo ? timestamp : undefined
  });

  // 3. 선하증권 (B/L) - EXW에서는 선택적 (매도인 필수 제외)
  const hasBLInfo = !!(profile.loadPort && profile.dischargePort);
  const isEXW = profile.incoterms === 'EXW';
  
  if (isEXW) {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: 'not_needed',
      statusText: 'EXW 조건 - 매수인 측 처리'
    });
  } else {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: hasBLInfo ? 'completed' : 'not_started',
      statusText: hasBLInfo ? '생성 완료' : '작성 필요',
      lastReviewed: hasBLInfo ? timestamp : undefined
    });
  }

  // 4. 통관신고서 - 항상 필수
  const hasHSCode = !!profile.hsCode;
  const cleanCode = profile.hsCode.replace(/[-.\s]/g, '');
  const isHSCodeNumeric = /^\d+$/.test(cleanCode);
  const isHSCodeValid = hasHSCode && isHSCodeNumeric && cleanCode.length >= 6;
  
  let customsStatus: DocumentStatus['status'] = 'not_started';
  let customsStatusText = '작성 필요';

  if (hasHSCode) {
    if (isHSCodeValid) {
      customsStatus = 'completed';
      customsStatusText = '생성 완료';
    } else {
      customsStatus = 'review_required';
      customsStatusText = '검토 필요';
    }
  }

  docs.push({
    id: 'customs_dec',
    name: '통관신고 관련 서류',
    status: customsStatus,
    statusText: customsStatusText,
    lastReviewed: hasHSCode ? timestamp : undefined
  });

  // 5. 원산지증명서 (C/O) - 수출의 경우 필수
  // 사용자가 발급 요청을 확인(coIssuanceConfirmed)하면 완료 처리 (validatorEngine co-required 룰과 동일 기준).
  // TODO: FTA 협정세율 적용 희망 여부 등 실제 원산지 판정 로직으로 고도화 예정.
  const isExport = profile.tradeType === 'export';
  const isCOCompleted = isExport && !!profile.coIssuanceConfirmed;
  docs.push({
    id: 'co',
    name: '원산지증명서(C/O)',
    status: isExport ? (isCOCompleted ? 'completed' : 'not_started') : 'not_needed',
    statusText: isExport ? (isCOCompleted ? '생성 완료' : '작성 필요') : '해당 없음',
    lastReviewed: isCOCompleted ? timestamp : undefined
  });

  // 6. 보험증서 (Insurance) - CIF 조건일 때만 필수 (규칙 매트릭스 참조)
  if (rule && rule.requiredDocuments.includes('insurance')) {
    docs.push({
      id: 'insurance',
      name: '적하보험증권(Insurance Policy)',
      status: profile.insuranceConfirmed ? 'completed' : 'not_started',
      statusText: profile.insuranceConfirmed ? '준비 완료 확인됨' : 'CIF 조건 - 준비 필요',
      lastReviewed: profile.insuranceConfirmed ? timestamp : undefined,
    });
  }

  return docs;
}

// 서류별로 "무엇을 채우면 완료되는지" 안내 문구 — 준비도 카드의 다음 단계 힌트에 사용
const NEXT_STEP_HINTS: Record<string, string> = {
  invoice: '품목명·업체명·거래조건을 입력하면 상업송장이 완료돼요',
  packing_list: '수량과 중량을 입력하면 패킹리스트가 완료돼요',
  bl: '선적항과 도착항을 입력하면 선하증권 준비가 완료돼요',
  customs_dec: '정확한 HS Code(6자리 이상 숫자)를 입력하면 통관신고서가 완료돼요',
  co: '원산지증명서 발급 확인 체크박스를 선택하면 완료돼요',
  insurance: '적하보험 준비 확인 체크박스를 선택하면 완료돼요',
};

export interface ReadinessInfo {
  percent: number;
  completedCount: number;
  applicableCount: number;
  nextStepDocId?: string;
  nextStepLabel?: string;
}

/**
 * 실제 제출 전 준비도 — 해당 없음(not_needed) 서류는 분모에서 제외하고,
 * 완료된 서류 비율(%)과 다음으로 채워야 할 서류의 안내 문구를 계산한다.
 */
export function calculateReadiness(docs: DocumentStatus[]): ReadinessInfo {
  const applicable = docs.filter((d) => d.status !== 'not_needed');
  const completed = applicable.filter((d) => d.status === 'completed');
  const percent = applicable.length > 0 ? Math.round((completed.length / applicable.length) * 100) : 0;
  const nextStepDoc = applicable.find((d) => d.status !== 'completed');

  return {
    percent,
    completedCount: completed.length,
    applicableCount: applicable.length,
    nextStepDocId: nextStepDoc?.id,
    nextStepLabel: nextStepDoc ? (NEXT_STEP_HINTS[nextStepDoc.id] ?? `${nextStepDoc.name}을(를) 완료해 주세요`) : undefined,
  };
}
