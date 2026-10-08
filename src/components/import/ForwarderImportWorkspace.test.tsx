// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { deriveForwarderCase, listForwarderCases, saveForwarderCaseState } from '../../services/forwarderCaseService';
import Workspace from './ForwarderImportWorkspace';
import { getIssueComparisons } from '../../utils/forwarderIssueComparisons';
import { interpretImportReturnRequest } from '../../services/importReturnRequestInterpretationService';

vi.mock('../../services/forwarderCaseService', async (importOriginal) => ({ ...await importOriginal<object>(), listForwarderCases: vi.fn(), saveForwarderCaseState: vi.fn(), deriveForwarderCase: vi.fn() }));
vi.mock('./ForwarderDocumentThumbnail', () => ({ default: () => <span>서류 미리보기</span> }));
vi.mock('../../services/importReturnRequestInterpretationService', () => ({ interpretImportReturnRequest: vi.fn() }));
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
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); vi.mocked(saveForwarderCaseState).mockRejectedValue(new Error('test save failure')); vi.mocked(interpretImportReturnRequest).mockResolvedValue({ comparisonFields: [], documentTypes: [] }); HTMLElement.prototype.scrollIntoView = vi.fn(); });
  afterEach(() => { act(() => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('has three distinct task tabs and keeps comparison evidence with the issue', async () => {
    await open();
    expect([...container.querySelectorAll('.fwd-tabs button')].map(b => b.textContent)).toEqual(['서류 확인', '업무 진행', '업무 메시지']);
    expect(container.textContent).toContain('화주가 제출한 서류');
    // 값 재검증(확인 필요·서류 검토 사항·검토하기)은 이 단계에서 보여주지 않는다.
    expect(container.textContent).not.toContain('서류 검토 사항');
    expect(container.textContent).not.toContain('검토하기');
    expect(container.textContent).not.toContain('확인 필요');
    // 보완 요청은 포워더가 자유롭게 작성하고, 명확히 연결되는 대사값만 제안한다.
    expect(button('서류 보완 요청')).toBeTruthy();
    await click('업무 진행');
    // 잠금 안내 배너는 걷어냈다. 잠겨 있다는 사실은 아래 입력·버튼의 비활성 상태로만 드러난다.
    expect(container.textContent).not.toContain('서류 확인을 완료하면');
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


  it('서술식 요청을 실제 대사값과 연결하고 포워더 확인 후 보낸다', async () => {
    vi.mocked(saveForwarderCaseState).mockImplementation(async (_id, patch) => ({ stage: 'review', ...patch, updatedAt: 'now' }) as never);
    vi.mocked(interpretImportReturnRequest).mockResolvedValue({ comparisonFields: ['총중량'], documentTypes: ['packing_list'] });
    await open();
    await click('서류 보완 요청');
    const textarea = container.querySelector<HTMLTextAreaElement>('.rr-memo textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'P/L과 B/L 총중량이 다릅니다. 수정본을 보내 주세요.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click('연결 항목 확인');
    expect(interpretImportReturnRequest).toHaveBeenCalledWith(expect.stringContaining('총중량'), [comparison]);
    expect(container.querySelector('.rr-match-values')?.textContent).toContain('1,280 kg');
    await click('보완 요청 보내기');

    expect(saveForwarderCaseState).toHaveBeenCalledWith('case-1', expect.objectContaining({
      stage: 'review',
      returnRequest: expect.objectContaining({
        documentTypes: ['packing_list'],
        comparisonFields: ['총중량'],
        issueTitles: ['총중량', '포장명세서(P/L)'],
      }),
    }), ['화주에게 서류 보완 요청 (총중량, 포장명세서(P/L))']);
    const sent = vi.mocked(saveForwarderCaseState).mock.calls[0][1].returnRequest!;
    expect(sent.reason).toContain('P/L과 B/L 총중량이 다릅니다.');
    expect(sent.reason).toContain('테스트회사 포워더 담당자 드림');
    expect(container.textContent).toContain('보완 요청을 보냈어요');
  });

  it('요청 문장이 비어 있으면 해석하거나 보낼 수 없다', async () => {
    await open();
    await click('서류 보완 요청');
    expect(button('연결 항목 확인').disabled).toBe(true);
    await click('취소');
    expect(container.querySelector('.rr-composer')).toBeNull();
    expect(button('확인 완료 · 업무 진행')).toBeTruthy();
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

  it('완료 전 미기록 신고·D/O와 미첨부 A/N을 경고한다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await open(fixture({ stage: 'clearance', blockerCount: 0, issues: [] }));
    await click('업무 진행');
    await click('포워더 업무 완료');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('도착통지서(A/N): 미첨부'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('신고 상태: 미기록'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('D/O 상태: 미기록'));
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('저장된 관세사 전달·D/O 발급 요청 상태를 알리고 확인 후에만 완료한다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const item = fixture({ stage: 'clearance', blockerCount: 0, issues: [] });
    item.arrivalNotice = { storagePath: 'arrival-notice.docx' } as ForwarderImportCase['arrivalNotice'];
    item.trade.forwarderCase = {
      stage: 'clearance', updatedAt: '2026-09-24T00:00:00.000Z',
      importOperations: {
        brokerName: '테스트 관세법인', declarationNo: '', declarationStatus: 'handed_over',
        doStatus: 'requested', doNumber: '', doIssuer: '',
      },
    };
    await open(item);
    await click('업무 진행');
    await click('포워더 업무 완료');
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('신고 상태: 관세사 전달'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('D/O 상태: 발급 요청 (미수령)'));
    expect(confirm.mock.calls[0][0]).not.toContain('도착통지서(A/N): 미첨부');
    expect(saveForwarderCaseState).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await click('포워더 업무 완료');
    expect(saveForwarderCaseState).toHaveBeenCalledWith('case-1', { stage: 'done' }, ['포워더 업무 완료']);
    confirm.mockRestore();
  });

  it('A/N·신고 수리·D/O 수령을 모두 기록했으면 미완료 경고를 띄우지 않는다', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const item = fixture({ stage: 'clearance', blockerCount: 0, issues: [] });
    item.arrivalNotice = { storagePath: 'arrival-notice.docx' } as ForwarderImportCase['arrivalNotice'];
    item.trade.forwarderCase = {
      stage: 'clearance', updatedAt: '2026-09-24T00:00:00.000Z',
      importOperations: {
        brokerName: '테스트 관세법인', declarationNo: 'TEST-001', declarationStatus: 'cleared',
        doStatus: 'received', doNumber: 'DO-001', doIssuer: '테스트 선사',
      },
    };
    await open(item);
    await click('업무 진행');
    await click('포워더 업무 완료');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).not.toContain('완료 전 확인할 항목');
    expect(confirm.mock.calls[0][0]).toContain('실제 세관 신고·화물 반출 상태를 변경하지 않습니다.');
    confirm.mockRestore();
  });
});

it('links only matching field names, never an unrelated comparison on the same documents', () => {
  expect(getIssueComparisons(weight, [comparison])).toEqual([comparison]);
  expect(getIssueComparisons({ ...weight, title: 'IR3. 총중량 일치' }, [comparison])).toEqual([comparison]);
  expect(getIssueComparisons({ ...weight, title: '원산지 누락' }, [comparison])).toEqual([]);
});
