/**
 * 서류·추출값에 적힌 숫자 표기를 숫자로 읽는다.
 *
 * "1,200 KG", "USD 8,000.50", "USD8,000"처럼 단위·통화가 붙어 있어도 첫 숫자만 취한다.
 * "M3", "㎥"처럼 영문자 바로 뒤에 붙은 2·3은 단위의 지수로 보고 숫자에서 제외한다
 * ("1.25 M3" → 1.25). 숫자가 없으면(빈 값, "N/A", "-") null을 반환한다.
 *
 * 폼 입력처럼 숫자만 허용해야 하는 곳에는 쓰지 않는다 — "12abc"도 12로 읽기 때문이다.
 */
export function parseTradeNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const withoutUnitExponent = value
    .normalize('NFKC')
    .replace(/([A-Za-z])[23](?![\d,.])/g, '$1');
  const match = withoutUnitExponent.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;

  const parsed = Number(match[0].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
