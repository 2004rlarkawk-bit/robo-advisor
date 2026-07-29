// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShipperItem } from '../types';

const { recommendMock } = vi.hoisted(() => ({
  recommendMock: vi.fn(),
}));

vi.mock('../services/shipperHSCodeSuggestionService', () => ({
  recommendShipperHSCode: recommendMock,
  normalizeHSKCode: (code: string) => code.replace(/[\s.-]/g, ''),
}));

import { useShipperHSCodeSuggestions } from './useShipperHSCodeSuggestions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const item = (
  id: string,
  itemName: string
): ShipperItem => ({
  id,
  itemName,
  hsCode: '',
  quantity: '',
  unit: 'EA',
  unitPrice: '',
  currency: 'KRW',
});

const suggestion = (code: string) => ({
  code,
  formattedCode: `${code.slice(0, 4)}.${code.slice(4, 6)}-${code.slice(6)}`,
  koreanName: '테스트 품목',
  englishName: 'Test item',
  classificationName: '(테스트)',
  reasoning: '충분한 상세정보',
  confidenceLabel: '높음' as const,
  source: 'openai-verified' as const,
});

function Harness({ items }: { items: ShipperItem[] }) {
  const recommendations = useShipperHSCodeSuggestions(items);
  return (
    <div>
      {items.map((current) => (
        <output data-item-id={current.id} key={current.id}>
          {JSON.stringify(recommendations.getState(current.id))}
        </output>
      ))}
    </div>
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  recommendMock.mockReset();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

describe('품목별 HS Code 추천 상태', () => {
  it('각 품목을 700ms debounce 후 독립적으로 요청한다', async () => {
    recommendMock.mockResolvedValue({
      suggestions: [],
      additionalInformationRequired: true,
      requiredAdditionalInfo: ['재질'],
    });

    act(() => {
      root?.render(
        <Harness items={[
          item('primary-item', 'Cotton knitted shirts'),
          item('second-item', 'Processed frozen fish'),
        ]} />
      );
    });

    act(() => vi.advanceTimersByTime(699));
    expect(recommendMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(recommendMock).toHaveBeenCalledTimes(2);
    expect(recommendMock).toHaveBeenCalledWith(
      'Cotton knitted shirts',
      undefined,
      'primary-item'
    );
    expect(recommendMock).toHaveBeenCalledWith(
      'Processed frozen fish',
      undefined,
      'second-item'
    );
  });

  it('품목명이 바뀐 뒤 도착한 이전 응답을 무시한다', async () => {
    const resolvers: Array<(value: {
      suggestions: ReturnType<typeof suggestion>[];
      additionalInformationRequired: boolean;
      requiredAdditionalInfo: string[];
    }) => void> = [];
    recommendMock.mockImplementation(() => new Promise((resolve) => {
      resolvers.push(resolve);
    }));

    act(() => {
      root?.render(
        <Harness items={[item('primary-item', '첫 번째 상세 품목')]} />
      );
    });
    act(() => vi.advanceTimersByTime(700));

    act(() => {
      root?.render(
        <Harness items={[item('primary-item', '두 번째 상세 품목')]} />
      );
    });
    act(() => vi.advanceTimersByTime(700));

    await act(async () => {
      resolvers[0]?.({
        suggestions: [suggestion('0101211000')],
        additionalInformationRequired: false,
        requiredAdditionalInfo: [],
      });
      await Promise.resolve();
    });
    expect(container?.textContent).not.toContain('0101211000');

    await act(async () => {
      resolvers[1]?.({
        suggestions: [suggestion('0101219000')],
        additionalInformationRequired: false,
        requiredAdditionalInfo: [],
      });
      await Promise.resolve();
    });
    expect(container?.textContent).toContain('0101219000');
  });

  it('삭제된 품목의 늦은 응답을 반영하지 않는다', async () => {
    let resolveRequest: ((value: {
      suggestions: ReturnType<typeof suggestion>[];
      additionalInformationRequired: boolean;
      requiredAdditionalInfo: string[];
    }) => void) | undefined;
    recommendMock.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    act(() => {
      root?.render(
        <Harness items={[item('delete-me', '삭제 예정 상세 품목')]} />
      );
    });
    act(() => vi.advanceTimersByTime(700));
    act(() => root?.render(<Harness items={[]} />));

    await act(async () => {
      resolveRequest?.({
        suggestions: [suggestion('0101211000')],
        additionalInformationRequired: false,
        requiredAdditionalInfo: [],
      });
      await Promise.resolve();
    });

    expect(container?.textContent).not.toContain('0101211000');
  });
});
