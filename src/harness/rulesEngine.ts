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

  // 3. 수출신고서(초안) — 관세사 전달용 초안을 docx로 생성한다(세관 제출본 아님).
  //    수출신고필증은 관세사·신고인이 세관 신고 후 발급하지만, 여기서는 초안을 만들어 전달을 돕는다.
  //    화주가 직접 생성하는 서류(C/I·P/L·E/D)를 묶어 보여주기 위해 B/L보다 먼저 배치한다.
  const hasCustomsInfo = !!(
    profile.hsCode &&
    profile.itemName &&
    profile.companyName &&
    profile.incoterms
  );
  docs.push({
    id: 'customs_dec',
    name: '수출신고서(초안)',
    status: hasCustomsInfo ? 'completed' : 'not_started',
    statusText: hasCustomsInfo ? '초안 생성' : '작성 필요',
    lastReviewed: hasCustomsInfo ? timestamp : undefined,
  });

  // 4. 수출 운송의뢰서(T/R)
  // 수출 화주는 B/L 발행 주체가 아니므로 포워더에게 전달할 운송의뢰 초안을 생성한다.
  // 수입 레거시 파이프라인의 B/L 상태는 기존 저장 데이터 호환을 위해 그대로 둔다.
  if (profile.tradeType === 'export') {
    docs.push({
      id: 'transport_request',
      name: '수출 운송의뢰서(Transport Request)',
      status: 'completed',
      statusText: '초안',
      lastReviewed: timestamp,
    });
  } else {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: 'external_pending',
      statusText: '포워더 발행 대기',
    });
  }

  // 5. 원산지증명서(C/O)
  // 실제 발급은 대한상공회의소 원산지증명센터에서 진행 — 우리는 신청자료 정리만 돕는다.
  // 구매자가 FTA 적용/증명서를 요청했는지(coNeeded)에 따라 3상태로 나뉜다:
  //   미확인 → "필요 여부 확인" / yes → 발급기관 신청 대상 / no → 불필요.
  const isExport = profile.tradeType === 'export';

  if (!isExport) {
    docs.push({
      id: 'co',
      name: '원산지증명서(C/O)',
      status: 'not_needed',
      statusText: '해당 없음',
    });
  } else if (profile.coNeeded === 'no') {
    docs.push({
      id: 'co',
      name: '원산지증명서(C/O)',
      status: 'not_needed',
      statusText: '불필요 (구매자 요청 없음)',
    });
  } else if (profile.coNeeded === 'yes') {
    docs.push({
      id: 'co',
      name: '원산지증명서(C/O)',
      status: 'external_pending',
      statusText: '상공회의소 발급 대상',
    });
  } else {
    docs.push({
      id: 'co',
      name: '원산지증명서(C/O)',
      status: 'external_pending',
      statusText: '필요 여부 확인',
    });
  }

  // 6. 적하보험증권(Insurance Policy)
  // CIF처럼 Incoterms상 매도인 부보가 의무인 조건은 질문 없이 항상 준비 대상.
  // 그 외 조건(FOB 등)은 계약에 따라 갈리므로 C/O처럼 필요 여부(insuranceNeeded)를
  // 먼저 묻고 — yes면 준비 확인 흐름, no면 불필요로 정리한다.
  const insuranceMandatory = Boolean(
    rule && rule.requiredDocuments.includes('insurance')
  );

  if (insuranceMandatory || profile.insuranceNeeded === 'yes') {
    docs.push({
      id: 'insurance',
      name: '적하보험증권(Insurance Policy)',
      status: profile.insuranceConfirmed
        ? 'completed'
        : 'not_started',
      statusText: profile.insuranceConfirmed
        ? '준비 완료 확인됨'
        : insuranceMandatory
          ? 'CIF 조건 - 준비 필요'
          : '계약상 부보 - 준비 필요',
      lastReviewed: profile.insuranceConfirmed
        ? timestamp
        : undefined,
    });
  } else if (profile.insuranceNeeded === 'no') {
    docs.push({
      id: 'insurance',
      name: '적하보험증권(Insurance Policy)',
      status: 'not_needed',
      statusText: '불필요 (부보 의무 없음)',
    });
  } else if (isExport) {
    // 미확인 — 화주가 만들 서류는 아니고 보험사가 발급하므로 준비도 분모에서 제외.
    docs.push({
      id: 'insurance',
      name: '적하보험증권(Insurance Policy)',
      status: 'external_pending',
      statusText: '필요 여부 확인',
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
  transport_request:
    '입력한 화물·항만 정보로 수출 운송의뢰서 초안을 생성해요',
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
