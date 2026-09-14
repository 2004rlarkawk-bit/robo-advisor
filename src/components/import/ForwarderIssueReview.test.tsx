// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ForwarderIssueReview, { issueReviewGroup } from './ForwarderIssueReview';
import type { ForwarderCaseIssue } from '../../types/forwarderCase';
import { getInboxImporterName } from '../../utils/forwarderInbox';
import { getIssueDocuments } from '../../utils/forwarderIssueDocuments';
import type { ImportDocumentMeta } from '../../types/importTrade';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const issues: ForwarderCaseIssue[] = [
  { id: 'weight', title: '총중량 불일치', detail: 'P/L 1,250kg · B/L 1,280kg', severity: 'blocker', resolved: false, documents: ['P/L', 'B/L'] },
  { id: 'origin', title: '원산지 누락', detail: '원산지를 확인하세요.', severity: 'blocker', resolved: false, documents: [] },
  { id: 'check', title: '품목 설명', detail: '용도를 확인하세요.', severity: 'check', resolved: false, documents: [] },
  { id: 'info', title: '참고 자료', detail: '추가 안내', severity: 'info', resolved: false, documents: [] },
  { id: 'done', title: '확인된 항목', detail: '원문 대사 완료', severity: 'blocker', resolved: true, documents: [] },
];
const documents: ImportDocumentMeta[] = [
  {id:'ci',name:'invoice.pdf',type:'commercial_invoice',size:12,mimeType:'application/pdf',status:'analyzed',storageBucket:'docs',storagePath:'ci.pdf'},
  {id:'pl',name:'packing.pdf',type:'packing_list',size:12,mimeType:'application/pdf',status:'analyzed',storageBucket:'docs',storagePath:'pl.pdf'},
  {id:'bl',name:'bill.pdf',type:'bill_of_lading',size:12,mimeType:'application/pdf',status:'analyzed',storageBucket:'docs',storagePath:'bl.pdf'},
];

describe('ForwarderIssueReview', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onResolve = vi.fn(async () => true);
  const onReopen = vi.fn(async () => true);
  const render = async (overrides: Partial<React.ComponentProps<typeof ForwarderIssueReview>> = {}) => {
    await act(async () => root.render(<ForwarderIssueReview issues={issues} notes={{ done: '검량 확인' }} saving={false} onResolve={onResolve} onReopen={onReopen} {...overrides}/>));
  };
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((element) => element.textContent?.includes(text) || element.getAttribute('aria-label')?.includes(text))!;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); onResolve.mockResolvedValue(true); });

  it('uses mutually exclusive counts including informational items without altering source issues', async () => {
    await render();
    expect(issues.map(issueReviewGroup)).toEqual(['required', 'required', 'recommended', 'recommended', 'done']);
    expect(container.querySelector('.fwd-review-count')?.textContent).toBe('미확인 4건');
    expect([...container.querySelectorAll('.fwd-review-filter')].map(x => x.textContent)).toEqual(['필수 확인2', '권장 사항2', '확인 완료1']);
    expect(container.querySelectorAll('.fwd-review-item')).toHaveLength(2);
    expect([...container.querySelectorAll<HTMLElement>('.fwd-review-detail')].every(x => x.hidden)).toBe(true);
    expect(container.querySelector('.fwd-review-description')?.textContent).toBe(issues[0].detail);
    expect(container.querySelector('.fwd-review-description')?.closest('[hidden]')).toBeNull();
    expect(container.querySelector('.fwd-review-toggle')?.textContent).toContain('검토하기');
    await act(async () => button('권장 사항').click());
    expect(container.querySelectorAll('.fwd-review-item')).toHaveLength(2);
    expect(container.querySelector('.fwd-review-items')?.textContent).toContain('참고 자료');
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('opens one detail, preserves drafts when switching filters and submits the exact issue ID', async () => {
    await render();
    await act(async () => button('총중량 불일치').click());
    const input = container.querySelector<HTMLTextAreaElement>('#fwd-review-note-weight')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '선사 검량 확인');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('권장 사항').click());
    await act(async () => button('필수 확인').click());
    await act(async () => button('총중량 불일치').click());
    expect(container.querySelector<HTMLTextAreaElement>('#fwd-review-note-weight')?.value).toBe('선사 검량 확인');
    await act(async () => button('검토 완료').click());
    expect(onResolve).toHaveBeenCalledWith(issues[0], '선사 검량 확인');
    expect(container.querySelector('[role=status]')?.textContent).toContain('저장했습니다');
  });

  it('keeps failed saves open, respects saving and supports undo with existing notes', async () => {
    onResolve.mockResolvedValue(false);
    await render();
    await act(async () => button('총중량 불일치').click());
    await act(async () => button('검토 완료').click());
    expect(container.querySelector<HTMLElement>('#fwd-review-weight')?.hidden).toBe(false);
    expect(container.querySelector('[role=status]')).toBeNull();
    await render({ saving: true });
    expect(button('검토 완료').disabled).toBe(true);
    await render();
    await act(async () => button('확인 완료').click());
    await act(async () => button('확인된 항목').click());
    expect(container.querySelector('.fwd-review-items')?.textContent).toContain('검량 확인');
    await act(async () => button('완료 취소').click());
    expect(onReopen).toHaveBeenCalledWith(issues[4]);
  });

  it('keeps all source issue IDs even for duplicate titles, and handles empty or completed-only cases', async () => {
    await render({ issues: [issues[0], { ...issues[0], id: 'weight-copy' }] });
    expect(container.querySelectorAll('.fwd-review-item')).toHaveLength(2);
    await render({ issues: [] });
    expect(container.querySelector('.fwd-review-empty')).not.toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    await render({ issues: [issues[4]] });
    expect(button('확인 완료').getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('.fwd-review-count')?.textContent).toBe('미확인 0건');
  });

  it('shows evidence and actions inside review without repeating the problem description', async () => {
    const onOpenDocument = vi.fn();
    const onRequestCorrection = vi.fn();
    await render({ documents, onOpenDocument, onRequestCorrection });
    await act(async () => button('총중량 불일치').click());
    const detail = container.querySelector('#fwd-review-weight')!;
    expect(detail.textContent).not.toContain(issues[0].detail);
    expect(detail.querySelector('h3')?.textContent).toBe('근거 서류');
    expect(detail.querySelectorAll('.fwd-review-source')).toHaveLength(2);
    expect(detail.textContent).not.toContain('invoice.pdf');
    await act(async () => detail.querySelector<HTMLButtonElement>('.fwd-review-source')!.click());
    expect(onOpenDocument).toHaveBeenCalledWith(documents[1]);
    await act(async () => button('보완 요청 작성').click());
    expect(onRequestCorrection).toHaveBeenCalledWith(issues[0], '');
    expect(onResolve).not.toHaveBeenCalled();
    await render({ documents, onOpenDocument, onRequestCorrection, documentBusyId: 'pl' });
    expect([...detail.querySelectorAll<HTMLButtonElement>('.fwd-review-source')].every(x=>x.disabled)).toBe(true);
  });

  it('does not invent evidence or expose request actions on ineligible items', async () => {
    await render({ documents, onOpenDocument: vi.fn(), onRequestCorrection: vi.fn() });
    await act(async () => button('권장 사항').click());
    await act(async () => button('참고 자료').click());
    const detail = container.querySelector('#fwd-review-info')!;
    expect(detail.querySelector('h3')?.textContent).toBe('제출 서류');
    expect(detail.textContent).toContain('연결된 근거 서류가 지정되지 않았습니다');
    expect(detail.textContent).not.toContain('보완 요청 작성');
    await render({ documents: [], onOpenDocument: vi.fn() });
    expect(detail.textContent).toContain('등록된 원본 서류가 없습니다');
  });
});

it('matches document IDs, types, filenames, English labels and abbreviations exactly', () => {
  for (const reference of ['pl','packing_list','Packing List','P/L','포장명세서','packing.pdf']) {
    expect(getIssueDocuments({...issues[0],documents:[reference]},documents)).toEqual([documents[1]]);
  }
  expect(getIssueDocuments({...issues[0],documents:['API','회원프로필']},documents)).toEqual([]);
  expect(getIssueDocuments({...issues[0],documents:['P/L','Packing List']},documents)).toHaveLength(1);
});

it('labels missing importer names without guessing the shipper or another company', () => {
  for (const importer of ['', '  ', '-', '—']) expect(getInboxImporterName({ importer })).toBe('화주명 미입력');
  expect(getInboxImporterName({ importer: ' ACME CO. ' })).toBe('ACME CO.');
});
