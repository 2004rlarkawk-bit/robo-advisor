import { beforeEach, expect, it, vi } from 'vitest';
import { saveForwarderCaseState } from './forwarderCaseService';

const mocks = vi.hoisted(() => ({ previous: {} as Record<string, unknown>, write: vi.fn() }));
vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'assigned-forwarder' } }, error: null }) },
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { workflow_data: { retained: 'shipper data', forwarderCase: mocks.previous } }, error: null }) }) }),
    update: (value: unknown) => { mocks.write(value); return { eq: async () => ({ error: null }) }; },
  }),
} }));

beforeEach(() => { mocks.write.mockClear(); mocks.previous = { stage: 'clearance', arrivalNotice: { id: 'an-1' }, dispatchRequest: { doNo: 'legacy-do' }, issueNotes: { weight: '확인한 근거' }, issueResolutions: { weight: true }, activity: [] }; });

it('persists import operations and preserves them when an unrelated document or stage is saved', async () => {
  const operations = { brokerName: '테스트 관세사', declarationNo: 'TEST-001', declarationStatus: 'filed' as const, doStatus: 'requested' as const, doNumber: '', doIssuer: '테스트 선사' };
  const next = await saveForwarderCaseState('trade-1', { importOperations: operations }, ['신고 기록']);
  expect(next).toMatchObject({ importOperations: operations, arrivalNotice: { id: 'an-1' }, dispatchRequest: { doNo: 'legacy-do' }, issueNotes: { weight: '확인한 근거' } });
  mocks.previous = next as unknown as Record<string, unknown>;
  const final = await saveForwarderCaseState('trade-1', { stage: 'done' });
  expect(final.importOperations).toEqual(operations);
  expect(mocks.write).toHaveBeenLastCalledWith({ workflow_data: expect.objectContaining({ retained: 'shipper data', forwarderCase: expect.objectContaining({ importOperations: operations }) }) });
});
