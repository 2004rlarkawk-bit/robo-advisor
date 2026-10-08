// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import {
  buildArrivalNoticeDocx, downloadArrivalNoticeDocx, printArrivalNoticeAsPdf, renderArrivalNoticePreview,
} from '../../services/arrivalNoticeDocxService';
import ForwarderArrivalNotice from './ForwarderArrivalNotice';

vi.mock('../../services/arrivalNoticeDocxService', async original => ({
  ...await original<object>(),
  buildArrivalNoticeDocx: vi.fn(), downloadArrivalNoticeDocx: vi.fn(),
  printArrivalNoticeAsPdf: vi.fn(), renderArrivalNoticePreview: vi.fn(),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const item = { tradeId: 'trade-1', arrivalNotice: null } as ForwarderImportCase;

describe('수입 포워더 도착안내서', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onChange = vi.fn();
  const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name)!;
  const render = (locked = false) => act(async () => root.render(<ForwarderArrivalNotice
    item={item} userId="test-user" issuerName="테스트 포워더" contactName="김담당"
    locked={locked} saving={false} lockReason="서류 검토 후 사용 가능" onChange={onChange}
  />));

  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    vi.mocked(buildArrivalNoticeDocx).mockResolvedValue(new Blob(['test']));
    vi.mocked(renderArrivalNoticePreview).mockResolvedValue(undefined);
    vi.mocked(downloadArrivalNoticeDocx).mockResolvedValue(undefined);
    vi.mocked(printArrivalNoticeAsPdf).mockResolvedValue(undefined);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.clearAllMocks(); });

  it('[화주에게 전달]을 누르면 전달하고, 전달한 뒤에는 다시 전달할 수 있다', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    await act(async () => root.render(<ForwarderArrivalNotice
      item={item} userId="test-user" issuerName="테스트 포워더" contactName="김담당"
      locked={false} saving={false} lockReason="" onChange={onChange} onSend={onSend}
    />));
    await act(async () => button('화주에게 전달').click());
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('화주에게 도착통지서를 전달했습니다');

    await act(async () => root.render(<ForwarderArrivalNotice
      item={item} userId="test-user" issuerName="테스트 포워더" contactName="김담당"
      locked={false} saving={false} lockReason="" onChange={onChange} onSend={onSend} sentAt="2026-10-09T03:00:00.000Z"
    />));
    expect(button('화주에게 다시 전달')).toBeDefined();
  });

  it('서류 검토 전(잠김)에는 화주에게 전달할 수 없다', async () => {
    const onSend = vi.fn().mockResolvedValue(true);
    await act(async () => root.render(<ForwarderArrivalNotice
      item={item} userId="test-user" issuerName="테스트 포워더" contactName="김담당"
      locked saving={false} lockReason="서류 검토 후 사용 가능" onChange={onChange} onSend={onSend}
    />));
    expect(button('화주에게 전달').disabled).toBe(true);
  });

  it('shows the generated notice inline and offers matching DOCX/PDF actions', async () => {
    await render();
    await act(async () => button('보기').click());
    expect(buildArrivalNoticeDocx).toHaveBeenCalledWith(item, '테스트 포워더', '김담당');
    expect(renderArrivalNoticePreview).toHaveBeenCalledWith(expect.any(Blob), expect.any(HTMLElement));
    expect(host.querySelector('[aria-label="도착안내서 미리보기"]')).not.toBeNull();
    await act(async () => button('닫기').click());
    expect(host.querySelector('[aria-label="도착안내서 미리보기"]')).toBeNull();
    await act(async () => button('DOCX 다운로드').click());
    expect(downloadArrivalNoticeDocx).toHaveBeenCalledWith(item, '테스트 포워더', '김담당');
    await act(async () => button('PDF 저장').click());
    expect(printArrivalNoticeAsPdf).toHaveBeenCalledWith(item, '테스트 포워더', '김담당');
  });

  it('keeps downloads locked until document review without hiding preview', async () => {
    await render(true);
    expect(button('보기').disabled).toBe(false);
    expect(button('DOCX 다운로드').disabled).toBe(true);
    expect(button('PDF 저장').disabled).toBe(true);
    await act(async () => button('DOCX 다운로드').click());
    expect(downloadArrivalNoticeDocx).not.toHaveBeenCalled();
  });
});
