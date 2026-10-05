import { describe, expect, it } from 'vitest';
import { formatFixNoticeMessage } from './fixNoticeMessage';

const emphasized = (lines: ReturnType<typeof formatFixNoticeMessage>, tone: 'value' | 'key') =>
  lines.flat().filter((segment) => segment.tone === tone).map((segment) => segment.text);

describe('입력 수정 안내 문구', () => {
  it('운송 기간 안내를 사실과 판단 두 줄로 나누고 날짜·일수·판단을 강조한다', () => {
    const lines = formatFixNoticeMessage(
      '출항일(2026-10-11)부터 도착예정일(2027-10-23)까지 377일입니다. 해상 운송치고 지나치게 길어 연도·월 오타가 의심됩니다.',
    );
    expect(lines).toHaveLength(2);
    expect(emphasized(lines, 'value')).toEqual(['2026-10-11', '2027-10-23', '377일']);
    expect(emphasized(lines, 'key')).toEqual(['연도·월 오타가 의심됩니다.']);
  });

  it('연결어미가 없는 행동 문장은 통째로 강조한다', () => {
    const lines = formatFixNoticeMessage('신용장 개설일이 선적일보다 늦습니다. 날짜를 확인하세요.');
    expect(emphasized(lines, 'key')).toEqual(['날짜를 확인하세요.']);
  });

  it('한 문장짜리 안내는 줄을 나누지 않고 숫자만 강조한다', () => {
    const lines = formatFixNoticeMessage('총중량 120 kg이 순중량보다 작습니다.');
    expect(lines).toHaveLength(1);
    expect(emphasized(lines, 'value')).toEqual(['120 kg']);
    expect(emphasized(lines, 'key')).toEqual([]);
  });
});
