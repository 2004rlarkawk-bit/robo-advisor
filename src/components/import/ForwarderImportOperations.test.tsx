// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { normalizeImportExtractedFields } from '../../services/importDocumentAnalysisService';
import { buildImportDeclarationDocx, downloadImportDeclarationDocx, printImportDeclarationAsPdf, renderImportDeclarationPreview } from '../../services/importDeclarationService';
import ForwarderImportOperations from './ForwarderImportOperations';

vi.mock('../../services/importDeclarationService', async original => ({
  ...await original<object>(),
  buildImportDeclarationDocx: vi.fn(), downloadImportDeclarationDocx: vi.fn(),
  printImportDeclarationAsPdf: vi.fn(), renderImportDeclarationPreview: vi.fn(),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const item = { tradeId: 'test', stage: 'clearance', importer: '테스트 화주', blNo: 'BL-TEST', trade: { forwarderCase: { stage: 'clearance' } }, snapshot: { documents: [], risks: [], analysis: { extracted: normalizeImportExtractedFields({ importer: '테스트 화주', blNo: 'BL-TEST' }) } } } as unknown as ForwarderImportCase;

describe('수입 포워더 업무 진행', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onSave = vi.fn();
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!;
  const control = (label: string) => [...host.querySelectorAll('label')].find(node => node.querySelector('span')?.textContent === label)!.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')!;
  const change = async (label: string, value: string) => act(async () => {
    const node = control(label);
    Object.getOwnPropertyDescriptor(node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
  const blur = async (label: string) => act(async () => { control(label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  const render = (locked = false) => act(async () => root.render(<ForwarderImportOperations item={item} saving={false} locked={locked} arrivalNotice={<div>A/N</div>} onSave={onSave} />));
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    onSave.mockResolvedValue(true);
    vi.mocked(buildImportDeclarationDocx).mockResolvedValue(new Blob(['test']));
    vi.mocked(renderImportDeclarationPreview).mockResolvedValue(undefined);
    vi.mocked(downloadImportDeclarationDocx).mockResolvedValue(undefined);
    vi.mocked(printImportDeclarationAsPdf).mockResolvedValue(undefined);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

  it('keeps download and record edits locked until source review is complete', async () => {
    await render(true);
    expect(button('DOCX 다운로드').disabled).toBe(true);
    expect(button('PDF 저장').disabled).toBe(true);
    expect(button('업무 기록 저장')).toBeUndefined();
    expect(control('신고 진행 상태').closest('fieldset')?.disabled).toBe(true);
    await act(async () => button('DOCX 다운로드').click());
    expect(downloadImportDeclarationDocx).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves the record as soon as it changes — status on select, text on leaving the field', async () => {
    await render();
    await change('신고 진행 상태', 'filed');
    // 상태는 고르는 즉시 저장하고 업무 기록에 남긴다. 빠진 신고번호는 바로 알려 준다.
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ declarationStatus: 'filed' }), expect.stringContaining('수입 신고 진행 기록'));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('수입신고번호');
    await change('수입신고번호', 'TEST-DECL-001');
    await blur('수입신고번호');
    await change('담당 관세사 / 관세법인', '테스트 관세법인');
    await blur('담당 관세사 / 관세법인');
    // 글자 수정은 기록 없이 값만 저장한다.
    expect(onSave).toHaveBeenLastCalledWith(expect.objectContaining({ declarationStatus: 'filed', declarationNo: 'TEST-DECL-001', brokerName: '테스트 관세법인' }), '');
    expect(host.textContent).toContain('자동 저장했습니다.');
    expect(host.textContent).not.toContain('업무 기록 저장');
    expect(host.textContent).not.toContain('납부 확인');
  });

  it('shows the generated DOCX inline, and offers the same DOCX and PDF actions as the shipper', async () => {
    await render();
    await change('담당 관세사 / 관세법인', '테스트 관세사');
    await act(async () => button('보기').click());
    expect(buildImportDeclarationDocx).toHaveBeenCalledWith(expect.objectContaining({ customsBroker: '테스트 관세사' }));
    expect(renderImportDeclarationPreview).toHaveBeenCalledWith(expect.any(Blob), expect.any(HTMLElement));
    expect(host.querySelector('[aria-label="수입신고 의뢰서 미리보기"]')).not.toBeNull();
    await act(async () => button('닫기').click());
    expect(host.querySelector('[aria-label="수입신고 의뢰서 미리보기"]')).toBeNull();
    await act(async () => button('DOCX 다운로드').click());
    expect(downloadImportDeclarationDocx).toHaveBeenCalledWith(expect.objectContaining({ customsBroker: '테스트 관세사' }));
    await act(async () => button('PDF 저장').click());
    expect(printImportDeclarationAsPdf).toHaveBeenCalledWith(expect.objectContaining({ customsBroker: '테스트 관세사' }));
    expect(host.textContent).not.toContain('화물인도지시서');
  });

  it('retains the broker entry if saving fails', async () => {
    await render();
    await change('담당 관세사 / 관세법인', '테스트 관세사');
    onSave.mockResolvedValueOnce(false);
    await blur('담당 관세사 / 관세법인');
    expect(control('담당 관세사 / 관세법인').value).toBe('테스트 관세사');
    expect(host.textContent).not.toContain('자동 저장했습니다.');
  });
});
