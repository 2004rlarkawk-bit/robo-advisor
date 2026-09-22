// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { normalizeImportExtractedFields } from '../../services/importDocumentAnalysisService';
import { downloadImportDeclarationDocx, mapImportDeclarationToSchema } from '../../services/importDeclarationService';
import ForwarderImportOperations from './ForwarderImportOperations';

vi.mock('../../services/importDeclarationService', async original => ({ ...await original<object>(), downloadImportDeclarationDocx: vi.fn() }));
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
  const render = (locked = false) => act(async () => root.render(<ForwarderImportOperations item={item} userId="test" saving={false} locked={locked} arrivalNotice={<div>A/N</div>} onSave={onSave} />));
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); onSave.mockResolvedValue(true); });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

  it('keeps download and record edits locked until source review is complete', async () => {
    await render(true);
    expect(button('자료 다운로드').disabled).toBe(true);
    expect(button('업무 기록 저장').disabled).toBe(true);
    expect(control('D/O 상태').closest('fieldset')?.disabled).toBe(true);
    await act(async () => button('자료 다운로드').click());
    expect(downloadImportDeclarationDocx).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires a declaration number for filed status and saves the explicit user record', async () => {
    await render();
    await change('신고 진행 상태', 'filed');
    await act(async () => button('업무 기록 저장').click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('수입신고번호');
    expect(onSave).not.toHaveBeenCalled();
    await change('수입신고번호', 'TEST-DECL-001');
    await change('담당 관세사 / 관세법인', '테스트 관세법인');
    await act(async () => button('업무 기록 저장').click());
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ declarationStatus: 'filed', declarationNo: 'TEST-DECL-001', brokerName: '테스트 관세법인' }), expect.any(String));
    expect(host.textContent).toContain('업무 기록을 저장했습니다.');
    expect(host.textContent).not.toContain('납부 확인');
  });

  it('retains input on failed save and carries broker and D/O values into the generated document', async () => {
    await render();
    await change('담당 관세사 / 관세법인', '테스트 관세사');
    await change('D/O 상태', 'received');
    await act(async () => button('업무 기록 저장').click());
    expect(onSave).not.toHaveBeenCalled();
    expect(host.textContent).toContain('번호 또는 원본');
    await change('D/O 번호', 'DO-TEST-22');
    onSave.mockResolvedValueOnce(false);
    await act(async () => button('업무 기록 저장').click());
    expect(control('D/O 번호').value).toBe('DO-TEST-22');
    expect(host.textContent).not.toContain('업무 기록을 저장했습니다.');
    await act(async () => button('자료 다운로드').click());
    expect(downloadImportDeclarationDocx).toHaveBeenCalledWith(expect.objectContaining({ customsBroker: '테스트 관세사', deliveryOrderNo: 'DO-TEST-22', hasDeliveryOrderDocument: false }));
    const schema = mapImportDeclarationToSchema({ fields: item.snapshot.analysis.extracted, customsBroker: '테스트 관세사', deliveryOrderNo: 'DO-TEST-22', hasDeliveryOrderDocument: true });
    expect(schema).toMatchObject({ customs_broker: '테스트 관세사', do_no: 'DO-TEST-22', cb_att_do: '■' });
  });
});
