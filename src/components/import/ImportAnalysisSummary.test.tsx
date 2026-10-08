// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeImportExtractedFields } from '../../services/importDocumentAnalysisService';
import ImportAnalysisSummary from './ImportAnalysisSummary';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(readOnly = false) {
  const extracted = normalizeImportExtractedFields({
    blNo: 'HCMBUS26041701',
    vesselName: 'MSC ANNA',
    invoiceNo: 'INV-001',
    currency: 'USD',
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImportAnalysisSummary
        analysis={{ extracted, validations: [], comparison: [] }}
        onChange={vi.fn()}
        readOnly={readOnly}
      />,
    );
  });
  return container;
}

const labels = (el: HTMLElement) => Array.from(el.querySelectorAll('.form-label')).map((label) => label.textContent);
const chips = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLButtonElement>('.import-hidden-field-chip'));

describe('수입 AI 추출값 — 서류에 있는 칸만 보이기', () => {
  it('값을 찾은 칸과 꼭 필요한 칸은 보이고, 비어 있는 선택 칸은 숨긴다', () => {
    const el = render();
    expect(labels(el)).toEqual(expect.arrayContaining(['B/L 번호*', '선박명', '적재항*', 'Invoice 총금액*']));
    expect(labels(el)).not.toContain('항차');
    expect(labels(el)).not.toContain('결제조건');
    expect(chips(el).map((chip) => chip.textContent?.trim())).toEqual(expect.arrayContaining(['항차', '결제조건']));
  });

  it('[+ 칸 이름]을 누르면 그 칸이 나타나고 버튼은 사라진다', () => {
    const el = render();
    const voyage = chips(el).find((chip) => chip.textContent?.trim() === '항차');
    act(() => voyage?.click());
    expect(labels(el)).toContain('항차');
    expect(chips(el).some((chip) => chip.textContent?.trim() === '항차')).toBe(false);
  });

  it('읽기 전용이면 칸 추가 버튼을 보이지 않는다', () => {
    const el = render(true);
    expect(chips(el)).toHaveLength(0);
  });

  it('기존 필수 판정이 있는 칸에만 스크린리더 라벨이 있는 별표를 표시한다', () => {
    const el = render();
    const required = Array.from(el.querySelectorAll('.form-label')).find((label) => label.textContent === 'B/L 번호*');
    const optional = Array.from(el.querySelectorAll('.form-label')).find((label) => label.textContent === '선박명');
    expect(required?.querySelector('.required-star')?.getAttribute('aria-label')).toBe('필수');
    expect(optional?.querySelector('.required-star')).toBeNull();
  });

  it('보완 카드의 수정 버튼이 숨겨진 추출 칸을 열고 초점을 이동한다', () => {
    vi.useFakeTimers();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const extracted = normalizeImportExtractedFields({ invoiceNo: 'INV-001' });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<ImportAnalysisSummary
      analysis={{ extracted, validations: [], comparison: [] }}
      onChange={vi.fn()}
      focusTarget={{ key: 'voyageNo', nonce: 1 }}
    />));
    act(() => vi.advanceTimersByTime(60));
    const target = container.querySelector<HTMLInputElement>('[data-import-field-key="voyageNo"]');
    expect(target).not.toBeNull();
    expect(document.activeElement).toBe(target);
    expect(target?.closest('details')?.open).toBe(true);
    vi.useRealTimers();
  });
});
