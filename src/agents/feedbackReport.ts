import type {
  ValidationIssue,
  TradeProfile,
  FeedbackReport,
  FeedbackCheckItem,
  DocumentType,
} from '../types';

/** 확인 항목 제목 대체용 — 이슈에 title이 없으면 문서 라벨을 쓴다. */
const DOC_LABEL: Record<DocumentType, string> = {
  invoice: '상업송장',
  packing_list: '패킹리스트',
  bl: '선하증권(B/L)',
  customs_dec: '통관신고서',
  co: '원산지증명서',
  insurance: '적하보험증권',
};

/** message 뒤에 붙은 " [근거: ...]" 접미사 제거 — 근거는 basis 배지로 따로 렌더한다. */
function stripBasis(message: string): string {
  return message.replace(/\s*\[근거:[^\]]*\]\s*$/, '').trim();
}

/**
 * 검증 이슈 배열 → AI 검토 리포트 "틀".
 * - card를 가진 이슈 → facts(사실 카드). 금액·법근거는 이미 결정론적으로 채워져 있음.
 * - 나머지 이슈 → checks(확인 항목).
 * 순수 함수 — 기존 검증 파이프라인을 건드리지 않고 표현만 재구성한다.
 * 나중 GPT는 narrative(및 check.detail 산문)만 채우고 이 구조는 그대로 둔다.
 */
export function buildFeedbackReport(
  issues: ValidationIssue[],
  _profile?: TradeProfile,
  opts?: { reviewed?: number; narrative?: string },
): FeedbackReport {
  const facts = issues.filter((i) => i.card).map((i) => i.card!);

  const checks: FeedbackCheckItem[] = issues
    .filter((i) => !i.card)
    .map((i) => ({
      id: i.id,
      title: i.title || DOC_LABEL[i.docType] || '확인 필요',
      detail: stripBasis(i.message),
      severity: i.severity,
      docType: i.docType,
      field: i.field,
      basis: i.basis,
    }));

  // "확인 필요" 카운트 = 제출을 막거나 보완이 권장되는 항목(error+warning). info(참고)는 제외.
  const needsCheck = checks.filter(
    (c) => c.severity === 'error' || c.severity === 'warning',
  ).length;

  return {
    // reviewed 기본값 = 이번 검증에서 평가된 전체 항목 수(사실 카드 + 확인 항목).
    // UI 요약 칩 "검토 완료 N"이 실제 평가 개수와 일치하도록 한다.
    summary: { reviewed: opts?.reviewed ?? issues.length, needsCheck },
    facts,
    checks,
    narrative: opts?.narrative,
  };
}
