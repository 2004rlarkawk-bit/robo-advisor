import { describe, expect, it } from 'vitest';
import { decideGeneratedTradeWrite } from './tradePersistencePolicy';

describe('필요서류 생성 저장 정책', () => {
  it('현재 거래 ID가 없으면 최초 생성 INSERT를 선택한다', () => {
    expect(decideGeneratedTradeWrite(null, null)).toBe('insert');
    expect(decideGeneratedTradeWrite('   ', null)).toBe('insert');
  });

  it('generated 거래 ID가 있으면 재생성 UPDATE를 선택한다', () => {
    expect(decideGeneratedTradeWrite('trade-a', 'generated')).toBe('update');
  });

  it('submitted 거래는 ID 유무와 관계없이 재생성을 차단한다', () => {
    expect(decideGeneratedTradeWrite('trade-a', 'submitted')).toBe('blocked_submitted');
  });
});
