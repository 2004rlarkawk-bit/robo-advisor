// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForwarderExportRequestInbox from './ForwarderExportRequestInbox';

const { listRequests } = vi.hoisted(() => ({ listRequests: vi.fn() }));
vi.mock('../services/forwarderExportRequestService', () => ({ listForwarderExportRequests: listRequests }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function render(empty = false, userId = 'fwd-1') {
  listRequests.mockResolvedValue(empty ? [] : ['a', 'b'].map(id => ({
    tradeId: id, exporterName: '화주 ' + id, itemSummary: '화물 ' + id,
    requestNo: id, requestedAt: '2026-09-23T00:00:00Z', loadPort: 'BUSAN', dischargePort: 'TOKYO',
  })));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onApply = vi.fn();
  await act(async () => root.render(<ForwarderExportRequestInbox userId={userId} onApply={onApply} appliedTradeId="b" headerAction={<button>직접 등록</button>} />));
  return onApply;
}

describe('수출 받은 의뢰 목록 배치', () => {
  it('빈 목록에서도 머리글·필터·하단 열기 버튼을 유지한다', async () => {
    await render(true);
    expect(container.querySelector('.fwd-inbox-heading-actions')?.textContent).toContain('직접 등록');
    expect(container.querySelectorAll('.fwd-inbox-filters button')).toHaveLength(3);
    expect(container.querySelector('thead')).toBeNull();
    expect(container.textContent).toContain('아직 받은 의뢰가 없습니다.');
    expect(container.querySelector<HTMLButtonElement>('.fwd-inbox-footer button')?.disabled).toBe(true);
  });
  it('현재 데이터의 신규·불러옴만 필터하고 기존 불러오기 콜백을 유지한다', async () => {
    const apply = await render();
    const filters = container.querySelectorAll<HTMLButtonElement>('.fwd-inbox-filters button');
    await act(async () => filters[1].click());
    expect(container.querySelector('tbody')?.textContent).toContain('화주 a');
    expect(container.querySelector('tbody')?.textContent).not.toContain('화주 b');
    await act(async () => container.querySelector<HTMLButtonElement>('.fwd-inbox-footer button')!.click());
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ tradeId: 'a' }));
    await act(async () => filters[2].click());
    expect(container.querySelector('tbody')?.textContent).toContain('화주 b');
    expect(container.querySelector('tbody')?.textContent).not.toContain('화주 a');
    expect(container.querySelectorAll('thead th')).toHaveLength(5);
  });
});

function swipe(row: HTMLElement, dx: number) {
  const opts = (x: number) => ({ bubbles: true, button: 0, pointerId: 1, clientX: x, clientY: 100 });
  row.setPointerCapture = () => {};
  act(() => {
    row.dispatchEvent(new PointerEvent('pointerdown', opts(400)));
    row.dispatchEvent(new PointerEvent('pointermove', opts(400 + dx / 2)));
    row.dispatchEvent(new PointerEvent('pointermove', opts(400 + dx)));
  });
  return () => act(async () => { row.dispatchEvent(new PointerEvent('pointerup', opts(400 + dx))); });
}

const rowOf = (name: string) =>
  Array.from(container.querySelectorAll<HTMLTableRowElement>('tbody tr')).find((tr) => tr.textContent?.includes(name));

describe('받은 수출 의뢰 — 왼쪽으로 밀어 목록에서 삭제', () => {
  beforeEach(() => window.localStorage.clear());

  it('충분히 밀면 목록에서 숨기고, 다시 열어도 그 사용자 목록에서는 숨긴 채로 둔다', async () => {
    await render();
    const release = swipe(rowOf('화주 a')!, -200);
    expect(rowOf('화주 a')?.textContent).toContain('놓으면 삭제');
    await release();
    expect(rowOf('화주 a')).toBeUndefined();
    expect(container.querySelector('h2')?.textContent).toContain('1건');
    expect(container.querySelector('.trash-open')?.getAttribute('aria-label')).toBe('휴지통 1건');

    await act(async () => root.unmount());
    container.remove();
    await render();
    expect(rowOf('화주 a')).toBeUndefined();

    // 같은 브라우저라도 다른 계정의 목록은 그대로다
    await act(async () => root.unmount());
    container.remove();
    await render(false, 'fwd-2');
    expect(rowOf('화주 a')).toBeDefined();
  });

  it('조금만 밀면 그대로 두고, 민 뒤의 클릭은 행 선택으로 보지 않는다', async () => {
    await render();
    const selectedBefore = container.querySelector('tbody tr.is-selected')?.textContent;
    await swipe(rowOf('화주 b')!, -60)();
    expect(rowOf('화주 b')).toBeDefined();
    await act(async () => rowOf('화주 b')!.click());
    expect(container.querySelector('tbody tr.is-selected')?.textContent).toBe(selectedBefore);
  });

  it('지운 의뢰는 휴지통에 모이고, 하나씩 복원할 수 있다', async () => {
    await render();
    await swipe(rowOf('화주 a')!, -200)();
    await swipe(rowOf('화주 b')!, -200)();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);

    await act(async () => container.querySelector<HTMLButtonElement>('.trash-open')!.click());
    const items = () => Array.from(container.querySelectorAll('.trash-list li'));
    expect(items().map((li) => li.querySelector('strong')?.textContent)).toEqual(['화주 a · 화물 a', '화주 b · 화물 b']);

    const restoreA = items()[0].querySelector('button')!;
    await act(async () => restoreA.click());
    expect(rowOf('화주 a')).toBeDefined();
    expect(rowOf('화주 b')).toBeUndefined();
    expect(items()).toHaveLength(1);
  });

  it('휴지통의 [모두 복원]은 지운 의뢰를 전부 되돌린다', async () => {
    await render();
    await swipe(rowOf('화주 a')!, -200)();
    await swipe(rowOf('화주 b')!, -200)();
    await act(async () => container.querySelector<HTMLButtonElement>('.trash-open')!.click());
    const restoreAll = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === '모두 복원')!;
    await act(async () => restoreAll.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.textContent).toContain('휴지통이 비어 있어요.');
  });
});
