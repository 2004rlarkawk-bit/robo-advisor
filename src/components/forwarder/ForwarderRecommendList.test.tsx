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
  matchedSpecialties: ['route_cn', 'cargo_cold'], customSpecialties: ['삼국간 무역'], activeCount: 2, completedCount: 14,
  isPartner: true, partnerCompanyName: null,
};
const plain: ForwarderMatchCandidate = {
  id: 'fwd-ks', companyName: 'Korea Shipping', contactName: 'Lee', specialties: ['route_cn'],
  matchedSpecialties: ['route_cn'], customSpecialties: [], activeCount: 0, completedCount: 3,
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

  it('거래에서 뽑은 조건을 미리 체크해 보여준다', async () => {
    await render();
    const conditions = [...container.querySelectorAll('.fwd-cond-chip.is-on')];
    expect(conditions.map((chip) => chip.textContent)).toEqual(['중국 항로', '콜드체인', '식품·농수산물']);
    expect(conditions.every((chip) => chip.getAttribute('aria-checked') === 'true')).toBe(true);
    // 나머지 조건은 '조건 추가'를 눌러야 펼쳐진다.
    expect(container.querySelector('.fwd-cond-more')).toBeNull();
  });

  it('버튼을 더 누르지 않아도 조건으로 추천을 바로 불러온다', async () => {
    await render();
    // 오류 1 + 경고 1 = 2건 → 경험 우선
    expect(requestService.matchForwarderForTrade).toHaveBeenCalledWith('trade-1', ['route_cn', 'cargo_cold', 'goods_food'], true);
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

  it('담당자·진행 건수와 함께 특화 분야를 아이콘 칩 세 개까지만 보여 준다', async () => {
    await render();
    const [first] = rows();
    expect(first.textContent).toContain('담당 Kim');
    expect(first.textContent).toContain('현재 진행 2건');
    expect(first.textContent).toContain('완료 14건');
    const chips = [...first.querySelectorAll('.fwd-basis-chip')];
    // 일치한 분야가 먼저 오고, 직접 적은 '삼국간 무역'은 일치 표시 없이 뒤에 붙는다.
    expect(chips.map((chip) => chip.textContent)).toEqual(['중국 항로', '콜드체인', '삼국간 무역']);
    expect(chips.slice(0, 2).every((chip) => chip.classList.contains('is-match') && chip.querySelector('svg'))).toBe(true);
    expect(chips[2].classList.contains('is-match')).toBe(false);
    // 안내 문구는 띄우지 않는다.
    expect(container.textContent).not.toContain('확인 항목이');
  });

  it('조건과 일치한 분야가 없으면 포워더가 등록한 분야로 채운다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([
      { ...plain, specialties: ['cargo_dg', 'cargo_express', 'route_us', 'goods_food'], matchedSpecialties: [] },
    ]);
    await render();
    const chips = [...rows()[0].querySelectorAll('.fwd-basis-chip')];
    expect(chips.map((chip) => chip.textContent)).toEqual(['위험물', '특송·이커머스', '미국 항로']);
    expect(chips.some((chip) => chip.classList.contains('is-match'))).toBe(false);
  });

  it('미리 고르지 않고 1순위에 추천 배지만 붙인다 — 화주가 직접 눌러야 선택된다', async () => {
    await render();
    expect(onSelected).toHaveBeenLastCalledWith(null);
    expect(rows().every((row) => row.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(rows()[0].querySelector('.fwd-pick-top')?.textContent).toBe('추천');
    expect(rows()[1].querySelector('.fwd-pick-top')).toBeNull();

    await act(async () => { rows()[1].click(); });
    expect(onSelected).toHaveBeenLastCalledWith(plain);
    expect(rows()[1].getAttribute('aria-checked')).toBe('true');
  });

  it('조건을 바꿔 다시 추천해도 고른 포워더가 남아 있으면 선택을 유지한다', async () => {
    await render();
    await act(async () => { rows()[1].click(); });
    await act(async () => { button('콜드체인').click(); });
    expect(onSelected).toHaveBeenLastCalledWith(plain);
    expect(rows()[1].getAttribute('aria-checked')).toBe('true');
  });

  it('조건을 바꾼 뒤 [포워더 재추천하기]를 눌러야 그 조건으로 다시 추천한다', async () => {
    await render();
    const callCount = () => requestService.matchForwarderForTrade.mock.calls.length;
    const lastSpecialties = () => requestService.matchForwarderForTrade.mock.calls[callCount() - 1][1];
    const rerun = () => button('포워더 재추천하기') as HTMLButtonElement;
    // 조건이 그대로면 재추천 버튼은 꺼져 있다.
    expect(rerun().disabled).toBe(true);

    await act(async () => { button('조건 추가').click(); });
    expect(button('러시아·CIS 항로')).toBeUndefined();
    const before = callCount();
    await act(async () => { button('소량 혼적(LCL)').click(); });
    await act(async () => { button('콜드체인').click(); });
    // 조건만 바꿔서는 다시 부르지 않는다.
    expect(callCount()).toBe(before);
    expect(rerun().disabled).toBe(false);

    await act(async () => { rerun().click(); });
    expect(callCount()).toBe(before + 1);
    expect(lastSpecialties()).toEqual(['route_cn', 'goods_food', 'cargo_lcl']);
    expect(rerun().disabled).toBe(true);
  });

  it('기타 조건을 적고 재추천하면 그 분야를 직접 등록한 포워더를 앞으로 올린다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([
      partner,
      { ...plain, customSpecialties: ['전시화물 운송'] },
    ]);
    await render();
    expect(rows()[0].textContent).toContain('ABC Logistics');

    await act(async () => { button('조건 추가').click(); });
    const input = container.querySelector('.fwd-cond-custom input') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(input, '전시화물');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector('.fwd-cond-custom') as HTMLFormElement).requestSubmit();
    });
    // 적기만 해서는 순서가 바뀌지 않는다.
    expect(rows()[0].textContent).toContain('ABC Logistics');

    await act(async () => { button('포워더 재추천하기').click(); });
    expect(rows()[0].textContent).toContain('Korea Shipping');
    expect(rows()[0].textContent).toContain('추천');
  });

  it('제휴사명이 따로 등록돼 있으면 담당자 프로필 업체명 대신 제휴사명을 보여준다', async () => {
    requestService.matchForwarderForTrade.mockResolvedValue([
      { ...partner, companyName: '김포워더 개인사업자', partnerCompanyName: 'ABC Logistics' },
    ]);
    await render();
    expect(rows()[0].textContent).toContain('ABC Logistics');
    expect(rows()[0].textContent).not.toContain('김포워더 개인사업자');
  });

  it('후보는 상위 3곳만 먼저 보여 주고 나머지는 더 보기로 펼친다', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...plain, id: `fwd-${i}`, companyName: `Forwarder ${i}` }));
    requestService.matchForwarderForTrade.mockResolvedValue(many);
    await render();
    expect(rows()).toHaveLength(3);
    await act(async () => { button('2곳 더 보기').click(); });
    expect(rows()).toHaveLength(5);
    expect(button('더 보기')).toBeUndefined();
  });

  it('조건 추가를 펼치면 기타 조건을 직접 적을 수 있고, 포워더가 적은 분야와 겹치면 일치로 표시한다', async () => {
    const onCustomConditionsChange = vi.fn();
    requestService.matchForwarderForTrade.mockResolvedValue([
      { ...plain, specialties: ['route_us'], matchedSpecialties: [], customSpecialties: ['삼국간 무역'] },
    ]);
    await render({ onCustomConditionsChange });
    expect(container.querySelector('.fwd-cond-custom')).toBeNull();
    await act(async () => { button('조건 추가').click(); });
    const input = container.querySelector('.fwd-cond-custom input') as HTMLInputElement;
    expect(input).not.toBeNull();

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(input, '삼국간');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector('.fwd-cond-custom') as HTMLFormElement).requestSubmit();
    });

    expect(onCustomConditionsChange).toHaveBeenLastCalledWith(['삼국간']);
    expect(container.querySelector('.fwd-cond-chip.is-custom')?.textContent).toBe('삼국간');
    // 직접 적은 조건은 서버 추천을 다시 부르지 않는다.
    expect(requestService.matchForwarderForTrade).toHaveBeenCalledTimes(1);
    // 겹치는 직접 적은 분야는 등록 분야보다 앞으로 올라와 일치로 칠해진다.
    const [firstTag] = [...rows()[0].querySelectorAll('.fwd-basis-chip')];
    expect(firstTag.textContent).toBe('삼국간 무역');
    expect(firstTag.classList.contains('is-match')).toBe(true);

    await act(async () => { (container.querySelector('.fwd-cond-chip.is-custom') as HTMLButtonElement).click(); });
    expect(onCustomConditionsChange).toHaveBeenLastCalledWith([]);
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
});
