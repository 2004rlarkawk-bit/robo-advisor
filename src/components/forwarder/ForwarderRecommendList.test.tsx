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

import ForwarderRecommendList from './ForwarderRecommendList';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const trade = {
  id: 'trade-1',
  tradeDirection: 'export',
  profile: { tradeType: 'export', itemName: 'Frozen Mackerel', hsCode: '0303890000', loadPort: 'Busan Port', dischargePort: 'Shanghai Port' },
  issues: [{ severity: 'error' }, { severity: 'warning' }, { severity: 'info' }],
  documents: [],
  createdAt: '2026-09-21T00:00:00.000Z',
} as unknown as SavedTrade;

const partner: ForwarderMatchCandidate = {
  id: 'fwd-abc', companyName: 'ABC Logistics', contactName: 'Kim', specialties: ['route_cn', 'cargo_cold'],
  matchedSpecialties: ['route_cn', 'cargo_cold'], activeCount: 2, completedCount: 14,
  isPartner: true, partnerCompanyName: null,
};
const plain: ForwarderMatchCandidate = {
  id: 'fwd-ks', companyName: 'Korea Shipping', contactName: 'Lee', specialties: ['route_cn'],
  matchedSpecialties: ['route_cn'], activeCount: 0, completedCount: 3,
  isPartner: false, partnerCompanyName: null,
};

describe('ForwarderRecommendList', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    portService.loadPortData.mockResolvedValue([]);
    requestService.matchForwarderForTrade.mockResolvedValue([partner, plain]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  const render = async (props: Partial<Parameters<typeof ForwarderRecommendList>[0]> = {}) => {
    await act(async () => { root.render(<ForwarderRecommendList trade={trade} onSelected={onSelected} {...props} />); });
  };
  const rows = () => [...container.querySelectorAll('.fwd-pick-row')] as HTMLButtonElement[];
  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

  it('거래에서 뽑은 조건을 근거와 함께 미리 체크해 보여준다', async () => {
    await render();
    const conditions = [...container.querySelectorAll('.fwd-cond-row')];
    expect(conditions.map((row) => row.querySelector('.fwd-cond-label')?.textContent)).toEqual(['중국 항로', '콜드체인']);
    expect(conditions[0].textContent).toContain('도착항 Shanghai Port');
    expect(conditions.every((row) => row.getAttribute('aria-checked') === 'true')).toBe(true);
  });

  it('버튼을 더 누르지 않아도 조건으로 추천을 바로 불러온다', async () => {
    await render();
    // 오류 1 + 경고 1 = 2건 → 경험 우선
    expect(requestService.matchForwarderForTrade).toHaveBeenCalledWith('trade-1', ['route_cn', 'cargo_cold'], true);
    expect(rows()).toHaveLength(2);
  });

  it('제휴 포워더에 배지를 붙이고, 일반 가입 포워더는 후순위 후보로 함께 보여준다', async () => {
    await render();
    const [first, second] = rows();
    expect(first.textContent).toContain('ABC Logistics');
    expect(first.querySelector('.fwd-pick-partner')?.textContent).toBe('제휴 포워더');
    expect(second.textContent).toContain('Korea Shipping');
    expect(second.querySelector('.fwd-pick-partner')).toBeNull();
  });

  it('추천 근거로 특화 분야·담당자·진행 건수를 함께 적는다', async () => {
    await render();
    const [first] = rows();
    expect(first.textContent).toContain('중국 항로');
    expect(first.textContent).toContain('콜드체인');
    expect(first.textContent).toContain('담당 Kim');
    expect(first.textContent).toContain('현재 진행 2건');
    expect(first.textContent).toContain('완료 14건');
    expect(container.textContent).toContain('확인 항목이 2건');
  });

  it('1순위를 미리 고른 상태로 두고, 화주가 다른 포워더를 누르면 그쪽으로 바뀐다', async () => {
    await render();
    expect(onSelected).toHaveBeenLastCalledWith(partner);
    expect(rows()[0].getAttribute('aria-checked')).toBe('true');

    await act(async () => { rows()[1].click(); });
    expect(onSelected).toHaveBeenLastCalledWith(plain);
    expect(rows()[1].getAttribute('aria-checked')).toBe('true');
    expect(rows()[0].getAttribute('aria-checked')).toBe('false');
  });

  it('조건을 바꾸면 그 조건으로 추천을 다시 불러온다', async () => {
    await render();
    await act(async () => { button('LCL 콘솔').click(); });
    const calls = requestService.matchForwarderForTrade.mock.calls;
    expect(calls[calls.length - 1][1]).toEqual(['route_cn', 'cargo_cold', 'cargo_lcl']);
  });

  it('제휴사명이 따로 등록돼 있으면 담당자 프로필 업체명 대신 제휴사명을 보여준다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([
      { ...partner, companyName: '김포워더 개인사업자', partnerCompanyName: 'ABC Logistics' },
    ]);
    await render();
    expect(rows()[0].textContent).toContain('ABC Logistics');
    expect(rows()[0].textContent).not.toContain('김포워더 개인사업자');
  });

  it('추천할 담당자가 없으면 다른 방법을 안내한다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([]);
    await render();
    expect(container.textContent).toContain('등록된 포워더 담당자가 아직 없습니다');
    expect(onSelected).toHaveBeenLastCalledWith(null);
  });

  it('추천 조회가 실패하면 직접 찾기로 안내하고 선택을 비운다', async () => {
    requestService.matchForwarderForTrade.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render();
    expect(container.textContent).toContain('이메일로 직접 찾아 주세요');
    expect(onSelected).toHaveBeenLastCalledWith(null);
  });

  it('겸용 계정 본인이 추천되면 그 사실을 알린다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([{ ...partner, id: 'me' }]);
    await render({ currentUserId: 'me' });
    expect(container.textContent).toContain('본인(겸용) 계정이 추천됩니다');
  });
});
