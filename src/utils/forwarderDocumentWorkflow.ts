import type { ForwarderCaseStage, ForwarderImportCase } from '../types/forwarderCase';

// Presentation only: retain the shared persisted stages and shipper compatibility.
export const DOCUMENT_STAGE_LABEL: Record<ForwarderCaseStage, string> = {
  received: '서류 접수', review: '서류 검토 중', clearance: '서류 검토 완료', done: '업무 종료',
};

export function documentTask(item: Pick<ForwarderImportCase, 'stage' | 'returnRequest' | 'shipperEditing' | 'blockerCount' | 'arrivalNotice'>): { owner: '포워더' | '화주' | '—'; action: string } {
  if (item.stage === 'done') return { owner: '—', action: '작성 서류·처리 기록 확인' };
  if (item.returnRequest && !item.returnRequest.resolvedAt) return { owner: '화주', action: item.shipperEditing ? '서류 수정·재제출' : '요청 항목 확인·보완 서류 회신' };
  if (item.returnRequest?.resolvedAt && item.stage !== 'clearance') return { owner: '포워더', action: '화주가 재제출한 서류 검토' };
  if (item.blockerCount > 0) return { owner: '포워더', action: '서류 불일치 확인·보완 요청' };
  if (item.stage === 'clearance') return { owner: '포워더', action: item.arrivalNotice ? '보관한 A/N 최종본 확인' : 'A/N 초안 작성·최종본 보관' };
  return { owner: '포워더', action: '받은 서류 검토' };
}
