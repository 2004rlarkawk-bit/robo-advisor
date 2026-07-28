import type { ImportAnalysisResult, ImportDocumentMeta, ImportRisk } from '../types/importTrade';

export function assessImportRisks(documents: ImportDocumentMeta[], analysis: ImportAnalysisResult): ImportRisk[] {
  const risks: ImportRisk[] = analysis.validations.map((validation) => ({
    id: validation.id,
    level: validation.severity === 'error' ? 'high' : 'medium',
    item: validation.field,
    cause: validation.message,
    recommendation: '원본 문서를 확인하고 누락 또는 불일치 값을 보완해 주세요.',
    relatedDocuments: validation.documents,
    status: '확인 필요',
  }));
  if (!analysis.extracted.containerNo) {
    risks.push({ id: 'container', level: 'medium', item: '컨테이너 번호', cause: 'B/L에서 번호를 확인하지 못했습니다.', recommendation: '선사 또는 수출지 포워더에게 확인해 주세요.', relatedDocuments: ['B/L'], status: '확인 필요' });
  }
  if (documents.length > 0 && risks.length === 0) {
    risks.push({ id: 'reference', level: 'low', item: '분석 참고', cause: '주요 불일치가 발견되지 않았습니다.', recommendation: '최종 신고 전 원본과 다시 대조해 주세요.', relatedDocuments: [], status: '양호' });
  }
  return risks;
}
