import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { getRelatedLawForIssue, searchLaw } from './lawService';

beforeEach(() => {
  invokeMock.mockReset();
});

describe('law-search Edge Function 서비스', () => {
  it('검색어와 limit을 전달하고 LawSearchResult 배열로 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        query: '관세법',
        count: 1,
        laws: [{
          lawId: '001571',
          lawName: '관세법',
          lawType: '법률',
          department: '기획재정부',
          effectiveDate: '20260101',
          detailUrl: 'https://www.law.go.kr/법령/관세법',
          source: 'api',
        }],
        source: 'api',
      },
      error: null,
    });

    const result = await searchLaw(' 관세법 ', 10);

    expect(invokeMock).toHaveBeenCalledWith('law-search', {
      body: { query: '관세법', limit: 10 },
    });
    expect(result).toEqual([{
      lawId: '001571',
      lawName: '관세법',
      lawType: '법률',
      department: '기획재정부',
      effectiveDate: '20260101',
      detailUrl: 'https://www.law.go.kr/법령/관세법',
      source: 'api',
    }]);
  });

  it('빈 검색어는 Edge Function을 호출하지 않고 빈 배열을 반환한다', async () => {
    await expect(searchLaw('   ')).resolves.toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('정상 응답의 빈 laws는 오류가 아닌 빈 배열이다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, query: '없는 법령', count: 0, laws: [], source: 'api' },
      error: null,
    });
    await expect(searchLaw('없는 법령')).resolves.toEqual([]);
  });

  it('functions.invoke 오류는 경고 후 시뮬레이션으로 폴백한다', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network') });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await searchLaw('관세법');

    expect(result[0]).toMatchObject({ lawName: '관세법', source: 'simulation' });
    expect(warn).toHaveBeenCalledWith(
      '법제처 법령검색 Edge Function 호출 실패, 시뮬레이션 폴백:',
      expect.any(Error)
    );
  });

  it('success:false는 서버 메시지를 보존해 경고 후 폴백한다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'LAW_GO_KR request failed' },
      error: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await searchLaw('무역');

    expect(result[0].source).toBe('simulation');
    expect(String(warn.mock.calls[0]?.[1])).toContain('LAW_GO_KR request failed');
  });

  it('잘못된 law 행은 제외하고 정상 행만 반환한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        laws: [
          { lawId: 123, lawName: '잘못된 행', lawType: '', department: '', effectiveDate: '', detailUrl: '', source: 'api' },
          { lawId: '1', lawName: '정상 법령', lawType: '법률', department: '부처', effectiveDate: '20260101', detailUrl: '/detail', source: 'api' },
          { lawId: '2', lawName: '', lawType: '', department: '', effectiveDate: '', detailUrl: '', source: 'api' },
        ],
      },
      error: null,
    });

    const result = await searchLaw('법령');

    expect(result).toHaveLength(1);
    expect(result[0].lawName).toBe('정상 법령');
  });

  it('getRelatedLawForIssue 정적 매핑을 그대로 유지한다', () => {
    expect(getRelatedLawForIssue('dutiable-value-info')?.article).toBe('제30조');
    expect(getRelatedLawForIssue('co-required')?.lawName).toBe('대외무역법');
    expect(getRelatedLawForIssue('없는-이슈')).toBeNull();
  });
});
