// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { deriveForwarderCase, listForwarderCases, saveForwarderCaseState } from '../../services/forwarderCaseService';
import Workspace from './ForwarderImportWorkspace';
import { getIssueComparisons } from '../../utils/forwarderIssueComparisons';

vi.mock('../../services/forwarderCaseService', async (importOriginal) => ({ ...await importOriginal<object>(), listForwarderCases: vi.fn(), saveForwarderCaseState: vi.fn(), deriveForwarderCase: vi.fn() }));
vi.mock('./ForwarderDocumentThumbnail', () => ({ default: () => <span>서류 미리보기</span> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const weight = { id: 'weight', title: '총중량 불일치', detail: '중량이 30kg 다릅니다.', severity: 'blocker' as const, resolved: false, documents: ['P/L', 'B/L'] };
const comparison = { field: '총중량', invoice: '1,250 kg', packingList: '1,250 kg', billOfLading: '1,280 kg', matches: false, detail: '30kg 차이' };
function fixture(overrides: Partial<ForwarderImportCase> = {}): ForwarderImportCase {
  return { tradeId: 'case-1', importer: '테스트 화주', shipperName: '테스트 공급사', vesselName: 'TEST', eta: '2026-09-20', requestedAt: '2026-09-14', stage: 'received', origin: 'shipper_request', blNo: 'BL-1', blockerCount: 1, checkCount: 0, returnRequest: null, shipperEditing: false, issues: [weight], issueNotes: {}, activity: [], nextAction: '서류 확인', snapshot: { documents: [], analysis: { comparison: [comparison], extracted: { items: [], productDescription: '테스트 품목' } } }, trade: { id: 'case-1', profile: { itemName: '테스트 품목' } }, ...overrides } as ForwarderImportCase;
}

describe('initialTradeId/initialTab — 알림 클릭으로 진입', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onInitialTradeOpened = vi.fn();
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); onInitialTradeOpened.mockClear(); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('initialTab을 지정하면 그 탭이 바로 열린다', async () => {
    vi.mocked(listForwarderCases).mockResolvedValue([fixture()]);
    await act(async () => root.render(<Workspace userId="test" issuerName="" senderContactName="" onDirectUpload={() => {}} initialTradeId="case-1" initialTab="review" onInitialTradeOpened={onInitialTradeOpened} />));
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('서류 확인');
    expect(onInitialTradeOpened).toHaveBeenCalledTimes(1);
  });

  it('initialTab 생략 시 기본값은 요청·회신 탭', async () => {
    vi.mocked(listForwarderCases).mockResolvedValue([fixture()]);
    await act(async () => root.render(<Workspace userId="test" issuerName="" senderContactName="" onDirectUpload={() => {}} initialTradeId="case-1" onInitialTradeOpened={onInitialTradeOpened} />));
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('업무 메시지');
  });

  it('아직 목록에 없는(수락 전) 건을 가리키면 열지 않고 대상만 비운다', async () => {
    vi.mocked(listForwarderCases).mockResolvedValue([fixture()]);
    await act(async () => root.render(<Workspace userId="test" issuerName="" senderContactName="" onDirectUpload={() => {}} initialTradeId="not-in-queue" onInitialTradeOpened={onInitialTradeOpened} />));
    // 목록은 정상 표시되지만(다른 건 case-1은 열려 있음), 없는 건을 자동으로 열지는 않는다.
    expect(container.querySelector('.fwd-detail-top')).toBeNull();
    expect(onInitialTradeOpened).toHaveBeenCalledTimes(1);
  });
});

describe('forwarder task tabs', () => {
  let container: HTMLDivElement;
  let root: Root;
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === text)!;
  const click = async (text: string) => act(async () => button(text).click());
  const open = async (item = fixture()) => {
    vi.mocked(listForwarderCases).mockResolvedValue([item]);
    await act(async () => root.render(<Workspace userId="test" issuerName="테스트회사" senderContactName="담당자" onDirectUpload={() => {}} />));
    await click('선택한 의뢰 열기');
  };
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); vi.mocked(saveForwarderCaseState).mockRejectedValue(new Error('test save failure')); HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('has three distinct task tabs and keeps comparison evidence with the issue', async () => {
    await open();
    expect([...container.querySelectorAll('.fwd-tabs button')].map(b => b.textContent)).toEqual(['서류 확인', '업무 진행', '업무 메시지']);
    expect(container.textContent).toContain('화주가 제출한 서류');
    await click('검토하기');
    expect(container.querySelector('.fwd-review-detail:not([hidden])')?.textContent).toContain('1,280 kg');
    await click('업무 진행');
    expect(container.textContent).toContain('서류 확인을 완료하면 신고자료 다운로드와 업무 기록이 가능합니다.');
    expect(container.querySelectorAll('.fwd-document-lock')).toHaveLength(1);
    expect(container.textContent).toContain('도착 안내 · A/N');
    expect(container.textContent).toContain('화물인도지시서 · D/O');
    expect(button('A/N 생성·다운로드').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('.arrival-notice-picker input')?.disabled).toBe(true);
    expect(container.querySelector<HTMLFieldSetElement>('.fwd-operation-fields')?.disabled).toBe(true);
    expect(button('자료 다운로드').disabled).toBe(true);
    await click('A/N 생성·다운로드');
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    expect(container.querySelector('.fwd-review-panel')).toBeNull();
    expect(container.textContent).not.toContain('포워더 업무 완료');
    expect(container.querySelector('.fwd-cargo-disclosure')?.hasAttribute('open')).toBe(false);
    await click('업무 메시지');
    expect(container.textContent).toContain('아직 보낸 요청이 없습니다.');
    expect(container.querySelector('.fwd-doc-gallery')).toBeNull();
  });


  it('selects across categories without leaving review and sends one request, retaining failures', async () => {
    const check = { ...weight, id: 'check', title: '품목 설명', severity: 'check' as const };
    await open(fixture({ issues: [weight, check] }));
    await act(async () => container.querySelector<HTMLInputElement>('.fwd-review-pick')!.click());
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('서류 확인');
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    await click('권장 사항1');
    await act(async () => container.querySelector<HTMLInputElement>('.fwd-review-pick')!.click());
    expect(button('확인 완료 · 신고자료 준비').disabled).toBe(true);
    await click('선택한 2건 보완 요청');
    expect(container.querySelector('.fwd-batch-composer')?.textContent).toContain('테스트회사 포워더 담당자 드림');
    expect(container.querySelector('.fwd-pick-list')).toBeNull();
    const input = container.querySelector<HTMLTextAreaElement>('.fwd-return-textarea')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '수정본 부탁드립니다'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('보완 요청 보내기 (2건)');
    expect(saveForwarderCaseState).toHaveBeenCalledWith('case-1', expect.objectContaining({ stage: 'review', returnRequest: expect.objectContaining({ issueTitles: ['총중량 불일치', '품목 설명'], reason: expect.stringContaining('수정본 부탁드립니다') }) }), expect.any(Array));
    expect(container.querySelector('.fwd-batch-composer')).not.toBeNull();
    expect(container.querySelector<HTMLTextAreaElement>('.fwd-return-textarea')?.value).toBe('수정본 부탁드립니다');
    vi.mocked(saveForwarderCaseState).mockResolvedValue({} as never);
    vi.mocked(deriveForwarderCase).mockReturnValue(fixture({ stage: 'review', returnRequest: { requestedAt: '2026-09-14', reason: '보낸 요청', issueTitles: [weight.title] } }));
    await click('보완 요청 보내기 (2건)');
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('업무 메시지');
    expect(container.querySelector('.fwd-return-banner')?.textContent).toContain('보낸 요청');
    expect(container.querySelector('.sent-confirmation')?.textContent).toContain('보완 요청을 보냈어요');
    await click('닫기');
    expect(container.querySelector('.sent-confirmation')).toBeNull();
  });

  it('requires a reason for unresolved blockers, then saves completion atomically', async () => {
    await open();
    expect(button('서류 검토 시작')).toBeUndefined();
    await click('확인 완료 · 신고자료 준비');
    expect(container.querySelector('.fwd-batch-toolbar')).toBeNull();
    expect(container.querySelector('.fwd-batch-outstanding')?.textContent).toContain('총중량 불일치');
    expect(container.querySelector('.fwd-batch-confirm')?.textContent).toContain(weight.detail);
    expect(container.querySelector('.fwd-batch-confirm')?.textContent).toContain('원본과 확인한 내용을 기록해 주세요.');
    expect(button('확인 완료 · 업무 진행으로').disabled).toBe(true);
    await click('확인 완료 · 업무 진행으로');
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="전체 검토 근거"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '원문 및 선사 확인 결과 기재 기준 차이'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('확인 완료 · 업무 진행으로');
    expect(saveForwarderCaseState).toHaveBeenCalledWith('case-1', expect.objectContaining({ stage: 'clearance', issueResolutions: { weight: true }, issueNotes: { weight: '원문 및 선사 확인 결과 기재 기준 차이' } }), expect.any(Array));
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('서류 확인');
    expect(input.value).toBe('원문 및 선사 확인 결과 기재 기준 차이');
    vi.mocked(saveForwarderCaseState).mockResolvedValue({} as never);
    vi.mocked(deriveForwarderCase).mockReturnValue(fixture({ stage: 'clearance', blockerCount: 0, issues: [{ ...weight, resolved: true }] }));
    await click('확인 완료 · 업무 진행으로');
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('업무 진행');
  });

  it('allows clean review to finish without a reason and blocks bulk actions while awaiting replies', async () => {
    await open(fixture({ issues: [], blockerCount: 0 }));
    await click('확인 완료 · 신고자료 준비');
    expect(button('확인 완료 · 업무 진행으로').disabled).toBe(false);
    await click('계속 검토');
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    await click('업무 목록');
    await open(fixture({ returnRequest: { requestedAt: '2026-09-14', reason: '대기', issueTitles: [] } }));
    // Reload the list so the newly returned fixture replaces the prior case.
    await click('업무 목록');
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="의뢰 새로고침"]')!.click());
    await click('선택한 의뢰 열기');
    expect(container.querySelector('.fwd-batch-review')).toBeNull();
    expect(container.querySelector('.fwd-review-pick')).toBeNull();
  });

  it('puts sent requests and replies only in the message tab', async () => {
    await open(fixture({ returnRequest: { reason: '보완 요청 본문', issueTitles: [], requestedAt: '2026-09-14', resolvedAt: '2026-09-15', shipperReply: '수정본을 제출했습니다.' } }));
    expect(container.querySelector('.fwd-return-banner')).toBeNull();
    await click('업무 메시지회신 도착');
    expect(container.querySelector('.fwd-return-banner')?.textContent).toContain('수정본을 제출했습니다.');
    expect(container.textContent).toContain('재제출 시점의 서류');
    const history = container.querySelector<HTMLDetailsElement>('.fwd-sent-history')!;
    expect(history.open).toBe(false);
    expect(history.textContent).toContain('보완 요청 본문');
    expect(container.querySelector('.fwd-received-body')?.textContent).toBe('수정본을 제출했습니다.');
    expect(container.querySelector('.fwd-return-head')?.textContent).toContain('받은 회신');
    expect(button('수정 서류 검토하기')).toBeTruthy();
    vi.mocked(saveForwarderCaseState).mockResolvedValue({} as never);
    vi.mocked(deriveForwarderCase).mockReturnValue(fixture({ stage: 'review' }));
    await click('수정 서류 검토하기');
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('서류 확인');
    expect(saveForwarderCaseState).toHaveBeenCalledWith('case-1', expect.objectContaining({ stage: 'review', returnRequest: null }), expect.any(Array));
  });

  it('explains document-only resubmission without inventing a reply or file changes', async () => {
    await open(fixture({ returnRequest: { reason: '기존 원문', issueTitles: ['품목 1 원산지 누락'], requestedAt: '2026-09-14', resolvedAt: '2026-09-15', shipperReply: '   ' } }));
    await click('업무 메시지회신 도착');
    expect(container.textContent).toContain('화주가 서류를 다시 제출했습니다.');
    expect(container.querySelector('.fwd-received-body')?.textContent).toContain('별도로 남긴 답변은 없습니다.');
    expect(container.querySelector('.fwd-reply-documents')?.textContent).toContain('보관된 원본 파일이 없습니다.');
    expect(container.querySelector('.fwd-sent-history')?.hasAttribute('open')).toBe(false);
  });

  it('includes issue titles when different items have the same request description', async () => {
    const detail = '첨부문서에서 품목 원산지가 확인되지 않았습니다.';
    await open(fixture({ issues: [{ ...weight, title: '품목 1 원산지 누락', detail }, { ...weight, id: 'origin-2', title: '품목 2 원산지 누락', detail }] }));
    await act(async () => { container.querySelectorAll<HTMLInputElement>('.fwd-review-pick').forEach(input => input.click()); });
    await click('선택한 2건 보완 요청');
    expect(container.querySelector('.fwd-batch-composer')?.textContent).toContain(`품목 1 원산지 누락 — ${detail}`);
    expect(container.querySelector('.fwd-batch-composer')?.textContent).toContain(`품목 2 원산지 누락 — ${detail}`);
  });

  it('orders cargo lookup, arrival notice and delivery preparation, with document-only completion', async () => {
    await open(fixture({ stage: 'clearance', blockerCount: 0, issues: [] }));
    await click('업무 진행');
    const text = container.textContent!;
    expect(text.indexOf('입항 확인')).toBeLessThan(text.indexOf('도착 안내 · A/N'));
    expect(text.indexOf('도착 안내 · A/N')).toBeLessThan(text.indexOf('화물인도지시서 · D/O'));
    expect(text).toContain('수입신고 자료');
    expect(text).not.toContain('납부 확인');
    expect(button('진행 조회')).toBeTruthy();
    expect(button('A/N 생성·다운로드').disabled).toBe(false);
    expect(container.querySelector<HTMLInputElement>('.arrival-notice-picker input')?.disabled).toBe(false);
    expect(container.querySelector<HTMLFieldSetElement>('.fwd-operation-fields')?.disabled).toBe(false);
    expect(button('포워더 업무 완료')).toBeTruthy();
    expect(text).toContain('실제 세관·반출 상태는 변경되지 않습니다.');
    expect(container.textContent).not.toContain('배차 의뢰');
  });
});

it('links only matching field names, never an unrelated comparison on the same documents', () => {
  expect(getIssueComparisons(weight, [comparison])).toEqual([comparison]);
  expect(getIssueComparisons({ ...weight, title: 'IR3. 총중량 일치' }, [comparison])).toEqual([comparison]);
  expect(getIssueComparisons({ ...weight, title: '원산지 누락' }, [comparison])).toEqual([]);
});
