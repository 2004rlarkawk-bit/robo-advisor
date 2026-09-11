import { describe, expect, it } from 'vitest';
import { documentTask } from './forwarderDocumentWorkflow';

const base: Parameters<typeof documentTask>[0] = { stage: 'review', blockerCount: 0, returnRequest: null, arrivalNotice: null, shipperEditing: false };
describe('서류 작업 담당·다음 조치', () => {
  it('보완 대기는 화주, 재제출 후에는 포워더에게 연결한다', () => {
    const returnRequest = { reason: '확인', issueTitles: [], requestedAt: '2026-09-01' };
    expect(documentTask({ ...base, returnRequest }).owner).toBe('화주');
    expect(documentTask({ ...base, returnRequest: { ...returnRequest, resolvedAt: '2026-09-02' } }).action).toContain('재제출');
  });
  it('검토 완료 후에는 A/N 작성을 안내하고 종료 건에는 담당을 배정하지 않는다', () => {
    expect(documentTask({ ...base, stage: 'clearance' }).action).toContain('A/N 초안');
    expect(documentTask({ ...base, stage: 'done' }).owner).toBe('—');
  });
  it('필수 이슈가 남아 있으면 A/N보다 검토를 먼저 안내한다', () => {
    expect(documentTask({ ...base, stage: 'clearance', blockerCount: 1 }).action).toContain('불일치');
  });
});
