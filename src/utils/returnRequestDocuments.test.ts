import { describe, expect, it } from 'vitest';
import {
  buildReturnRequestBody,
  returnRequestChips,
  returnRequestDocumentLabel,
} from './returnRequestDocuments';
import { splitReturnRequest } from '../components/import/ForwarderReturnRequestContent';

describe('보완 요청문 — 서류 단위로 적는다', () => {
  it('고른 서류마다 한 줄씩, 화면 서류 순서대로 사유를 적는다', () => {
    const body = buildReturnRequestBody([
      { type: 'bill_of_lading', reason: 'reissue' },
      { type: 'commercial_invoice', reason: 'missing' },
    ]);
    expect(body.split('\n')).toEqual([
      '[반드시 수정]',
      '• 상업송장(C/I) · 서류 누락 — 첨부된 파일이 없습니다. 서류를 올려 주세요.',
      '• 선하증권(B/L) · 원본·재발행 필요 — 현재 파일로는 신고에 사용할 수 없습니다. 원본이나 재발행본을 보내 주세요.',
    ]);
  });

  it('메모는 전달 메모로 덧붙이고, 비어 있으면 넣지 않는다', () => {
    expect(buildReturnRequestBody([{ type: 'packing_list', reason: 'check' }], '  총 수량이 900개인지 확인 부탁드립니다. '))
      .toContain('(추가 안내) 총 수량이 900개인지 확인 부탁드립니다.');
    expect(buildReturnRequestBody([{ type: 'packing_list', reason: 'check' }], '   ')).not.toContain('(추가 안내)');
  });

  it('포워더·화주 화면이 쓰는 섹션 분리 규칙으로 그대로 읽힌다', () => {
    const body = buildReturnRequestBody([{ type: 'commercial_invoice', reason: 'unreadable' }], '원본 PDF로 부탁드립니다.');
    const groups = splitReturnRequest(body);
    expect(groups.map((group) => group.kind)).toEqual(['required', 'note']);
    expect(groups[0].lines.join('\n')).toContain('상업송장(C/I) · 판독 어려움');
    expect(groups[1].lines).toEqual(['원본 PDF로 부탁드립니다.']);
  });
});

describe('화주 화면의 서류 칩', () => {
  it('서류 단위로 저장된 요청은 서류 이름을 화면 순서대로 보여준다', () => {
    expect(returnRequestChips({ documentTypes: ['bill_of_lading', 'commercial_invoice'] }))
      .toEqual(['상업송장(C/I)', '선하증권(B/L)']);
  });

  it('예전 요청(서류 정보 없음)은 이슈 제목을 그대로 쓴다', () => {
    expect(returnRequestChips({ issueTitles: ['수량 불일치', ''] })).toEqual(['수량 불일치']);
    expect(returnRequestChips({})).toEqual([]);
  });

  it('모르는 서류 종류는 값을 그대로 보여준다', () => {
    expect(returnRequestDocumentLabel('arrival_notice')).toBe('arrival_notice');
  });
});
