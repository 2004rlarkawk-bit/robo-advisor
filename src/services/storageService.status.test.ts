import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportTradeSnapshot } from '../types/importTrade';
import { normalizeImportExtractedFields } from './importDocumentAnalysisService';

const { fromMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    storage: { from: vi.fn() },
  },
}));

import {
  createCompletedImportTrade,
  fetchSubmittedTrades,
  fetchTradeManagerTrades,
} from './storageService';

beforeEach(() => {
  vi.clearAllMocks();
  getUserMock.mockResolvedValue({
    data: { user: { id: 'user-1' } },
    error: null,
  });
});

function listQuery() {
  const query = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [], error: null });
  fromMock.mockReturnValue(query);
  return query;
}

function importSnapshot(arrival = false): ImportTradeSnapshot {
  return {
    tradeId: 'trade-1',
    direction: 'import',
    role: 'forwarder',
    documents: [],
    arrivalNotice: arrival ? {
      id: 'arrival-1',
      documentType: 'arrival_notice',
      fileName: 'arrival.pdf',
      storageBucket: 'trade-documents',
      storagePath: 'user-1/trade-1/arrival_notice/arrival.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      uploadedAt: '2026-07-30T04:00:00.000Z',
    } : undefined,
    analysis: {
      extracted: normalizeImportExtractedFields({}),
      validations: [],
      comparison: [],
    },
    risks: [],
    generatedAt: '2026-07-30T03:00:00.000Z',
    flowCompletedAt: '2026-07-30T04:00:00.000Z',
  };
}

describe('거래/문서관리 Supabase 조회 계약', () => {
  it('거래관리는 generated/in_progress를 updated_at 최신순으로 조회한다', async () => {
    const query = listQuery();
    await fetchTradeManagerTrades();
    expect(query.in).toHaveBeenCalledWith('status', ['generated', 'in_progress']);
    expect(query.order).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('문서관리는 submitted + submitted_at not null을 제출 최신순으로 조회한다', async () => {
    const query = listQuery();
    await fetchSubmittedTrades();
    expect(query.eq).toHaveBeenCalledWith('status', 'submitted');
    expect(query.not).toHaveBeenCalledWith('submitted_at', 'is', null);
    expect(query.order).toHaveBeenCalledWith('submitted_at', { ascending: false });
  });
});

describe('수입 포워더 동일 거래 상태 전이', () => {
  it.each([
    [false, 'in_progress', null],
    [true, 'submitted', expect.any(String)],
  ] as const)('arrival_notice=%s이면 기존 ID를 %s로 UPDATE하고 INSERT하지 않는다', async (arrival, status, submittedAt) => {
    const query = {
      update: vi.fn(),
      insert: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
    };
    query.update.mockReturnValue(query);
    query.insert.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.select.mockReturnValue(query);
    query.single.mockImplementation(async () => {
      const payload = query.update.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
      return {
        data: {
          id: 'trade-1',
          ...payload,
          created_at: '2026-07-30T03:00:00.000Z',
          updated_at: '2026-07-30T04:00:00.000Z',
        },
        error: null,
      };
    });
    fromMock.mockReturnValue(query);

    const result = await createCompletedImportTrade(importSnapshot(arrival));

    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({
      status,
      submitted_at: submittedAt,
      flow_completed_at: '2026-07-30T04:00:00.000Z',
    }));
    expect(query.eq).toHaveBeenCalledWith('id', 'trade-1');
    expect(query.in).toHaveBeenCalledWith('status', ['generated', 'in_progress']);
    expect(query.insert).not.toHaveBeenCalled();
    expect(result.id).toBe('trade-1');
    expect(result.status).toBe(status);
  });
});
