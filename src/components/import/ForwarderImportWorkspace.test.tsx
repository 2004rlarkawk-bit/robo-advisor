// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedTrade } from '../../types';
import type { ForwarderCaseState, ForwarderImportCase } from '../../types/forwarderCase';
import { normalizeImportExtractedFields } from '../../services/importDocumentAnalysisService';
import { deriveForwarderCase } from '../../services/forwarderCaseService';
import ForwarderImportWorkspace from './ForwarderImportWorkspace';

const { list, save, download } = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), download: vi.fn() }));
vi.mock('../../services/forwarderCaseService', async (original) => ({
  ...(await original<typeof import('../../services/forwarderCaseService')>()),
  listForwarderCases: list, saveForwarderCaseState: save,
}));
vi.mock('../../services/arrivalNoticeDocxService', () => ({ downloadArrivalNoticeDocx: download }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
function fixture(state: Partial<ForwarderCaseState> = {}): ForwarderImportCase {
  return deriveForwarderCase({
    id: 'trade-1', tradeDirection: 'import', tradeRole: 'shipper',
    profile: { tradeType: 'import', companyName: '테스트 화주' }, documents: [], issues: [],
    status: 'submitted', submittedAt: '2026-09-01T00:00:00Z', createdAt: '2026-09-01T00:00:00Z',
    forwarderCase: { stage: 'review', updatedAt: '2026-09-01T00:00:00Z', ...state },
    generatedDocs: { importTrade: { direction: 'import', role: 'shipper', documents: [], risks: [],
      generatedAt: '2026-09-01T00:00:00Z', analysis: { extracted: normalizeImportExtractedFields({ blNo: 'BL-TEST-1' }), comparison: [], validations: [] },
    } },
  } as unknown as SavedTrade)!;
}
beforeEach(() => {
  vi.clearAllMocks();
  download.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render(item = fixture()) {
  list.mockResolvedValue([item]);
  save.mockImplementation(async (_id, patch) => ({ ...item.trade.forwarderCase, ...patch, updatedAt: '2026-09-11T00:00:00Z' }));
  await act(async () => { root.render(<ForwarderImportWorkspace userId="test-user" onDirectUpload={() => undefined} />); });
}
function button(text: string) {
  const found = Array.from(container.querySelectorAll('button')).find((element) => element.textContent?.trim() === text);
  if (!found) throw new Error(`Button not found: ${text}`);
  return found;
}
async function click(text: string) { await act(async () => { button(text).click(); }); }

describe('수입 포워더 서류 중심 작업 흐름', () => {
  it('받은 서류 검토로 열리고 검토 전에도 A/N 초안을 만들 수 있지만 단계·발송 상태는 바꾸지 않는다', async () => {
    await render(fixture({ stage: 'received' }));
    await click('BL-TEST-1');
    expect(button('받은 서류 검토').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).toContain('문서 대사 결과');
    expect(container.textContent).not.toContain('수입 업무 완료');
    await click('도착통지서 작성');
    expect(container.textContent).toContain('아직 서류 검토가 끝나지 않았습니다');
    expect(container.textContent).toContain('생성·첨부만으로 발송되지 않습니다');
    await click('A/N 초안 생성 (.docx)');
    expect(download).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });
  it('검토 완료 후 A/N 작성으로 이동하며 기존 통관 완료 상태를 만들지 않는다', async () => {
    await render();
    await click('BL-TEST-1');
    await click('검토 완료 · 도착통지서 작성');
    expect(save).toHaveBeenCalledWith('trade-1', { stage: 'clearance' });
    expect(button('도착통지서 작성').getAttribute('aria-pressed')).toBe('true');
    expect(container.textContent).not.toContain('수입 업무 완료');
    await click('진행·기록');
    expect(container.textContent).toContain('서류 접수·보완 기록');
    expect(button('수입 업무 완료')).toBeDefined();
    expect(container.querySelector('details')?.open).toBe(false);
  });
  it('화주 회신 대기 건은 담당 필터로 구분되고 검토 완료를 진행할 수 없다', async () => {
    await render(fixture({ returnRequest: { reason: '중량 확인', issueTitles: ['총중량'], requestedAt: '2026-09-02' } }));
    await click('포워더 처리 0');
    expect(container.textContent).not.toContain('BL-TEST-1');
    await click('화주 회신 대기 1');
    await click('BL-TEST-1');
    expect(container.textContent).toContain('회신 대기 중');
    expect(container.textContent).not.toContain('검토 완료 · 도착통지서 작성');
    expect(save).not.toHaveBeenCalled();
  });
  it('재검토를 시작해도 최근 보완 요청·회신 기록을 삭제하지 않는다', async () => {
    const returnRequest = { reason: '중량 확인', issueTitles: ['총중량'], requestedAt: '2026-09-02', resolvedAt: '2026-09-03' };
    await render(fixture({ returnRequest }));
    await click('BL-TEST-1');
    await click('수정 서류 검토');
    expect(save).toHaveBeenCalledWith('trade-1', { stage: 'review' });
    await click('진행·기록');
    expect(container.textContent).toContain('2026-09-03');
  });
});
