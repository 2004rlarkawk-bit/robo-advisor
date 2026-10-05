/**
 * 입력 수정 안내 카드의 문구를 읽기 쉽게 나눈다.
 *
 * - 문장마다 줄을 바꾼다.
 * - 첫 문장(사실)의 날짜·일수·숫자는 강조한다.
 * - 이후 문장은 연결어미 뒤의 주절(무엇이 문제인지)을 강조한다.
 *   예: "해상 운송치고 지나치게 길어 [연도·월 오타가 의심됩니다.]"
 */
export type FixNoticeSegment = { text: string; tone?: 'value' | 'key' };
export type FixNoticeLine = FixNoticeSegment[];

const VALUE_PATTERN = /(\d{4}-\d{2}-\d{2}|\d[\d,]*(?:\.\d+)?\s?(?:일|개|건|EA|kg|KG|%))/g;
// 연결어미(…어/아/여/서/며/면) 또는 쉼표 다음에서 주절이 시작된다.
const CLAUSE_BREAK = /(?:[어아여서며면]|,)\s/g;

function splitSentences(message: string): string[] {
  return message
    .split(/(?<=[다요]\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function highlightValues(sentence: string): FixNoticeLine {
  const line: FixNoticeLine = [];
  let last = 0;
  for (const match of sentence.matchAll(VALUE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) line.push({ text: sentence.slice(last, start) });
    line.push({ text: match[0], tone: 'value' });
    last = start + match[0].length;
  }
  if (last < sentence.length) line.push({ text: sentence.slice(last) });
  return line;
}

function highlightMainClause(sentence: string): FixNoticeLine {
  let clauseStart = 0;
  for (const match of sentence.matchAll(CLAUSE_BREAK)) {
    clauseStart = (match.index ?? 0) + match[0].length;
  }
  if (clauseStart === 0) return [{ text: sentence, tone: 'key' }];
  return [
    { text: sentence.slice(0, clauseStart) },
    { text: sentence.slice(clauseStart), tone: 'key' },
  ];
}

export function formatFixNoticeMessage(message: string): FixNoticeLine[] {
  const sentences = splitSentences(message);
  if (sentences.length <= 1) return sentences.map(highlightValues);
  return sentences.map((sentence, index) => (index === 0 ? highlightValues(sentence) : highlightMainClause(sentence)));
}
