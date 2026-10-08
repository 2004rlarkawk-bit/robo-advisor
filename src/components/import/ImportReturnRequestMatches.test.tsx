import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ImportReturnRequestMatches, { importReturnFieldLabel, importReturnInputKey } from './ImportReturnRequestMatches';
import type { ImportAnalysisResult } from '../../types/importTrade';

const analysis = {
  extracted: { items: [{ id: 'item-1' }], grossWeight: '100 kg' },
  comparison: [{ field: '수량', invoice: '150개', packingList: '160개', billOfLading: '-', matches: false, detail: '' }],
} as ImportAnalysisResult;

describe('화주 보완 카드', () => {
  it('AI 생성값이 아닌 원본 대사값만 비교해서 표시한다', () => {
    const html = renderToStaticMarkup(<ImportReturnRequestMatches request={{ comparisonFields: ['수량'] }} analysis={analysis} />);
    expect(html).toContain('150개');
    expect(html).toContain('160개');
    expect(html).toContain('원본 서류는 바뀌지 않습니다');
  });

  it('수량 요청을 실제 입력 항목으로 연결한다', () => {
    expect(importReturnFieldLabel('수량')).toBe('수량');
    expect(importReturnInputKey('수량', analysis)).toBe('item-1.quantity');
    expect(importReturnInputKey('수량', { ...analysis, extracted: { ...analysis.extracted, items: [{ id: 'item-1' }, { id: 'item-2' }] } } as ImportAnalysisResult)).toBeNull();
  });
});
