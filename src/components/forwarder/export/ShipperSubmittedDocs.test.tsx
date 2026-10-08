// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GeneratedDocuments } from '../../../types';
import ShipperSubmittedDocs from './ShipperSubmittedDocs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ShipperSubmittedDocs — 수출 포워더 STEP 1의 화주 제출 서류', () => {
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
  });

  it('화주가 만든 서류만 화주 화면과 같은 순서·약어로 보여 준다', () => {
    const docs = {
      invoice: {}, packingList: {}, transportRequest: {}, customsDeclaration: {},
    } as unknown as GeneratedDocuments;
    act(() => root.render(<ShipperSubmittedDocs docs={docs} />));
    const rows = [...container.querySelectorAll('.fwd-shipper-doc-gallery li')];
    expect(rows.map((row) => row.querySelector('.fwd-shipper-doc-abbr')?.textContent)).toEqual(['C/I', 'P/L', 'S/I', 'E/D']);
    expect(container.querySelector('h3')?.textContent).toContain('화주가 제출한 서류 4');
  });

  it('없는 서류는 빼고, 하나도 없으면 영역 자체를 그리지 않는다', () => {
    act(() => root.render(<ShipperSubmittedDocs docs={{ invoice: {} } as unknown as GeneratedDocuments} />));
    expect(container.querySelectorAll('.fwd-shipper-doc-gallery li')).toHaveLength(1);
    act(() => root.render(<ShipperSubmittedDocs docs={null} />));
    expect(container.querySelector('.fwd-export-shipper-docs')).toBeNull();
  });
});
