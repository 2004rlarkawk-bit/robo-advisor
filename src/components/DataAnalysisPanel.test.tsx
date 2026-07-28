// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DataAnalysisPanel, { recentRange } from './DataAnalysisPanel';
import {
  getCountryTradeStats,
  getItemTradeStats,
  getTotalTradeStats,
} from '../services/customsApiService';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../services/customsApiService', () => ({
  getTotalTradeStats: vi.fn(),
  getCountryTradeStats: vi.fn(),
  getItemTradeStats: vi.fn(),
}));

const totalMock = vi.mocked(getTotalTradeStats);
const countryMock = vi.mocked(getCountryTradeStats);
const itemMock = vi.mocked(getItemTradeStats);
const empty = { records: [], source: 'api' as const, latestPeriod: null, recordCount: 0 };

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DataAnalysisPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.resetAllMocks();
  });

  it('KST 기준 직전 완료 6개월과 연도 경계를 계산한다', () => {
    expect(recentRange(6, new Date('2026-07-28T03:00:00Z'))).toEqual({
      start: '202601',
      end: '202606',
    });
    expect(recentRange(6, new Date('2026-01-15T03:00:00Z'))).toEqual({
      start: '202507',
      end: '202512',
    });
  });

  it('실제 API 결과의 출처와 최신 기준월을 표시한다', async () => {
    totalMock.mockResolvedValue({
      records: [{ period: '202606', exportCount: 1, exportAmount: 100, importCount: 1, importAmount: 80, balance: 20, source: 'api' }],
      source: 'api',
      latestPeriod: '202606',
      recordCount: 1,
    });
    countryMock.mockResolvedValue({
      records: [{ period: '202606', countryCode: 'US', countryName: '미국', exportCount: 1, exportAmount: 60, importCount: 1, importAmount: 40, balance: 20, source: 'api' }],
      source: 'api',
      latestPeriod: '202606',
      recordCount: 1,
    });
    itemMock.mockResolvedValue({
      records: [{ period: '202606', hsCode: '8517621010', exportWeight: 1, exportAmount: 10, importWeight: 1, importAmount: 8, balance: 2, source: 'api' }],
      source: 'api',
      latestPeriod: '202606',
      recordCount: 1,
    });

    await act(async () => root.render(<DataAnalysisPanel />));
    await flush();

    expect(container.textContent).toContain('관세청 원데이터');
    expect(container.textContent).toContain('최신 기준: 2026년 6월');
    expect(totalMock).toHaveBeenCalledTimes(1);
    expect(countryMock).toHaveBeenCalledTimes(1);
    expect(itemMock).toHaveBeenCalledWith('8517621010', expect.any(String), expect.any(String));
  });

  it('정상 빈 응답은 임의 차트 없이 빈 상태로 표시한다', async () => {
    totalMock.mockResolvedValue(empty);
    countryMock.mockResolvedValue(empty);
    itemMock.mockResolvedValue(empty);
    await act(async () => root.render(<DataAnalysisPanel />));
    await flush();
    expect(container.textContent?.match(/선택한 기간에 조회된 관세청 데이터가 없습니다\./g)).toHaveLength(3);
    expect(container.textContent).not.toContain('시뮬레이션');
  });

  it('API 오류를 표시하고 다시 시도한다', async () => {
    totalMock.mockRejectedValueOnce(new Error('secret detail')).mockResolvedValueOnce(empty);
    countryMock.mockResolvedValue(empty);
    itemMock.mockResolvedValue(empty);
    await act(async () => root.render(<DataAnalysisPanel />));
    await flush();

    expect(container.textContent).toContain('관세청 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    const retry = container.querySelector('[role="alert"] button') as HTMLButtonElement | null;
    expect(retry).toBeTruthy();
    await act(async () => retry?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await flush();
    expect(totalMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('secret detail');
  });
});
