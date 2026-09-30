import { describe, expect, it } from 'vitest';
import { readEdgeErrorDetail } from './edgeErrorDetail';

function edgeError(body: unknown): Error & { context: { json: () => Promise<unknown> } } {
  const error = new Error('Edge Function returned a non-2xx status code') as Error & {
    context: { json: () => Promise<unknown> };
  };
  error.context = { json: () => Promise.resolve(body) };
  return error;
}

describe('Edge Function 오류에서 진짜 사유 꺼내기', () => {
  it('본문의 error 문장을 돌려준다', async () => {
    const detail = await readEdgeErrorDetail(edgeError({ success: false, error: '관세청 환율 정보에서 US$ 통화를 찾지 못했습니다.' }));
    expect(detail).toBe('관세청 환율 정보에서 US$ 통화를 찾지 못했습니다.');
  });

  it('본문에 사유가 없으면 원래 메시지를 쓴다', async () => {
    const detail = await readEdgeErrorDetail(edgeError({ success: false }));
    expect(detail).toBe('Edge Function returned a non-2xx status code');
  });

  it('JSON이 아니면 본문 텍스트를 쓴다', async () => {
    const error = new Error('non-2xx') as Error & { context: unknown };
    error.context = {
      json: () => Promise.reject(new Error('not json')),
      text: () => Promise.resolve('Function timed out'),
    };
    expect(await readEdgeErrorDetail(error)).toBe('Function timed out');
  });

  it('응답이 아예 없으면 원래 메시지', async () => {
    expect(await readEdgeErrorDetail(new Error('network error'))).toBe('network error');
  });

  it('Error가 아닌 값도 견딘다', async () => {
    expect(await readEdgeErrorDetail(null)).toBe('알 수 없는 오류');
  });
});
