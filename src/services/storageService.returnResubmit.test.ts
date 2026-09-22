import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportTradeSnapshot } from '../types/importTrade';
import { normalizeImportAnalysisResult } from './importDocumentAnalysisService';

const { fromMock, getUserMock } = vi.hoisted(() => ({ fromMock: vi.fn(), getUserMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock }, storage: { from: vi.fn() } },
}));

import { createCompletedImportTrade } from './storageService';

const RETURN_REQUEST = {
  reason: 'Importer 불일치를 수정해 주세요.',
  issueTitles: ['Importer 불일치'],
  requestedAt: '2026-09-22T07:00:00.000Z',
};

/** trades 조회(workflow_data) → update 순서로 응답하는 supabase 모의 */
function mockReadThenUpdate(workflowData: unknown) {
  const readQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  readQuery.select.mockReturnValue(readQuery);
  readQuery.eq.mockReturnValue(readQuery);
  readQuery.maybeSingle.mockResolvedValue({ data: { workflow_data: workflowData }, error: null });

  // 저장한 payload를 그대로 행으로 돌려준다 — 실제 DB처럼 저장 결과를 다시 매핑하게 된다.
  let savedPayload: Record<string, unknown> = {};
  const updateQuery = { update: vi.fn(), eq: vi.fn(), in: vi.fn(), select: vi.fn(), single: vi.fn() };
  updateQuery.update.mockImplementation((payload: Record<string, unknown>) => { savedPayload = payload; return updateQuery; });
  updateQuery.eq.mockReturnValue(updateQuery);
  updateQuery.in.mockReturnValue(updateQuery);
  updateQuery.select.mockReturnValue(updateQuery);
  updateQuery.single.mockImplementation(() => Promise.resolve({
    data: { id: 'trade-1', created_at: '', updated_at: '', ...savedPayload },
    error: null,
  }));

  fromMock.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);
  return { readQuery, updateQuery };
}

const snapshot = (): ImportTradeSnapshot => ({
  tradeId: 'trade-1',
  role: 'shipper',
  documents: [],
  analysis: normalizeImportAnalysisResult({ extracted: { items: [] } }),
  suggestions: [],
  risks: [],
  duty: null,
  cargo: null,
  arrivalNotice: null,
} as unknown as ImportTradeSnapshot);

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('화주가 보완 요청을 받고 수정 서류를 재제출할 때', () => {
  it('회신 메모를 남기지 않아도 shipperReplyAt을 기록해 포워더 알림 조건을 만족시킨다', async () => {
    const { updateQuery } = mockReadThenUpdate({ forwarderCase: { stage: 'review', returnRequest: RETURN_REQUEST } });

    await createCompletedImportTrade(snapshot());

    const payload = updateQuery.update.mock.calls[0][0] as { workflow_data: { forwarderCase: { returnRequest: Record<string, string> } } };
    const carried = payload.workflow_data.forwarderCase.returnRequest;
    expect(carried.resolvedAt).toBeTruthy();
    expect(carried.shipperReplyAt).toBe(carried.resolvedAt);
    // 포워더가 보는 요청 원문과 회신 메모는 건드리지 않는다.
    expect(carried.reason).toBe(RETURN_REQUEST.reason);
    expect(carried.shipperReply).toBeUndefined();
  });

  it('이미 회신 메모를 남긴 건이면 그 메모를 지우지 않는다', async () => {
    const { updateQuery } = mockReadThenUpdate({
      forwarderCase: { stage: 'review', returnRequest: { ...RETURN_REQUEST, shipperReply: '수정했습니다.', shipperReplyAt: '2026-09-22T08:00:00.000Z' } },
    });

    await createCompletedImportTrade(snapshot());

    const payload = updateQuery.update.mock.calls[0][0] as { workflow_data: { forwarderCase: { returnRequest: Record<string, string> } } };
    expect(payload.workflow_data.forwarderCase.returnRequest.shipperReply).toBe('수정했습니다.');
    // 재제출 시각으로 갱신돼야 알림이 다시 간다.
    expect(payload.workflow_data.forwarderCase.returnRequest.shipperReplyAt).not.toBe('2026-09-22T08:00:00.000Z');
  });

  it('이미 처리된 보완 요청은 다시 건드리지 않는다', async () => {
    const resolved = { ...RETURN_REQUEST, resolvedAt: '2026-09-22T09:00:00.000Z' };
    const { updateQuery } = mockReadThenUpdate({ forwarderCase: { stage: 'review', returnRequest: resolved } });

    await createCompletedImportTrade(snapshot());

    const payload = updateQuery.update.mock.calls[0][0] as { workflow_data: { forwarderCase: { returnRequest: Record<string, string> } } };
    expect(payload.workflow_data.forwarderCase.returnRequest).toEqual(resolved);
  });
});
