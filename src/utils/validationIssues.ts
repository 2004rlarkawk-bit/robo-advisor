import type { ValidationIssue } from '../types';

export function issueKey(issue: ValidationIssue): string {
  return `${issue.id}::${String(issue.field)}`;
}

export function unresolvedBlockers(
  issues: ValidationIssue[],
  overrides: Record<string, string>,
): ValidationIssue[] {
  return issues.filter(
    (issue) => issue.severity === 'error'
      && !(issue.overridable && overrides[issueKey(issue)]),
  );
}

export function issueToFieldKey(issue: ValidationIssue): string {
  return String(issue.field) === 'invoiceAmount'
    ? 'totalAmount'
    : String(issue.field);
}

export function shortIssueLabel(issue: ValidationIssue): string {
  const message = issue.message
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const missing = message.match(/^(.+?)이 ?입력되지 않았습니다/);
  if (missing) return `${missing[1].trim()} 입력`;
  const korean = message.match(/^(.+?)에 한글이 포함되어/);
  if (korean) return `${korean[1].trim()} 영문으로 수정`;
  const sentence = message.split('.')[0].trim();
  const [title, ...rest] = sentence.split(':');
  return rest.length > 0 && title.trim().length >= 6
    ? title.trim()
    : sentence;
}

// amount-calc-mismatch는 2026-08 통합으로 complianceRules.ts R8에 흡수되어 더 이상 발행되지
// 않는다(validatorEngine.ts 참고) — validateRequiredInputs가 안 내는 id를 실시간 재평가 대상으로
// 남겨두면 "항상 해결됨"으로 오판하므로 패턴에서 제외했다.
const LIVE_CHECK_ID = /^(input-missing-|input-nan-|input-nonpositive-)|^(input-date-order|invoice-date-after-shipment|weight-net-gross|package-count-nonpositive|currency-missing|unit-missing|items-total-mismatch)$/;

/** 입력값만으로 해결 여부를 다시 판정할 수 있는 이슈인지. */
export function isLiveCheckIssueId(id: string): boolean {
  return LIVE_CHECK_ID.test(id);
}

/** 고칠 항목 목록의 보조 설명 — "어떻게 고치는지"(예시·조건)만 뽑는다. */
export function issueFixHint(issue: ValidationIssue): string | null {
  const m = issue.message.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
  const ex = m.match(/예[:：]\s*([^.]+)/);
  if (ex) return `예: ${ex[1].trim()}`;
  // 괄호 속 설명이 실질적 안내인 경우가 많다 (조건·기준 등)
  const paren = m.match(/\(([^)]{8,})\)/);
  if (paren) return paren[1].trim();
  const colon = m.split(':');
  if (colon.length > 1) return colon.slice(1).join(':').split('.')[0].trim();
  return null;
}

const EXPORT_ISSUE_DOC_LABEL: Record<string, string> = {
  invoice: '상업송장', packing_list: '패킹리스트', bl: '선하증권 B/L', transport_request: '수출 운송의뢰서',
  customs_dec: '통관신고서', co: '원산지증명서', insurance: '적하보험증권',
};

/** 검증 메시지 앞에 붙는 서류명 — 제목에서 중복 접두를 떼어낼 때 쓴다. */
export function exportIssueDocLabel(docType: string): string {
  return EXPORT_ISSUE_DOC_LABEL[docType] || '기타 서류';
}

/** 확인 항목 카드용 손질 카피 — 원 검증 메시지 대신 짧은 제목 + 명령형 설명. */
export function presentIssue(i: ValidationIssue): { title: string; desc: string } | null {
  if (i.field === 'weight') return { title: '중량 입력', desc: '총 중량 또는 순중량 정보를 입력하세요.' };
  if (i.id.startsWith('llm-anomaly-')) {
    // "라벨: 사유" 형식(예전 저장본은 앞에 "AI 참고 — "가 붙어 있음). 제목은 라벨까지, 설명은 사유.
    const plain = i.message.replace(/\s*\[근거:[^\]]*\]\s*$/, '').replace(/^AI 참고 — /, '');
    const m = /^([^:]+):\s*(.+)$/.exec(plain);
    return m
      ? { title: `${m[1]} 값 확인`, desc: `${m[2]} (실제 값이 맞다면 그대로 진행해도 됩니다.)` }
      : { title: '입력값 확인', desc: plain };
  }
  if (i.docType === 'co') return { title: '원산지증명서 필요 여부', desc: '구매자가 FTA 적용 또는 원산지증명서를 요청했는지 확인해 주세요.' };
  if (i.id === 'r2-departure-missing' || i.field === 'departureDate') return { title: '선적일 확인', desc: '선적일이 비어 있습니다. 확정 시 입력을 권장합니다.' };
  if (i.field === 'hsCode') return { title: 'HS CODE 확인', desc: '품목에 맞는 HS CODE를 확인·입력하세요.' };
  if (i.id === 'insurance-missing') return { title: '적하보험증권 준비', desc: 'CIF 조건에서는 적하보험증권이 필요합니다.' };
  if (i.id === 'r15-origin-not-korea') {
    const origin = /원산지가 '([^']+)'/.exec(i.message || '')?.[1] ?? '';
    return {
      title: '원산지 정보 확인 필요',
      desc: `수출물품의 원산지가 '${origin}'으로 입력되어 있습니다. 실제 물품의 원산지와 일치하는지 확인해 주세요.`,
    };
  }
  return null;
}
