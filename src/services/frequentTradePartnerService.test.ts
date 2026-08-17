import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TradeFormDataV3, TradeFormParty } from '../types/tradeFormData';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: fromMock },
}));

import {
  buyerIdentity,
  calculateFrequentTradePartners,
  fetchFrequentTradePartners,
} from './frequentTradePartnerService';

function party(name: string, address = `${name} Address`, country = 'US'): TradeFormParty {
  return { name, address, country, contactName: '', contact: '', businessNumber: '', taxNumber: '' };
}

function row(
  buyer: TradeFormParty,
  submittedAt: string,
  consignee = buyer,
  notifyParty = consignee,
) {
  return {
    submitted_at: submittedAt,
    form_data: {
      parties: { buyer, partner: consignee, notifyParty },
    } as unknown as TradeFormDataV3,
  };
}

beforeEach(() => fromMock.mockReset());

describe('자주 거래한 거래처 계산', () => {
  it('회사명·국가·주소를 공백과 대소문자에 무관하게 묶고 거래 횟수 TOP 3만 반환한다', () => {
    const global = party('Global Import LLC', '250 Market Street', 'US');
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row(global, `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00Z`)),
      ...Array.from({ length: 5 }, (_, i) => row(party('ABC Trading'), `2026-07-${String(i + 1).padStart(2, '0')}T00:00:00Z`)),
      ...Array.from({ length: 3 }, (_, i) => row(party('Tokyo Trading'), `2026-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`)),
      row(party('New York Shop'), '2026-08-15T00:00:00Z'),
      row(party('  GLOBAL   IMPORT LLC ', ' 250 MARKET STREET ', ' us '), '2026-08-12T00:00:00Z'),
    ];

    const result = calculateFrequentTradePartners(rows);

    expect(result.map((item) => [item.buyer.name, item.transactionCount])).toEqual([
      ['  GLOBAL   IMPORT LLC ', 9],
      ['ABC Trading', 5],
      ['Tokyo Trading', 3],
    ]);
    expect(buyerIdentity(global)).toBe(buyerIdentity(party(' GLOBAL IMPORT LLC ', '250 MARKET STREET', 'us')));
  });

  it('횟수가 같으면 최근 거래 순이며 자동입력 데이터는 그 Buyer의 최신 거래 한 건 전체다', () => {
    const abc = party('ABC Trading');
    const tokyo = party('Tokyo Trading');
    const latestConsignee = party('California Distribution LLC');
    const latestNotify = party('Notify Desk', 'Notify Street', '');
    const result = calculateFrequentTradePartners([
      row(abc, '2026-07-01T00:00:00Z'),
      row(tokyo, '2026-06-01T00:00:00Z'),
      row(abc, '2026-06-15T00:00:00Z'),
      row(tokyo, '2026-08-01T00:00:00Z', latestConsignee, latestNotify),
    ]);

    expect(result.map((item) => item.buyer.name)).toEqual(['Tokyo Trading', 'ABC Trading']);
    expect(result[0].consignee).toEqual(latestConsignee);
    expect(result[0].notifyParty).toEqual(latestNotify);
  });

  it('로그인 사용자와 완료된 수출 화주 거래 조건을 쿼리에 모두 명시한다', async () => {
    const select = vi.fn();
    const eq = vi.fn();
    const not = vi.fn();
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const query = { select, eq, not, order };
    select.mockReturnValue(query);
    eq.mockReturnValue(query);
    not.mockReturnValue(query);
    fromMock.mockReturnValue(query);

    await expect(fetchFrequentTradePartners('user-a')).resolves.toEqual([]);

    expect(fromMock).toHaveBeenCalledWith('trades');
    expect(query.select).toHaveBeenCalledWith('form_data, submitted_at');
    expect(query.eq.mock.calls).toEqual(expect.arrayContaining([
      ['user_id', 'user-a'],
      ['direction', 'export'],
      ['role', 'shipper'],
      ['status', 'submitted'],
    ]));
    expect(query.not).toHaveBeenCalledWith('submitted_at', 'is', null);
  });
});
