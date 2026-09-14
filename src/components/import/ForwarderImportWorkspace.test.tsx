// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { listForwarderCases, saveForwarderCaseState } from '../../services/forwarderCaseService';
import Workspace from './ForwarderImportWorkspace';
import { getIssueComparisons } from '../../utils/forwarderIssueComparisons';

vi.mock('../../services/forwarderCaseService', async (importOriginal) => ({ ...await importOriginal<object>(), listForwarderCases: vi.fn(), saveForwarderCaseState: vi.fn() }));
vi.mock('./ForwarderDocumentThumbnail', () => ({ default: () => <span>서류 미리보기</span> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const weight = { id: 'weight', title: '총중량 불일치', detail: '중량이 30kg 다릅니다.', severity: 'blocker' as const, resolved: false, documents: ['P/L', 'B/L'] };
const comparison = { field: '총중량', invoice: '1,250 kg', packingList: '1,250 kg', billOfLading: '1,280 kg', matches: false, detail: '30kg 차이' };
function fixture(overrides: Partial<ForwarderImportCase> = {}): ForwarderImportCase {
  return { tradeId: 'case-1', importer: '테스트 화주', shipperName: '테스트 공급사', vesselName: 'TEST', eta: '2026-09-20', requestedAt: '2026-09-14', stage: 'received', origin: 'shipper_request', blNo: 'BL-1', blockerCount: 1, checkCount: 0, returnRequest: null, shipperEditing: false, issues: [weight], issueNotes: {}, activity: [], nextAction: '서류 검토', snapshot: { documents: [], analysis: { comparison: [comparison], extracted: { items: [], productDescription: '테스트 품목' } } }, trade: { id: 'case-1', profile: { itemName: '테스트 품목' } }, ...overrides } as ForwarderImportCase;
}

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
    expect([...container.querySelectorAll('.fwd-tabs button')].map(b => b.textContent)).toEqual(['서류 검토', '요청·회신', '통관·도착']);
    expect(container.textContent).toContain('화주가 제출한 서류');
    await click('검토하기');
    expect(container.querySelector('.fwd-review-detail:not([hidden])')?.textContent).toContain('1,280 kg');
    await click('통관·도착');
    expect(container.textContent).toContain('서류 검토를 완료하면 도착통지서와 배차 의뢰서를 작성할 수 있습니다.');
    expect(container.querySelectorAll('.fwd-document-lock')).toHaveLength(1);
    expect(container.textContent).toContain('도착통지서 (A/N)');
    expect(container.textContent).toContain('국내 운송 준비');
    expect(button('A/N 생성·다운로드').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('.arrival-notice-picker input')?.disabled).toBe(true);
    expect(container.querySelector<HTMLFieldSetElement>('.fwd-dispatch-fields')?.disabled).toBe(true);
    expect(button('배차 의뢰서 생성·다운로드').disabled).toBe(true);
    await click('A/N 생성·다운로드');
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    expect(container.querySelector('.fwd-review-panel')).toBeNull();
    expect(container.textContent).not.toContain('서류 업무 완료');
    expect(container.querySelector('.fwd-cargo-card')?.closest('[hidden]')).toBeNull();
    await click('요청·회신');
    expect(container.textContent).toContain('아직 보낸 요청이 없습니다.');
    expect(container.querySelector('.fwd-doc-gallery')).toBeNull();
  });

  it('carries a selected issue and memo into the message tab, and retains the form after failed sending', async () => {
    await open(); await click('검토하기');
    const input = container.querySelector<HTMLTextAreaElement>('#fwd-review-note-weight')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '중량 확인 요청'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click('보완 요청 작성');
    expect(container.querySelector('.fwd-tabs .is-active')?.textContent).toBe('요청·회신');
    expect(container.querySelector<HTMLTextAreaElement>('.fwd-return-textarea')?.value).toBe('중량 확인 요청');
    expect(container.querySelector<HTMLInputElement>('.fwd-pick-list input')?.checked).toBe(true);
    const send = [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('보완 요청 보내기'))!;
    await act(async () => send.click());
    expect(saveForwarderCaseState).toHaveBeenCalledWith('case-1', expect.objectContaining({ returnRequest: expect.objectContaining({ reason: expect.stringContaining('테스트회사 포워더 담당자 드림') }) }), expect.any(Array));
    expect(container.querySelector('.fwd-return-textarea')).not.toBeNull();
  });

  it('puts sent requests and replies only in the message tab', async () => {
    await open(fixture({ returnRequest: { reason: '보완 요청 본문', issueTitles: [], requestedAt: '2026-09-14', resolvedAt: '2026-09-15', shipperReply: '수정본을 제출했습니다.' } }));
    expect(container.querySelector('.fwd-return-banner')).toBeNull();
    await click('요청·회신회신 도착');
    expect(container.querySelector('.fwd-return-banner')?.textContent).toContain('수정본을 제출했습니다.');
    expect(container.textContent).toContain('현재 제출 서류');
    expect(button('수정본 검토 시작')).toBeTruthy();
  });

  it('orders cargo lookup, arrival notice and delivery preparation, with document-only completion', async () => {
    await open(fixture({ stage: 'clearance', blockerCount: 0, issues: [] }));
    await click('통관·도착');
    const text = container.textContent!;
    expect(text.indexOf('통관·화물 진행 현황')).toBeLessThan(text.indexOf('도착통지서 (A/N)'));
    expect(text.indexOf('도착통지서 (A/N)')).toBeLessThan(text.indexOf('국내 운송 준비'));
    expect(button('진행 조회')).toBeTruthy();
    expect(button('A/N 생성·다운로드').disabled).toBe(false);
    expect(container.querySelector<HTMLInputElement>('.arrival-notice-picker input')?.disabled).toBe(false);
    expect(container.querySelector<HTMLFieldSetElement>('.fwd-dispatch-fields')?.disabled).toBe(false);
    expect(button('서류 업무 완료')).toBeTruthy();
    expect(text).toContain('서류 업무 완료는 실제 통관 완료와 별개입니다.');
    expect(container.querySelector('.fwd-dispatch-reply')?.hasAttribute('open')).toBe(false);
  });
});

it('links only matching field names, never an unrelated comparison on the same documents', () => {
  expect(getIssueComparisons(weight, [comparison])).toEqual([comparison]);
  expect(getIssueComparisons({ ...weight, title: 'IR3. 총중량 일치' }, [comparison])).toEqual([comparison]);
  expect(getIssueComparisons({ ...weight, title: '원산지 누락' }, [comparison])).toEqual([]);
});
