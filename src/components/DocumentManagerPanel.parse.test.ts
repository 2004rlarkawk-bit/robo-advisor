import { describe, expect, it } from 'vitest';
import { parseReturnReason, splitReasonLine } from './DocumentManagerPanel';

describe('parseReturnReason', () => {
  it('섹션 제목과 항목을 나누고 반드시 수정 묶음을 표시한다', () => {
    const reason = '[반드시 수정]\n· Commercial Invoice와 Packing List의 품목 수량이 일치하지 않습니다.\n\n[함께 확인 요청]\n· Certificate of Origin이 첨부되지 않아 협정세율 적용 여부를 확인할 수 없습니다.';
    const sections = parseReturnReason(reason);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({
      title: '반드시 수정',
      lines: ['Commercial Invoice와 Packing List의 품목 수량이 일치하지 않습니다.'],
      blocking: true,
    });
    expect(sections[1].title).toBe('함께 확인 요청');
    expect(sections[1].blocking).toBe(false);
  });

  it('한 섹션에 여러 항목이 있으면 모두 담는다', () => {
    const sections = parseReturnReason('[반드시 수정]\n· 첫째\n· 둘째');
    expect(sections[0].lines).toEqual(['첫째', '둘째']);
  });

  it('형식이 다르면 빈 배열을 돌려 원문 표시로 넘긴다', () => {
    expect(parseReturnReason('인보이스 금액을 다시 확인해 주세요.')).toEqual([]);
  });
  it('사유 줄을 첫 연결어미 뒤에서 나눈다', () => {
    expect(splitReasonLine('Commercial Invoice와 Packing List의 품목 수량이 일치하지 않습니다.'))
      .toEqual(['Commercial Invoice와 Packing List의', '품목 수량이 일치하지 않습니다.']);
    expect(splitReasonLine('Certificate of Origin이 첨부되지 않아 협정세율 적용 여부를 확인할 수 없습니다.'))
      .toEqual(['Certificate of Origin이 첨부되지 않아', '협정세율 적용 여부를 확인할 수 없습니다.']);
    expect(splitReasonLine('서명 누락')).toEqual(['서명 누락', '']);
  });
});
