import { describe, it, expect } from 'vitest';
import { rankHeadingTitles } from './hsDataService';

const headings: Record<string, string> = {
  '0302': 'Fish; fresh or chilled, excluding fish fillets',
  '030354': 'Fish; frozen, mackerel (Scomber scombrus, Scomber australasicus, Scomber japonicus), excluding fillets',
  '030339': 'Fish; frozen, flat fish, n.e.c. in item no. 0303.3, excluding fillets',
  '160415': 'Fish preparations; mackerel, whole or in pieces, but not minced',
  '640411': 'Sports footwear; tennis shoes, basketball shoes, gym shoes, training shoes and the like, with outer soles of rubber or plastics and uppers of textile materials',
  '640419': 'Footwear; (other than sports footwear), with outer soles of rubber or plastics and uppers of textile materials',
  '640299': 'Footwear; n.e.c. in heading no. 6402, with outer soles and uppers of rubber or plastics',
  '871160': 'Motorcycles (including mopeds) and cycles; fitted with auxiliary motor, with electric motor for propulsion',
  '850811': 'Vacuum cleaners; with self-contained electric motor, of a power not exceeding 1500W',
};

describe('rankHeadingTitles', () => {
  it('두 단어 이상 겹치는 소호를 점수순으로 고른다', () => {
    expect(rankHeadingTitles('frozen mackerel', headings)).toEqual(['030354']);
    expect(rankHeadingTitles('running shoes with rubber sole and textile upper', headings))
      .toEqual(['640411', '640419']);
  });

  it('복수형·단수형 차이를 무시한다', () => {
    expect(rankHeadingTitles('robot vacuum cleaner', headings)).toEqual(['850811']);
  });

  it('단어 하나만 겹치거나 한글 입력이면 고르지 않는다', () => {
    expect(rankHeadingTitles('electric kick scooter', headings)).toEqual([]);
    expect(rankHeadingTitles('mackerel', headings)).toEqual([]);
    expect(rankHeadingTitles('냉동 고등어', headings)).toEqual([]);
  });

  it('4자리 호 제목은 후보로 쓰지 않는다', () => {
    expect(rankHeadingTitles('fresh chilled fish', headings)).toEqual([]);
  });
});
