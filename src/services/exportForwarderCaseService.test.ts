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

describe('부킹 확정 정보 저장', () => {
  it('부킹 정보를 저장하고 새로 읽을 때 유지된다', async () => {
    const { writeQuery } = mockReadThenWrite({});

    const result = await saveExportForwarderCaseState(
      'trade-1',
      {
        booking: { cargoClosingDate: '2026-10-01', freightTerms: 'PREPAID', confirmedAt: '2026-09-22T00:00:00.000Z' },
        progress: { booking: 'done' },
      },
      ['부킹 확정 정보 등록'],
    );

    expect(result.booking).toEqual({
      cargoClosingDate: '2026-10-01', freightTerms: 'PREPAID', confirmedAt: '2026-09-22T00:00:00.000Z',
    });
    expect(writeQuery.update).toHaveBeenCalledWith({
      workflow_data: expect.objectContaining({
        exportForwarderCase: expect.objectContaining({
          booking: expect.objectContaining({ cargoClosingDate: '2026-10-01' }),
        }),
      }),
    });
  });

  it('일부만 수정하면 나머지 부킹 값은 지워지지 않는다', async () => {
    mockReadThenWrite({
      exportForwarderCase: {
        progress: { booking: 'done' },
        booking: { cargoClosingDate: '2026-10-01', cyClosingDate: '2026-09-30', freightTerms: 'PREPAID', remarks: '부산신항 반입' },
        updatedAt: '2026-09-22T00:00:00.000Z',
      },
    });

    const result = await saveExportForwarderCaseState('trade-1', { booking: { remarks: '반입지 변경' } }, ['부킹 정보 수정']);

    expect(result.booking).toEqual({
      cargoClosingDate: '2026-10-01', cyClosingDate: '2026-09-30', freightTerms: 'PREPAID', remarks: '반입지 변경',
    });
  });

  it('부킹 정보를 넘기지 않는 저장은 기존 값을 건드리지 않는다', async () => {
    mockReadThenWrite({
      exportForwarderCase: {
        progress: {},
        booking: { cargoClosingDate: '2026-10-01' },
        updatedAt: '2026-09-22T00:00:00.000Z',
      },
    });

    const result = await saveExportForwarderCaseState('trade-1', { masterBlNo: 'MBL-1' });

    expect(result.booking).toEqual({ cargoClosingDate: '2026-10-01' });
  });
});
