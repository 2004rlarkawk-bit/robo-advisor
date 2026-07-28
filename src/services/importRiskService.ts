import type {
  ImportDocumentMeta,
  ImportDocumentType,
  ImportRisk,
  ImportValidation,
  ReconciliationRuleResult,
} from '../types/importTrade';

const DOC_LABEL: Record<ImportDocumentType, string> = {
  commercial_invoice: 'C/I',
  packing_list: 'P/L',
  bill_of_lading: 'B/L',
  unknown: '기타',
};

/**
 * 종합 리스크 = 결정론적 대조 엔진 결과(authoritative) + AI 참고 의견(별도 채널).
 *
 * - 대조 fail(error→high, warning→medium)이 리스크의 1차 근거.
 * - LLM validations는 코드 룰이 못 잡는 정성적 의견이므로 'AI 참고'(level low)로만
 *   보조 표기한다. 더 이상 analysis.validations를 리스크로 직접 승격하지 않는다.
 */
export function assessImportRisks(
  documents: ImportDocumentMeta[],
  reconciliation: ReconciliationRuleResult[],
  aiValidations: ImportValidation[] = [],
): ImportRisk[] {
  const risks: ImportRisk[] = [];

  for (const result of reconciliation) {
    if (result.status !== 'fail') continue;
    risks.push({
      id: `reconcile-${result.ruleId}`,
      level: result.severity === 'error' ? 'high' : 'medium',
      item: `${result.ruleId}. ${result.label}`,
      cause: result.evidence,
      recommendation: '원본 서류(C/I·P/L·B/L)를 대조해 값을 정정하거나 불일치 사유를 확인하세요.',
      relatedDocuments: result.documents.map((doc) => DOC_LABEL[doc]),
      status: result.severity === 'error' ? '보완 필요' : '확인 권장',
    });
  }

  // AI 참고 채널 — 코드 대조가 다루지 않는 LLM 정성 의견. 요약(medium/high)에는 끼지 않는다.
  for (const validation of aiValidations) {
    risks.push({
      id: `ai-${validation.id}`,
      level: 'low',
      item: `AI 참고 · ${validation.field}`,
      cause: validation.message,
      recommendation: 'AI가 제시한 참고 의견입니다. 코드 대조 결과와 함께 검토하세요.',
      relatedDocuments: validation.documents.map((doc) => DOC_LABEL[doc] ?? doc),
      status: 'AI 참고',
    });
  }

  if (documents.length > 0 && risks.every((risk) => risk.level === 'low')) {
    risks.push({
      id: 'reference',
      level: 'low',
      item: '분석 참고',
      cause: '대조 결과 차단성 불일치가 발견되지 않았습니다.',
      recommendation: '최종 신고 전 원본과 다시 대조해 주세요.',
      relatedDocuments: [],
      status: '양호',
    });
  }

  return risks;
}
