// @vitest-environment happy-dom
import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentConsoleOverlay from './AgentConsoleOverlay';
import DocumentPreviewModal from './DocumentPreviewModal';
import NoticeModal from './NoticeModal';
import OverrideReasonModal from './OverrideReasonModal';
import type { ValidationIssue } from '../types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('App에서 분리한 모달', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => { container = document.createElement('div'); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); });

  const button = (label: string) =>
    [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === label)!;

  it('안내 모달은 [확인]이나 바깥을 누르면 닫히고, 안쪽을 눌러서는 닫히지 않는다', () => {
    const onClose = vi.fn();
    act(() => root.render(<NoticeModal title="초안이 생성되었습니다." onClose={onClose}><p>본문</p></NoticeModal>));
    expect(container.querySelector('h3')?.textContent).toBe('초안이 생성되었습니다.');

    act(() => container.querySelector('h3')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onClose).not.toHaveBeenCalled();

    act(() => button('확인').click());
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => (container.firstElementChild as HTMLElement).click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('콘솔 창은 처리 중에는 닫을 수 없고 로그를 순서대로 보여준다', () => {
    const onClose = vi.fn();
    const logs = [
      { timestamp: '10:00:00', agentName: 'HSCodeAgent', message: '후보 조회', type: 'info' as const, level: 'info' as const },
      { timestamp: '10:00:01', agentName: 'DocumentAgent', message: '서류 생성', type: 'success' as const, level: 'success' as const },
    ];
    act(() => root.render(<AgentConsoleOverlay logs={logs} isProcessing endRef={createRef<HTMLDivElement>()} onClose={onClose} />));
    expect(container.querySelectorAll('.log-row')).toHaveLength(3); // 로그 2줄 + 처리 중 안내
    expect(button('콘솔 닫기').disabled).toBe(true);

    act(() => root.render(<AgentConsoleOverlay logs={logs} isProcessing={false} endRef={createRef<HTMLDivElement>()} onClose={onClose} />));
    expect(container.querySelectorAll('.log-row')).toHaveLength(2);
    act(() => button('콘솔 닫기').click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('사유 모달은 입력을 올려보내고 취소·확정을 구분한다', () => {
    const onReasonChange = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const issue = { id: 'r9-port-same-country', docType: 'invoice', field: 'loadPort', message: '선적항과 도착항이 같은 국가입니다.', severity: 'error' } as ValidationIssue;
    act(() => root.render(<OverrideReasonModal issue={issue} reason="관세사와 협의됨" onReasonChange={onReasonChange} onCancel={onCancel} onConfirm={onConfirm} />));

    expect(container.textContent).toContain('[r9-port-same-country]');
    expect(container.textContent).toContain('선적항과 도착항이 같은 국가입니다.');
    expect(container.querySelector('textarea')?.value).toBe('관세사와 협의됨');

    act(() => button('사유 기록하고 생성').click());
    expect(onConfirm).toHaveBeenCalledOnce();
    act(() => button('취소').click());
    expect(onCancel).toHaveBeenCalledOnce();
  });

  describe('서류 미리보기', () => {
    const refs = () => ({
      docxPreviewRef: createRef<HTMLDivElement>(),
      packingDocxPreviewRef: createRef<HTMLDivElement>(),
      trDocxPreviewRef: createRef<HTMLDivElement>(),
      blDocxPreviewRef: createRef<HTMLDivElement>(),
      customsDocxPreviewRef: createRef<HTMLDivElement>(),
    });

    it('상업송장은 docx 렌더 영역을 붙이고 다른 서류처럼 DOCX 다운로드로 안내한다', () => {
      const onDownload = vi.fn();
      const onClose = vi.fn();
      const r = refs();
      act(() => root.render(
        <DocumentPreviewModal previewDocId="invoice" htmlTemplates={{}} customsDeclarationData={null} {...r} onClose={onClose} onDownload={onDownload} />,
      ));
      expect(container.querySelector('h3')?.textContent).toBe('상업송장(Commercial Invoice) 미리보기');
      expect(r.docxPreviewRef.current).not.toBeNull();
      expect(r.packingDocxPreviewRef.current).toBeNull();

      act(() => button('DOCX 다운로드').click());
      expect(onDownload).toHaveBeenCalledWith('invoice');
      act(() => button('닫기').click());
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('docx 서류는 DOCX 다운로드, 그 밖의 서류는 HTML 양식과 PDF 저장을 쓴다', () => {
      const r = refs();
      act(() => root.render(
        <DocumentPreviewModal previewDocId="bl" htmlTemplates={{}} customsDeclarationData={null} {...r} onClose={vi.fn()} onDownload={vi.fn()} />,
      ));
      expect(r.blDocxPreviewRef.current).not.toBeNull();
      expect(button('DOCX 다운로드')).toBeDefined();

      act(() => root.render(
        <DocumentPreviewModal previewDocId="co" htmlTemplates={{ co: '<p id="co-body">C/O</p>' }} customsDeclarationData={null} {...r} onClose={vi.fn()} onDownload={vi.fn()} />,
      ));
      expect(container.querySelector('#co-body')?.textContent).toBe('C/O');
      expect(button('PDF 저장 (텍스트)')).toBeDefined();

      act(() => root.render(
        <DocumentPreviewModal previewDocId="unknown_doc" htmlTemplates={{}} customsDeclarationData={null} {...r} onClose={vi.fn()} onDownload={vi.fn()} />,
      ));
      expect(container.querySelector('h3')?.textContent).toBe('문서 미리보기');
      expect(container.textContent).toContain('문서 양식이 생성되지 않았습니다.');
    });
  });
});
