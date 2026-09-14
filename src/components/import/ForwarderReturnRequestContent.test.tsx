import { describe, expect, it } from 'vitest';
import { splitReturnRequest, buildReturnRequestLetter, readReturnRequestLetter } from './ForwarderReturnRequestContent';

describe('splitReturnRequest', () => {
  it('stores the greeting and actual sender signature while preserving the full request body', () => {
    const body = '[반드시 수정]\n· 중량 확인\n\n(추가 안내) 내일 회신 부탁드립니다.';
    const reason = buildReturnRequestLetter(body, ' 회사명 ', ' 담당자명 ');
    expect(reason).toContain('안녕하세요.');
    expect(reason).toContain('회사명 포워더 담당자명 드림');
    expect(readReturnRequestLetter(reason).body).toBe(body);
    expect(readReturnRequestLetter(reason).signature).toBe('회사명 포워더 담당자명 드림');
    expect(buildReturnRequestLetter(body, '', '')).toMatch(/포워더 드림$/);
    expect(readReturnRequestLetter(body)).toEqual({ body });
  });
  it('separates existing required, recommended and memo text without losing request details', () => {
    const groups = splitReturnRequest('[반드시 수정]\n· P/L 1,250kg, B/L 1,280kg\n· 원산지 누락\n\n[함께 확인 요청]\n· 재질 확인\n\n(추가 안내) 금요일까지 회신 바랍니다.\n담당자에게 문의하세요.');
    expect(groups.map(group => [group.kind, group.title])).toEqual([['required', '필수 수정'], ['recommended', '추가 확인'], ['note', '전달 메모']]);
    expect(groups[0].lines.join('\n')).toContain('· P/L 1,250kg, B/L 1,280kg\n· 원산지 누락');
    expect(groups[1].lines.join('\n')).toContain('· 재질 확인');
    expect(groups[2].lines.join('\n')).toBe('금요일까지 회신 바랍니다.\n담당자에게 문의하세요.');
  });
  it('preserves legacy free text and unknown headings', () => {
    const reason = '기존 요청 내용\r\n[별도 요청]\r\n서명과 날짜를 확인하세요.';
    expect(splitReturnRequest(reason)).toEqual([{ kind: 'note', title: '요청 내용', lines: ['기존 요청 내용', '[별도 요청]', '서명과 날짜를 확인하세요.'] }]);
  });
  it('does not show empty categories', () => {
    expect(splitReturnRequest('[반드시 수정]\n\n[함께 확인 요청]\n· 확인 요청').map(group => group.kind)).toEqual(['recommended']);
    expect(splitReturnRequest('')).toEqual([]);
  });
});
