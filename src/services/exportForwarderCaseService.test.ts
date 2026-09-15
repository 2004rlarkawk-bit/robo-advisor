import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

import { saveExportForwarderCaseState } from './exportForwarderCaseService';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: 'forwarder-1' } }, error: null });
});

function mockReadThenWrite(existingWorkflowData: Record<string, unknown> | null) {
  const readQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  readQuery.select.mockReturnValue(readQuery);
  readQuery.eq.mockReturnValue(readQuery);
  readQuery.maybeSingle.mockResolvedValue({ data: { workflow_data: existingWorkflowData }, error: null });

  const writeQuery = { update: vi.fn(), eq: vi.fn() };
  writeQuery.update.mockReturnValue(writeQuery);
  writeQuery.eq.mockResolvedValue({ data: null, error: null });

  fromMock.mockReturnValueOnce(readQuery).mockReturnValueOnce(writeQuery);
  return { readQuery, writeQuery };
}

describe('saveExportForwarderCaseState', () => {
  it('기존 workflow_data를 유지한 채 exportForwarderCase만 병합 갱신한다', async () => {
    const { writeQuery } = mockReadThenWrite({ someOtherKey: 'kept' });

    const result = await saveExportForwarderCaseState(
      'trade-1',
      { progress: { booking: 'done' } },
      ['Booking 완료 상태로 변경'],
    );

    expect(result.progress).toEqual({ booking: 'done' });
    expect(result.activity).toHaveLength(1);
    expect(result.activity?.[0].text).toBe('Booking 완료 상태로 변경');
    expect(writeQuery.update).toHaveBeenCalledWith({
      workflow_data: expect.objectContaining({
        someOtherKey: 'kept',
        exportForwarderCase: expect.objectContaining({ progress: { booking: 'done' } }),
      }),
    });
  });

  it('진행상태를 여러 번 저장하면 이전 단계 상태가 지워지지 않고 병합된다', async () => {
    mockReadThenWrite({
      exportForwarderCase: {
        progress: { booking: 'done' },
        activity: [{ at: '2026-09-01T00:00:00.000Z', text: 'Booking 완료 상태로 변경' }],
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    });

    const result = await saveExportForwarderCaseState('trade-1', { progress: { cargoReceived: 'done' } });

    expect(result.progress).toEqual({ booking: 'done', cargoReceived: 'done' });
    expect(result.activity).toHaveLength(1);
  });

  it('Master B/L 번호를 저장한다', async () => {
    mockReadThenWrite({});
    const result = await saveExportForwarderCaseState('trade-1', { masterBlNo: 'MBLKR0001' }, ['Master B/L 번호 등록']);
    expect(result.masterBlNo).toBe('MBLKR0001');
  });

  it('로그인하지 않은 경우 저장을 거부한다', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(saveExportForwarderCaseState('trade-1', {})).rejects.toThrow('로그인이 필요합니다.');
  });

  it('거래를 찾지 못하면 오류를 던진다', async () => {
    const readQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    readQuery.select.mockReturnValue(readQuery);
    readQuery.eq.mockReturnValue(readQuery);
    readQuery.maybeSingle.mockResolvedValue({ data: null, error: null });
    fromMock.mockReturnValueOnce(readQuery);

    await expect(saveExportForwarderCaseState('missing-trade', {})).rejects.toThrow('수정할 거래를 찾지 못했습니다.');
  });
});
