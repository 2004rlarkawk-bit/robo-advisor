// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedTrade } from '../../types';
import type { ForwarderMatchCandidate } from '../../types/forwarderRequest';

const requestService = vi.hoisted(() => ({ matchForwarderForTrade: vi.fn() }));
const portService = vi.hoisted(() => ({
  loadPortData: vi.fn(),
  portCountryCode: vi.fn((port: string | undefined) => (port === 'Shanghai Port' ? 'CN' : null)),
}));

vi.mock('../../services/forwarderRequestService', () => requestService);
vi.mock('../../services/portLocodeService', () => portService);

import ForwarderAutoAssign from './ForwarderAutoAssign';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const trade = {
  id: 'trade-1',
  tradeDirection: 'export',
  profile: { tradeType: 'export', itemName: 'Frozen Mackerel', hsCode: '0303890000', loadPort: 'Busan Port', dischargePort: 'Shanghai Port' },
  issues: [{ severity: 'error' }, { severity: 'warning' }, { severity: 'info' }],
  documents: [],
  createdAt: '2026-09-21T00:00:00.000Z',
} as unknown as SavedTrade;

const kim: ForwarderMatchCandidate = {
  id: 'fwd-kim', companyName: 'PortAI Forwarding', contactName: 'Kim', specialties: ['route_cn', 'cargo_cold'],
  matchedSpecialties: ['route_cn', 'cargo_cold'], activeCount: 2, completedCount: 14,
};
const lee: ForwarderMatchCandidate = {
  id: 'fwd-lee', companyName: 'PortAI Forwarding', contactName: 'Lee', specialties: ['route_cn'],
  matchedSpecialties: ['route_cn'], activeCount: 0, completedCount: 3,
};

describe('ForwarderAutoAssign', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onAssigned = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    portService.loadPortData.mockResolvedValue([]);
    requestService.matchForwarderForTrade.mockResolvedValue([kim, lee]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  const render = async (props: Partial<Parameters<typeof ForwarderAutoAssign>[0]> = {}) => {
    await act(async () => { root.render(<ForwarderAutoAssign trade={trade} onAssigned={onAssigned} {...props} />); });
  };
  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

  it('거래에서 뽑은 조건을 근거와 함께 미리 체크해 보여준다', async () => {
    await render();
    const rows = [...container.querySelectorAll('.fwd-cond-row')];
    expect(rows.map((row) => row.querySelector('.fwd-cond-label')?.textContent)).toEqual(['중국 항로', '콜드체인']);
    expect(rows[0].textContent).toContain('도착항 Shanghai Port');
    expect(rows[1].textContent).toContain('HS 03류');
    expect(rows.every((row) => row.getAttribute('aria-checked') === 'true')).toBe(true);
    // 자동으로 뽑힌 조건은 "조건 추가" 칩에 다시 나오지 않는다.
    expect([...container.querySelectorAll('.fwd-cond-chip')].map((chip) => chip.textContent)).not.toContain('중국 항로');
  });

  it('선택한 조건과 난이도 우선 여부로 배정하고, 근거를 보여준다', async () => {
    await render();
    await act(async () => { button('담당자 자동 배정').click(); });

    // 오류 1 + 경고 1 = 2건 → 경험 우선
    expect(requestService.matchForwarderForTrade).toHaveBeenCalledWith('trade-1', ['route_cn', 'cargo_cold'], true);
    expect(onAssigned).toHaveBeenLastCalledWith(kim);
    const result = container.querySelector('.fwd-assign-result')!;
    expect(result.textContent).toContain('Kim');
    expect(result.textContent).toContain('중국 항로 일치');
    expect(result.textContent).toContain('콜드체인 일치');
    expect(result.textContent).toContain('진행 중 2건');
    expect(result.textContent).toContain('완료 14건');
    expect(result.textContent).toContain('확인 항목이 2건');
  });

  it('다른 후보를 누르면 그 담당자로 바뀐다', async () => {
    await render();
    await act(async () => { button('담당자 자동 배정').click(); });
    await act(async () => { button('Lee').click(); });
    expect(onAssigned).toHaveBeenLastCalledWith(lee);
    expect(container.querySelector('.fwd-assign-who strong')?.textContent).toBe('Lee');
  });

  it('조건을 바꾸면 이전 배정을 지우고 다시 배정하게 한다', async () => {
    await render();
    await act(async () => { button('담당자 자동 배정').click(); });
    await act(async () => { button('LCL 콘솔').click(); });
    expect(onAssigned).toHaveBeenLastCalledWith(null);
    expect(container.querySelector('.fwd-assign-result')).toBeNull();
    expect(button('담당자 자동 배정')).toBeTruthy();
  });

  it('일치하는 특화 담당자가 없으면 그 사실을 그대로 알린다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([{ ...lee, matchedSpecialties: [] }]);
    await render();
    await act(async () => { button('담당자 자동 배정').click(); });
    expect(container.textContent).toContain('조건과 일치하는 특화 담당자가 없어');
  });

  it('겸용 계정 본인에게 배정되면 안내한다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([{ ...kim, id: 'me' }]);
    await render({ currentUserId: 'me' });
    await act(async () => { button('담당자 자동 배정').click(); });
    expect(container.textContent).toContain('본인(겸용) 계정으로 배정');
  });

  it('배정 조회가 실패하면 직접 찾기로 안내하고 배정을 비운다', async () => {
    requestService.matchForwarderForTrade.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render();
    await act(async () => { button('담당자 자동 배정').click(); });
    expect(container.textContent).toContain('이메일로 직접 찾아 주세요');
    expect(onAssigned).toHaveBeenLastCalledWith(null);
  });
});
