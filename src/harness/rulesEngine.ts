/**
 * 규칙 엔진 - Incoterms별 서류 분기 포함
 */
import { TradeProfile, DocumentStatus } from '../types';
import { getIncotermsRule } from '../agents/incotermsRules';

export function determineRequiredDocuments(
  profile: TradeProfile
): DocumentStatus[] {
  const docs: DocumentStatus[] = [];

  const now = new Date();
  const timestamp =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, '0')}-` +
    `${String(now.getDate()).padStart(2, '0')} ` +
    `${String(now.getHours()).padStart(2, '0')}:` +
    `${String(now.getMinutes()).padStart(2, '0')}`;

  const rule = getIncotermsRule(profile.incoterms);

  // 1. 상업송장(Commercial Invoice)
  // 화주가 직접 생성하는 기본 문서이므로 항상 필요하다.
  const hasInvoiceInfo = Boolean(
    profile.itemName &&
    profile.companyName &&
    profile.incoterms
  );

  docs.push({
    id: 'invoice',
    name: '상업송장(Invoice)',
    status: hasInvoiceInfo
      ? 'completed'
      : 'not_started',
    statusText: hasInvoiceInfo
      ? '생성 완료'
      : '작성 필요',
    lastReviewed: hasInvoiceInfo
      ? timestamp
      : undefined,
  });

  // 2. 패킹리스트(Packing List)
  // 수량과 중량이 모두 입력되어야 생성 완료로 처리한다.
  const hasPackingInfo =
    profile.quantity !== '' &&
    Number(profile.quantity) > 0;

  const hasWeightInfo =
    profile.weight !== '' &&
    Number(profile.weight) > 0;

  let packingStatus: DocumentStatus['status'] =
    'not_started';

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
    lastReviewed: hasPackingInfo
      ? timestamp
      : undefined,
  });

  // 3. 선하증권(B/L)
  // B/L은 포워더 또는 선사가 발행하므로 화주가 직접 생성하지 않는다.
  // EXW에서는 매수인 측이 운송을 주도하므로 해당 없음으로 처리한다.
  const isEXW = profile.incoterms === 'EXW';

  if (isEXW) {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: 'not_needed',
      statusText: 'EXW 조건 - 매수인 측 처리',
    });
  } else {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: 'external_pending',
      statusText: '포워더 발행 대기',
    });
  }

  // 4. 통관신고 관련 서류
  // 수출신고필증·수입신고필증 등은 관세사 또는 신고인이
  // 세관 신고를 진행한 후 발급받는 서류다.
  // 화주가 이 화면에서 직접 생성하는 문서가 아니므로
  // external_pending으로 처리하고 준비도 계산에서도 제외한다.
  docs.push({
    id: 'customs_dec',
    name:
      profile.tradeType === 'export'
        ? '수출신고 관련 서류'
        : '수입신고 관련 서류',
    status: 'external_pending',
    statusText: '관세사·신고인 처리 대기',
  });

  // 5. 원산지증명서(C/O)
  // 수출 거래에서는 상공회의소 또는 세관 등에 발급을 신청한다.
  // 수입 거래에서는 이 서비스의 자동 생성 대상이 아니므로 해당 없음으로 처리한다.
  const isExport = profile.tradeType === 'export';

  docs.push({
    id: 'co',
    name: '원산지증명서(C/O)',
    status: isExport
      ? 'external_pending'
      : 'not_needed',
    statusText: isExport
      ? '발급 신청 필요'
      : '해당 없음',
  });

  // 6. 적하보험증권(Insurance Policy)
  // Incoterms 규칙상 보험이 필요한 경우에만 표시한다.
  if (
    rule &&
    rule.requiredDocuments.includes('insurance')
  ) {
    docs.push({
      id: 'insurance',
      name: '적하보험증권(Insurance Policy)',
      status: profile.insuranceConfirmed
        ? 'completed'
        : 'not_started',
      statusText: profile.insuranceConfirmed
        ? '준비 완료 확인됨'
        : 'CIF 조건 - 준비 필요',
      lastReviewed: profile.insuranceConfirmed
        ? timestamp
        : undefined,
    });
  }

  return docs;
}

// 서류별로 무엇을 입력하거나 확인하면 완료되는지 안내한다.
// 준비도 카드에서 다음 단계 안내 문구로 사용한다.
const NEXT_STEP_HINTS: Record<string, string> = {
  invoice:
    '품목명·업체명·거래조건을 입력하면 상업송장이 완료돼요',
  packing_list:
    '수량과 중량을 입력하면 패킹리스트가 완료돼요',
  bl:
    '포워더 또는 선사의 선하증권 발행을 기다려 주세요',
  customs_dec:
    '관세사 또는 신고인의 통관신고 처리를 기다려 주세요',
  co:
    '원산지증명서 발급 신청 및 발급 여부를 확인해 주세요',
  insurance:
    '적하보험 준비 확인 체크박스를 선택하면 완료돼요',
};

export interface ReadinessInfo {
  percent: number;
  completedCount: number;
  applicableCount: number;
  nextStepDocId?: string;
  nextStepLabel?: string;
}

/**
 * 화주가 직접 준비하거나 생성하는 서류의 준비도를 계산한다.
 *
 * 다음 상태는 준비도 분모에서 제외한다.
 * - not_needed: 해당 거래에 필요하지 않은 서류
 * - external_pending: 포워더·선사·관세사·상공회의소 등
 *   외부 주체가 발급하거나 처리하는 서류
 */
export function calculateReadiness(
  docs: DocumentStatus[]
): ReadinessInfo {
  const applicable = docs.filter(
    (document) =>
      document.status !== 'not_needed' &&
      document.status !== 'external_pending'
  );

  const completed = applicable.filter(
    (document) =>
      document.status === 'completed'
  );

  const percent =
    applicable.length > 0
      ? Math.round(
          (completed.length / applicable.length) *
            100
        )
      : 0;

  const nextStepDoc = applicable.find(
    (document) =>
      document.status !== 'completed'
  );

  return {
    percent,
    completedCount: completed.length,
    applicableCount: applicable.length,
    nextStepDocId: nextStepDoc?.id,
    nextStepLabel: nextStepDoc
      ? (
          NEXT_STEP_HINTS[nextStepDoc.id] ??
          `${nextStepDoc.name}을(를) 완료해 주세요`
        )
      : undefined,
  };
}