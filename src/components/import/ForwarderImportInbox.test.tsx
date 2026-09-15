// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForwarderImportInbox from './ForwarderImportInbox';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { formatInboxEta, getInboxState } from '../../utils/forwarderInbox';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fixture(id: string, overrides: Partial<ForwarderImportCase> = {}): ForwarderImportCase {
  return { tradeId: id, importer: id, stage: 'received', origin: 'shipper_request', blNo: `BL-${id}`, eta: 'SEP. 20, 2026', blockerCount: 0, returnRequest: null, shipperEditing: false,
    snapshot: { documents: [{ id: 'ci', type: 'commercial_invoice' }, { id: 'pl', type: 'packing_list' }], analysis: { extracted: { items: [], productDescription: '이어폰' } } }, trade: { profile: { itemName: '이어폰' } }, ...overrides } as ForwarderImportCase;
}
const request = { reason: '수량 확인', issueTitles: [], requestedAt: '2026-09-10' };
const cases = [fixture('신규업체'), fixture('회신업체', { stage: 'review', returnRequest: { ...request, resolvedAt: '2026-09-14' } }), fixture('대기업체', { stage: 'review', returnRequest: request }), fixture('작성업체', { stage: 'clearance' }), fixture('완료업체', { stage: 'done' })];

describe('forwarder inbox presentation', () => {
  it('all categories are exclusive, waiting is in progress, done takes precedence over old replies', () => {
    expect(cases.map((item) => getInboxState(item).category)).toEqual(['new', 'reply', 'progress', 'progress', 'done']);
    expect(getInboxState(fixture('done', { stage: 'done', returnRequest: { ...request, resolvedAt: '2026-09-14' } })).category).toBe('done');
    expect(getInboxState(fixture('editing', { returnRequest: request, shipperEditing: true })).label).toBe('화주 수정 중');
    expect(getInboxState(fixture('reviewed', { stage: 'review', returnRequest: null })).category).toBe('progress');
  });
  it('formats full dates without truncation or inventing dates', () => {
    expect(formatInboxEta('SEP. 20, 2026')).toBe('2026.09.20');
    expect(formatInboxEta('2026-09-20T00:00:00Z')).toBe('2026.09.20');
    expect(formatInboxEta('2026/9/2')).toBe('2026.09.02');
    expect(formatInboxEta('2026-02-30')).toBe('2026-02-30');
    expect(formatInboxEta('협의 중')).toBe('협의 중');
    expect(formatInboxEta('')).toBe('미정');
  });
});

describe('ForwarderImportInbox', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onOpen = vi.fn();
  const onRefresh = vi.fn();
  const onDirectUpload = vi.fn();
  const render = async (overrides: Partial<React.ComponentProps<typeof ForwarderImportInbox>> = {}) => {
    await act(async () => root.render(<ForwarderImportInbox cases={cases} error="" refreshing={false} onOpen={onOpen} onRefresh={onRefresh} onDirectUpload={onDirectUpload} {...overrides} />));
  };
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.includes(text))!;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('renders five tabs, accurate counts and attachment summary; selection alone does not open detail', async () => {
    await render();
    expect([...container.querySelectorAll('.fwd-inbox-filters button')].map((element) => element.textContent)).toEqual(['전체 5', '신규 1', '진행 중 2', '보완 회신 1', '완료 1']);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(container.querySelector('.fwd-inbox-selection')?.textContent).toContain('첨부 서류 2개');
    const radio = container.querySelectorAll<HTMLInputElement>('input[type=radio]')[1];
    await act(async () => radio.click());
    expect(onOpen).not.toHaveBeenCalled();
    await act(async () => button('선택한 의뢰 열기').click());
    expect(onOpen).toHaveBeenCalledWith('회신업체');
  });
  it('filters correctly and never opens hidden or removed selections', async () => {
    await render();
    await act(async () => button('진행 중').click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector('tbody')?.textContent).not.toContain('신규업체');
    await act(async () => button('선택한 의뢰 열기').click());
    expect(onOpen).toHaveBeenLastCalledWith('대기업체');
    await act(async () => button('보완 회신').click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    await render({ cases: cases.filter((item) => item.tradeId !== '회신업체') });
    expect(button('선택한 의뢰 열기').disabled).toBe(true);
    expect(container.querySelector('.fwd-inbox-selection')).toBeNull();
  });
  it('hides the direct registration entry (demo period) while keeping refresh working', async () => {
    // 직접 등록은 구 위저드로 이동해 시연 기간 숨김 — DIRECT_UPLOAD_ENABLED로 복원한다.
    await render();
    expect(container.textContent).not.toContain('직접 등록');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="의뢰 새로고침"]')!.click());
    expect(onDirectUpload).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
  it('shows a single empty state, loading state and recoverable errors without opening stale cases', async () => {
    await render({ cases: [] });
    expect(container.textContent).toContain('아직 받은 의뢰가 없습니다.');
    expect(container.textContent).not.toContain('이 상태의 의뢰가 없습니다.');
    expect(button('선택한 의뢰 열기').disabled).toBe(true);
    await render({ cases: null, refreshing: true });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('불러오는 중');
    await render({ error: '목록 조회 실패' });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('목록 조회 실패');
    expect(button('선택한 의뢰 열기').disabled).toBe(true);
  });
});
