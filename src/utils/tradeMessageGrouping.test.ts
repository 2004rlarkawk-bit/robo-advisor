import { describe, expect, it } from 'vitest';
import type { TradeMessage } from '../types/forwarderRequest';
import { formatMessageTime, groupTradeMessages } from './tradeMessageGrouping';

const now = new Date('2026-09-21T09:00:00.000Z'); // 한국시간 9/21 18:00

function message(id: string, senderUserId: string, createdAt: string): TradeMessage {
  return { id, tradeRequestId: 'req-1', tradeId: 'trade-1', senderUserId, kind: 'message', body: id, createdAt, readAt: null };
}

const shape = (groups: ReturnType<typeof groupTradeMessages>) => groups.map((group) => ({
  label: group.dateLabel,
  items: group.items.map((item) => `${item.message.id}${item.showSender ? '+이름' : ''}${item.showTime ? '+시각' : ''}`),
}));

describe('groupTradeMessages', () => {
  it('날짜가 바뀌면 묶음을 나누고 오늘·어제를 표기한다 (한국 시간 기준)', () => {
    const groups = groupTradeMessages([
      message('m1', 'a', '2026-09-19T01:00:00.000Z'),
      message('m2', 'a', '2026-09-20T01:00:00.000Z'),
      message('m3', 'a', '2026-09-21T01:00:00.000Z'),
    ], now);
    expect(groups.map((group) => group.dateLabel)).toEqual(['2026년 9월 19일', '어제', '오늘']);
    expect(groups.map((group) => group.dateKey)).toEqual(['2026-09-19', '2026-09-20', '2026-09-21']);
  });

  it('UTC로는 같은 날이라도 한국 시간으로 날짜가 다르면 나눈다', () => {
    const groups = groupTradeMessages([
      message('m1', 'a', '2026-09-20T14:00:00.000Z'), // KST 9/20 23:00
      message('m2', 'a', '2026-09-20T16:00:00.000Z'), // KST 9/21 01:00
    ], now);
    expect(groups.map((group) => group.dateKey)).toEqual(['2026-09-20', '2026-09-21']);
  });

  it('같은 사람이 연이어 보내면 이름은 첫 줄에만, 시각은 마지막 줄에만 붙인다', () => {
    const groups = groupTradeMessages([
      message('m1', 'a', '2026-09-21T01:00:00.000Z'),
      message('m2', 'a', '2026-09-21T01:00:30.000Z'),
      message('m3', 'b', '2026-09-21T01:01:00.000Z'),
    ], now);
    expect(shape(groups)).toEqual([{ label: '오늘', items: ['m1+이름', 'm2+시각', 'm3+이름+시각'] }]);
  });

  it('같은 사람이라도 분이 바뀌면 각 줄에 시각을 붙인다', () => {
    const groups = groupTradeMessages([
      message('m1', 'a', '2026-09-21T01:00:00.000Z'),
      message('m2', 'a', '2026-09-21T01:02:00.000Z'),
    ], now);
    expect(shape(groups)).toEqual([{ label: '오늘', items: ['m1+이름+시각', 'm2+시각'] }]);
  });

  it('날짜가 바뀌면 같은 사람이어도 이름을 다시 보여준다', () => {
    const groups = groupTradeMessages([
      message('m1', 'a', '2026-09-20T01:00:00.000Z'),
      message('m2', 'a', '2026-09-21T01:00:00.000Z'),
    ], now);
    expect(shape(groups)).toEqual([
      { label: '어제', items: ['m1+이름+시각'] },
      { label: '오늘', items: ['m2+이름+시각'] },
    ]);
  });

  it('빈 목록은 빈 배열', () => {
    expect(groupTradeMessages([], now)).toEqual([]);
  });

  it('시각을 읽을 수 없는 메시지도 버리지 않고 앞 묶음에 이어 붙인다', () => {
    const groups = groupTradeMessages([
      message('m1', 'a', '2026-09-21T01:00:00.000Z'),
      message('m2', 'a', 'not-a-date'),
    ], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((item) => item.message.id)).toEqual(['m1', 'm2']);
  });
});

describe('formatMessageTime', () => {
  it('한국 시간 오전·오후로 표기한다 (로캘 데이터에 기대지 않는다)', () => {
    expect(formatMessageTime('2026-09-21T09:47:00.000Z')).toBe('오후 6:47');
    expect(formatMessageTime('2026-09-21T00:05:00.000Z')).toBe('오전 9:05');
  });

  it('정오·자정 경계를 12시로 표기한다', () => {
    expect(formatMessageTime('2026-09-21T03:00:00.000Z')).toBe('오후 12:00'); // KST 12:00
    expect(formatMessageTime('2026-09-21T15:00:00.000Z')).toBe('오전 12:00'); // KST 00:00
  });

  it('읽을 수 없는 값은 빈 문자열', () => {
    expect(formatMessageTime('nope')).toBe('');
  });
});
