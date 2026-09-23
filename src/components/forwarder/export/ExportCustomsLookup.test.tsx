// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ExportCustomsLookup from './ExportCustomsLookup';
import { getExportFulfillment } from '../../../services/unipassService';
vi.mock('../../../services/unipassService', () => ({ getExportFulfillment: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
function render(number = '123456') {
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root.render(<ExportCustomsLookup key={number} declarationNo={number} />));
}
async function lookup() {
  await act(async () => { container.querySelector('button')!.click(); });
}
afterEach(() => { act(() => root?.unmount()); vi.resetAllMocks(); });
describe('수출 유니패스 조회', () => {
  it('번호 없이는 조회하지 않는다', () => {
    render('');
    expect(container.querySelector('button')!.disabled).toBe(true);
    expect(getExportFulfillment).not.toHaveBeenCalled();
  });
  it('수리와 선적 완료를 별개로 표시한다', async () => {
    vi.mocked(getExportFulfillment).mockResolvedValue({ declarationNo: '123456', acceptDate: '20260923', loadDeadline: '20261023', shipmentCompleted: false, source: 'api' });
    render();
    await lookup();
    expect(getExportFulfillment).toHaveBeenCalledWith('123456');
    expect(container.textContent).toContain('수리 확인');
    expect(container.textContent).toContain('2026.09.23');
    expect(container.textContent).toContain('미완료');
  });
  it('결과 없음과 조회 실패를 구분하고 재시도할 수 있다', async () => {
    vi.mocked(getExportFulfillment).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(null);
    render();
    await lookup();
    expect(container.textContent).toContain('조회 결과가 없습니다');
    await lookup();
    expect(container.textContent).toContain('조회에 실패했습니다');
    expect(container.textContent).not.toContain('조회 결과가 없습니다');
    await lookup();
    expect(container.textContent).toContain('조회 결과가 없습니다');
  });
  it('거래나 번호가 바뀌면 이전 요청 결과를 표시하지 않는다', async () => {
    let resolve!: (value: null) => void;
    vi.mocked(getExportFulfillment).mockReturnValue(new Promise(r => { resolve = r; }));
    render();
    await lookup();
    act(() => root.render(<ExportCustomsLookup key="new" declarationNo="654321" />));
    await act(async () => resolve(null));
    expect(container.textContent).not.toContain('조회 결과가 없습니다');
    expect(container.textContent).toContain('입력하고 조회');
  });
});
