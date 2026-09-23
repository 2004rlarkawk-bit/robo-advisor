/**
 * 대화 목록을 메신저처럼 묶는다 — 날짜 구분선, 같은 사람이 연속으로 보낸 메시지 묶기.
 *
 * 화면(TradeMessageThread)에서 분리한 이유는 "누구 이름을 어디에 보여줄지, 시간을 어느 줄에
 * 붙일지"가 규칙이라 테스트로 고정하기 좋기 때문이다. 날짜·시간은 모두 한국 시간 기준이다.
 */
import type { TradeMessage } from '../types/forwarderRequest';

export interface GroupedMessageItem {
  message: TradeMessage;
  /** 보낸 사람이 바뀐 첫 줄 — 이 줄에만 이름·프로필을 보여준다. */
  showSender: boolean;
  /** 같은 사람이 같은 분(分)에 이어 보낸 묶음의 마지막 줄 — 시간은 여기에만 붙인다. */
  showTime: boolean;
}

export interface MessageDayGroup {
  /** 같은 날 판정을 위한 키(YYYY-MM-DD, 한국 시간) */
  dateKey: string;
  /** 구분선에 쓸 표기 — 오늘 / 어제 / 2026년 9월 19일 */
  dateLabel: string;
  items: GroupedMessageItem[];
}

const KST = 'Asia/Seoul';

function dayKey(date: Date): string {
  // en-CA는 YYYY-MM-DD로 떨어져 문자열 비교로 날짜를 가를 수 있다.
  return new Intl.DateTimeFormat('en-CA', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function minuteKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function shiftDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * 한국 시간 기준 연·월·일·시·분을 숫자로 뽑는다.
 *
 * 한국어 표기(오후 6:47, 2026년 9월 19일)를 ko-KR 로캘에 맡기지 않는 이유: 로캘 데이터는
 * 실행 환경(Node 빌드·ICU)에 따라 달라 CI에서 'PM 6:47'이 나온 적이 있다. 숫자만 뽑고
 * 한국어는 직접 붙여 어디서나 같은 문자열이 나오게 한다. (시간대 데이터는 로캘과 별개다.)
 */
function kstParts(date: Date): { year: string; month: string; day: string; hour: number; minute: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  // hour12:false에서 자정은 환경에 따라 '24'로 나오기도 한다.
  const hour = Number(value('hour')) % 24;
  return { year: value('year'), month: value('month'), day: value('day'), hour, minute: value('minute') };
}

function dayLabel(date: Date, now: Date): string {
  const key = dayKey(date);
  if (key === dayKey(now)) return '오늘';
  if (key === dayKey(shiftDays(now, -1))) return '어제';
  const { year, month, day } = kstParts(date);
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

/** 말풍선 옆에 붙는 시각 — 오후 6:47 */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const { hour, minute } = kstParts(date);
  const meridiem = hour < 12 ? '오전' : '오후';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${meridiem} ${hour12}:${minute}`;
}

export function groupTradeMessages(messages: TradeMessage[], now: Date = new Date()): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];

  messages.forEach((message, index) => {
    const date = new Date(message.createdAt);
    // 시각을 읽을 수 없는 메시지는 날짜로 묶지 않고 앞 묶음에 이어 붙인다.
    const valid = !Number.isNaN(date.getTime());
    let group: MessageDayGroup | undefined = groups[groups.length - 1];
    const key = valid ? dayKey(date) : (group?.dateKey ?? 'unknown');
    if (!group || group.dateKey !== key) {
      group = { dateKey: key, dateLabel: valid ? dayLabel(date, now) : '', items: [] };
      groups.push(group);
    }

    const previous = messages[index - 1];
    const next = messages[index + 1];
    const sameDayAsPrevious = Boolean(previous) && group.items.length > 0;
    const showSender = !sameDayAsPrevious || previous.senderUserId !== message.senderUserId || previous.senderRole !== message.senderRole;

    const sameSenderNext = next?.senderUserId === message.senderUserId && next?.senderRole === message.senderRole;
    const nextDate = next ? new Date(next.createdAt) : null;
    const nextValid = Boolean(nextDate) && !Number.isNaN(nextDate!.getTime());
    const sameMinuteNext = valid && nextValid && minuteKey(date) === minuteKey(nextDate!);
    const showTime = !sameSenderNext || !sameMinuteNext;

    group.items.push({ message, showSender, showTime });
  });

  return groups;
}
