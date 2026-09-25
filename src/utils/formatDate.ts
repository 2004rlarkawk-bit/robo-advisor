/**
 * 화면·서식에 날짜를 찍는 단 하나의 규칙.
 *
 * 화면마다 따로 만들어 쓰던 formatDate가 다섯 벌 있었고 각각 다르게 틀렸다.
 * - 값이 없을 때(null) `new Date(null)`이 1970.01.01로 떨어져 "1970.01.01 09:00"이 찍혔다.
 * - 어떤 화면은 연도를 빼고 "9월 25일"만 찍어 작년 의뢰와 올해 의뢰가 같아 보였다.
 * - 실행 환경의 시간대를 그대로 따라가서 서버·CI에서는 하루 어긋난 날짜가 나왔다.
 *
 * 그래서 여기서는 (1) 값이 없거나 날짜가 아니면 fallback을 돌려주고, (2) 연도를 항상 찍고,
 * (3) 어디서 실행하든 한국 시간을 기준으로 삼는다. 한국어·숫자 표기는 로캘에 맡기지 않고
 * 숫자만 뽑아 직접 조립한다 — ko-KR 로캘 데이터는 Node 빌드(ICU)에 따라 달라
 * CI에서 'PM 6:47' 같은 표기가 나온 적이 있다.
 */

const KST = 'Asia/Seoul';

export type DateInput = string | Date | null | undefined;

/** 날짜로 읽히지 않으면 null. `new Date(null)`이 1970으로 떨어지는 걸 여기서 막는다. */
export function toValidDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

interface KstParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

function kstParts(date: Date): KstParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  // hour12:false에서 자정은 환경에 따라 '24'로 나오기도 한다.
  const hour = String(Number(value('hour')) % 24).padStart(2, '0');
  return { year: value('year'), month: value('month'), day: value('day'), hour, minute: value('minute') };
}

/** 2026.09.25 — 목록·카드의 기본 날짜 표기. */
export function formatKstDate(value: DateInput, fallback = '-'): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  const { year, month, day } = kstParts(date);
  return `${year}.${month}.${day}`;
}

/** 2026.09.25 14:30 — 접수·제출 시각처럼 분 단위가 필요한 자리. */
export function formatKstDateTime(value: DateInput, fallback = '-'): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  const { year, month, day, hour, minute } = kstParts(date);
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

/** 2026. 09. 25 — 관세청 서식의 날짜 칸 표기. */
export function formatKstDateSpaced(value: DateInput, fallback = '-'): string {
  const date = toValidDate(value);
  if (!date) return fallback;
  const { year, month, day } = kstParts(date);
  return `${year}. ${month}. ${day}`;
}
