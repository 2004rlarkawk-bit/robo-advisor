import { describe, expect, it, vi } from 'vitest';
import { reloadOnceForStaleChunk } from './staleChunkReload';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
  };
}

describe('reloadOnceForStaleChunk', () => {
  it('사라진 조각 파일을 처음 만나면 새로고침한다', () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk({ now: () => 100_000, storage: memoryStorage(), reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('방금 새로고침했는데 또 실패하면 반복하지 않는다', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    reloadOnceForStaleChunk({ now: () => 100_000, storage, reload });
    expect(reloadOnceForStaleChunk({ now: () => 105_000, storage, reload })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // 한참 뒤(다음 배포 등)에는 다시 새로고침할 수 있다.
    expect(reloadOnceForStaleChunk({ now: () => 200_000, storage, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('저장소를 못 써도 새로고침은 한다', () => {
    const reload = vi.fn();
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(reloadOnceForStaleChunk({ now: () => 100_000, storage: broken, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
