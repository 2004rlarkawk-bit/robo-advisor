// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeImportAnalysisResult } from '../../services/importDocumentAnalysisService';
import type { SavedTrade } from '../../types';
import ImportTradeFlow from './ImportTradeFlow';

const { completeDraftMock, isSubmittedTradeDraftMock, deleteTradeDraftMock } = vi.hoisted(() => ({
  completeDraftMock: vi.fn(),
  isSubmittedTradeDraftMock: vi.fn().mockResolvedValue(false),
  deleteTradeDraftMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../services/draftCacheService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/draftCacheService')>()),
  isSubmittedTradeDraft: isSubmittedTradeDraftMock,
  deleteTradeDraft: deleteTradeDraftMock,
}));

vi.mock('../../hooks/useFormDataDraft', () => ({
  useFormDataDraft: () => ({
    isHydrated: true,
    saveStatus: 'saved',
    lastSavedAt: '2026-07-30T00:00:00.000Z',
    flushDraft: vi.fn(),
    completeDraft: completeDraftMock,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const cacheKey = 'portai_import_draft:user-1:forwarder';
const otherDraftKey = 'portai_import_draft:user-1:shipper';
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function cachedForwarderState() {
  return {
    step: 3,
    documents: [{
      id: 'document-1',
      name: 'invoice.pdf',
      size: 100,
      mimeType: 'application/pdf',
      type: 'commercial_invoice',
      status: 'analyzed',
      uploadStatus: 'uploaded',
      analysisStatus: 'success',
      storageBucket: 'trade-documents',
      storagePath: 'user-1/trade-1/commercial_invoice/invoice.pdf',
      uploadedAt: '2026-07-30T00:00:00.000Z',
    }],
    analysis: normalizeImportAnalysisResult({
      extracted: {
        blNo: 'BL-1',
        items: [{ description: 'Cotton shirts' }],
      },
    }),
    suggestions: [],
    selectedCode: '',
    duty: null,
    dutyError: '',
    risks: [],
    cargo: null,
    arrivalNotice: null,
    generatedAt: '2026-07-30T00:00:00.000Z',
    tradeId: 'trade-1',
    existingStatus: 'generated',
  };
}

function savedTrade(status: 'in_progress' | 'submitted' = 'in_progress'): SavedTrade {
  return {
    id: 'trade-1',
    profile: {
      tradeType: 'import',
      itemName: 'Cotton shirts',
      hsCode: '',
      loadPort: '',
      dischargePort: '',
      incoterms: '',
      quantity: '',
      weight: '',
      departureDate: '',
      arrivalDate: '',
      companyName: '',
      contact: '',
    },
    tradeDirection: 'import',
    tradeRole: 'forwarder',
    documents: [],
    issues: [],
    status,
    generatedAt: '2026-07-30T00:00:00.000Z',
    submittedAt: status === 'submitted' ? '2026-07-30T01:00:00.000Z' : null,
    flowCompletedAt: '2026-07-30T01:00:00.000Z',
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T01:00:00.000Z',
  };
}

function renderFlow(
  onComplete = vi.fn().mockResolvedValue(savedTrade()),
  viewOptions: { role?: 'shipper' | 'forwarder'; readOnly?: boolean; onClose?: () => void } = {},
) {
  const onSaved = vi.fn();
  const onWorkspaceStateChange = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ImportTradeFlow
        role="forwarder"
        userId="user-1"
        onGenerate={vi.fn()}
        onComplete={onComplete}
        onSaved={onSaved}
        onWorkspaceStateChange={onWorkspaceStateChange}
        {...viewOptions}
      />,
    );
  });
  return { onComplete, onSaved, onWorkspaceStateChange };
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container!.querySelectorAll<HTMLButtonElement>('button'))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`${label} 버튼을 찾을 수 없습니다.`);
  return found;
}

function confirmInProgressButton(): HTMLButtonElement {
  const found = container?.querySelector<HTMLButtonElement>(
    '[role="dialog"] .btn-primary',
  );
  if (!found) throw new Error('진행 중 저장 확인 버튼을 찾을 수 없습니다.');
  return found;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(cacheKey, JSON.stringify(cachedForwarderState()));
  localStorage.setItem(otherDraftKey, '{"protected":true}');
  completeDraftMock.mockResolvedValue(undefined);
  isSubmittedTradeDraftMock.mockResolvedValue(false);
  deleteTradeDraftMock.mockResolvedValue(undefined);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  localStorage.clear();
  vi.clearAllMocks();
});

describe('수입 포워더 진행 중 저장 UX', () => {
  it('최종 제출 문구 대신 진행 중 저장 전용 dialog를 표시한다', () => {
    const confirm = vi.spyOn(window, 'confirm');
    renderFlow();

    act(() => button('진행 중으로 저장').click());

    expect(container?.textContent).toContain('진행 중 상태로 저장할까요?');
    expect(container?.textContent).toContain('거래관리에서 이어서 작성');
    expect(container?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(confirm).not.toHaveBeenCalledWith(expect.stringContaining('최종'));
  });

  it('저장 성공 후 해당 draft와 workspace 연결을 비우고 같은 trade ID를 전달한다', async () => {
    const handlers = renderFlow();
    act(() => button('진행 중으로 저장').click());

    await act(async () => {
      confirmInProgressButton().click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handlers.onComplete).toHaveBeenCalledWith(expect.objectContaining({
      tradeId: 'trade-1',
      role: 'forwarder',
      arrivalNotice: undefined,
    }));
    expect(completeDraftMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem(cacheKey)).toBeNull();
    expect(localStorage.getItem(otherDraftKey)).toBe('{"protected":true}');
    expect(handlers.onWorkspaceStateChange)
      .toHaveBeenLastCalledWith({ currentStep: 1, tradeId: null });
    expect(handlers.onSaved).toHaveBeenCalledWith(expect.objectContaining({
      id: 'trade-1',
      status: 'in_progress',
    }));
  });

  it('거래 저장 실패 시 form, attachment, draft와 workspace 상태를 유지한다', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onComplete = vi.fn().mockRejectedValue(new Error('network'));
    const handlers = renderFlow(onComplete);
    act(() => button('진행 중으로 저장').click());

    await act(async () => {
      confirmInProgressButton().click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(completeDraftMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(cacheKey)).not.toBeNull();
    expect(localStorage.getItem(cacheKey)).toContain('invoice.pdf');
    expect(container?.textContent).toContain('입력과 첨부는 유지');
    expect(handlers.onSaved).not.toHaveBeenCalled();
    expect(handlers.onWorkspaceStateChange)
      .not.toHaveBeenCalledWith({ currentStep: 1, tradeId: null });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('거래 저장 성공 후 DB draft 삭제가 실패해도 local/React 상태를 비우고 제출 이력으로 이동한다', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    completeDraftMock.mockRejectedValue(new Error('draft delete failed'));
    const handlers = renderFlow();
    act(() => button('진행 중으로 저장').click());

    await act(async () => {
      confirmInProgressButton().click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(handlers.onComplete).toHaveBeenCalledOnce();
    expect(localStorage.getItem(cacheKey)).toBeNull();
    expect(handlers.onWorkspaceStateChange)
      .toHaveBeenLastCalledWith({ currentStep: 1, tradeId: null });
    expect(handlers.onSaved).toHaveBeenCalledOnce();
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});

describe('수입 문서관리 조회 모드', () => {
  it.each([
    ['shipper', otherDraftKey],
    ['forwarder', cacheKey],
  ] as const)('수입 %s 결과 화면은 완료·수정 액션 대신 닫기만 표시한다', (role, roleCacheKey) => {
    localStorage.setItem(roleCacheKey, JSON.stringify(cachedForwarderState()));
    const onClose = vi.fn();
    const onComplete = vi.fn().mockResolvedValue(savedTrade());
    renderFlow(onComplete, { role, readOnly: true, onClose });

    expect(container?.textContent).not.toContain('단계 초기화');
    expect(container?.textContent).not.toContain('완료 및 제출');
    expect(Array.from(container?.querySelectorAll('button') ?? [])
      .some((candidate) => candidate.textContent?.trim() === '진행 중으로 저장')).toBe(false);
    act(() => button('닫기').click());
    expect(onClose).toHaveBeenCalledOnce();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('수입 포워더는 조회 상태를 유지하면서 3단계와 2단계를 왕복한 뒤 닫는다', () => {
    const initialCache = JSON.stringify(cachedForwarderState());
    localStorage.setItem(cacheKey, initialCache);
    const onClose = vi.fn();
    const handlers = renderFlow(vi.fn().mockResolvedValue(savedTrade()), {
      role: 'forwarder',
      readOnly: true,
      onClose,
    });

    expect(container?.textContent).toContain('통관 진행 현황');
    act(() => button('2단계 이전 단계 보기').click());
    expect(container?.textContent).toContain('분석 결과 확인 및 수정');
    expect(container?.querySelector<HTMLFieldSetElement>('.workspace-readonly-fieldset')?.disabled).toBe(true);

    act(() => button('3단계 통관처리 보기').click());
    expect(container?.textContent).toContain('통관 진행 현황');
    act(() => button('닫기').click());

    expect(onClose).toHaveBeenCalledOnce();
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(handlers.onWorkspaceStateChange).not.toHaveBeenCalled();
    expect(localStorage.getItem(cacheKey)).toBe(initialCache);
  });

  it('수입 화주는 조회 상태를 유지하면서 3단계와 2단계를 왕복한 뒤 닫는다', () => {
    const initialCache = JSON.stringify(cachedForwarderState());
    localStorage.setItem(otherDraftKey, initialCache);
    const onClose = vi.fn();
    const handlers = renderFlow(vi.fn().mockResolvedValue(savedTrade()), {
      role: 'shipper',
      readOnly: true,
      onClose,
    });

    expect(container?.textContent).toContain('수입신고 의뢰서');
    expect(container?.textContent).not.toContain('완료 및 제출');
    act(() => button('2단계 이전 단계 보기').click());
    expect(container?.textContent).toContain('G. 품목별 HSK 자동추천 및 확정');
    const manualHsInput = container?.querySelector<HTMLInputElement>('.import-hs-manual input');
    expect(manualHsInput?.matches(':disabled')).toBe(true);
    expect(button('직접 입력 확정').matches(':disabled')).toBe(true);

    act(() => button('3단계 세액·의뢰서 보기').click());
    expect(container?.textContent).toContain('수입신고 의뢰서');
    act(() => button('닫기').click());

    expect(onClose).toHaveBeenCalledOnce();
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(handlers.onWorkspaceStateChange).not.toHaveBeenCalled();
    expect(localStorage.getItem(otherDraftKey)).toBe(initialCache);
  });

  it('수입 화주 resume/normal 모드는 2단계 입력과 최종 완료 액션을 편집 가능하게 유지한다', () => {
    localStorage.setItem(otherDraftKey, JSON.stringify(cachedForwarderState()));
    renderFlow(vi.fn().mockResolvedValue(savedTrade()), {
      role: 'shipper',
      readOnly: false,
    });

    // '단계 초기화'는 이제 1단계(입력)에서만 노출된다 — 결과 단계(2·3)에서는 소개 헤더와 함께 숨김.
    // 편집(normal) 모드 유지 여부는 '완료' 액션 노출 + '닫기'(읽기전용) 미노출 + 아래 입력 활성으로 검증한다.
    expect(container?.textContent).toContain('완료');
    expect(container?.textContent).not.toContain('닫기');
    act(() => button('이전').click());
    const manualHsInput = container?.querySelector<HTMLInputElement>('.import-hs-manual input');
    expect(manualHsInput?.matches(':disabled')).toBe(false);
    expect(button('직접 입력 확정').matches(':disabled')).toBe(false);
  });
});
