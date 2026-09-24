// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForwarderExportRequestInbox from './ForwarderExportRequestInbox';

const { listRequests } = vi.hoisted(() => ({ listRequests: vi.fn() }));
vi.mock('../services/forwarderExportRequestService', () => ({ listForwarderExportRequests: listRequests }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function render(empty = false) {
  listRequests.mockResolvedValue(empty ? [] : ['a', 'b'].map(id => ({
    tradeId: id, exporterName: '화주 ' + id, itemSummary: '화물 ' + id,
    requestNo: id, requestedAt: '2026-09-23T00:00:00Z', loadPort: 'BUSAN', dischargePort: 'TOKYO',
  })));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const onApply = vi.fn();
  await act(async () => root.render(<ForwarderExportRequestInbox onApply={onApply} appliedTradeId="b" headerAction={<button>직접 등록</button>} />));
  return onApply;
}

describe('수출 받은 의뢰 목록 배치', () => {
  it('빈 목록에서도 머리글·필터·동작 버튼의 위치를 유지한다', async () => {
    await render(true);
    expect(container.querySelector('.fwd-inbox-heading-actions')?.textContent).toContain('직접 등록');
    expect(container.querySelectorAll('.fwd-inbox-filters button')).toHaveLength(3);
    expect(container.querySelectorAll('thead th')).toHaveLength(5);
    expect(container.textContent).toContain('아직 도착한 운송의뢰가 없습니다.');
  });
  it('현재 데이터의 신규·불러옴만 필터하고 기존 불러오기 콜백을 유지한다', async () => {
    const apply = await render();
    const filters = container.querySelectorAll<HTMLButtonElement>('.fwd-inbox-filters button');
    await act(async () => filters[1].click());
    expect(container.querySelector('tbody')?.textContent).toContain('화주 a');
    expect(container.querySelector('tbody')?.textContent).not.toContain('화주 b');
    await act(async () => container.querySelector<HTMLButtonElement>('tbody button')!.click());
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ tradeId: 'a' }));
    await act(async () => filters[2].click());
    expect(container.querySelector('tbody')?.textContent).toContain('화주 b');
    expect(container.querySelector('tbody')?.textContent).not.toContain('화주 a');
  });
});
