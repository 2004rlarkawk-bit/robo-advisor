/**
 * 서류에서 뽑아낸 통화 표기를 ISO 4217 세 글자 코드로 맞춘다.
 *
 * 관세청 환율 API는 'USD'처럼 정확한 코드로만 찾을 수 있는데, 상업송장에는 'US$', '$',
 * 'USD.' 처럼 사람이 읽는 표기가 그대로 적혀 있고 AI 추출도 그 표기를 따라간다.
 * 그대로 넘기면 "관세청 환율 정보에서 US$ 통화를 찾지 못했습니다"로 예상세액 계산이 통째로 막힌다.
 *
 * 기호가 여러 나라에서 겹치는 경우(예: $)는 가장 흔한 쪽으로 정한다 — 무역 서류의 '$'는
 * 관행상 미국 달러다. 확실하지 않으면 바꾸지 않고 대문자로만 정리해 넘긴다.
 */

const CURRENCY_ALIASES: Record<string, string> = {
  // 달러 계열 — 무역 서류에서 수식어 없는 $는 미국 달러로 본다.
  '$': 'USD', 'US$': 'USD', 'USD$': 'USD', 'U$': 'USD', 'US': 'USD', 'USDOLLAR': 'USD', 'USDOLLARS': 'USD',
  'A$': 'AUD', 'AU$': 'AUD', 'C$': 'CAD', 'CA$': 'CAD', 'S$': 'SGD', 'SG$': 'SGD',
  'HK$': 'HKD', 'NT$': 'TWD', 'NZ$': 'NZD',
  // 유로·파운드·엔·위안·원
  '€': 'EUR', 'EURO': 'EUR', 'EUROS': 'EUR',
  '£': 'GBP', 'STG': 'GBP', 'POUND': 'GBP',
  '¥': 'JPY', 'JP¥': 'JPY', 'YEN': 'JPY',
  'RMB': 'CNY', 'CNH': 'CNY', 'YUAN': 'CNY', '元': 'CNY', 'CN¥': 'CNY',
  '₩': 'KRW', 'WON': 'KRW', 'KRW원': 'KRW',
  // 그 밖에 자주 보이는 표기
  '₫': 'VND', 'DONG': 'VND', '₹': 'INR', 'RS': 'INR', '฿': 'THB', 'RP': 'IDR', 'RM': 'MYR', '₱': 'PHP',
};

/**
 * 통화 표기를 코드로 바꾼다. 알아볼 수 없으면 공백·기호만 정리한 대문자를 그대로 돌려준다
 * — 임의로 USD라고 단정하면 엉뚱한 환율로 세액을 계산하게 된다.
 */
export function normalizeCurrencyCode(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.replace(/\s+/g, '').toUpperCase();
  if (!trimmed) return '';

  const direct = CURRENCY_ALIASES[trimmed];
  if (direct) return direct;

  // 'USD.', 'USD:' 처럼 뒤에 구두점이 붙은 경우
  const stripped = trimmed.replace(/[.,:;()[\]]/g, '');
  if (CURRENCY_ALIASES[stripped]) return CURRENCY_ALIASES[stripped];
  if (/^[A-Z]{3}$/.test(stripped)) return stripped;

  // 'USD 12,000' 처럼 금액이 같이 붙어 온 경우 — 앞쪽 세 글자 코드만 쓴다.
  const leadingCode = stripped.match(/^([A-Z]{3})(?=[^A-Z]|$)/);
  if (leadingCode) return leadingCode[1];

  return stripped;
}
