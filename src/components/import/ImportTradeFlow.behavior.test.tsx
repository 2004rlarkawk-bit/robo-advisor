// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeImportAnalysisResult } from '../../services/importDocumentAnalysisService';
import type { SavedTrade } from '../../types';
import ImportTradeFlow from './ImportTradeFlow';

const { completeDraftMock } = vi.hoisted(() => ({
  completeDraftMock: vi.fn(),
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

function renderFlow(onComplete = vi.fn().mockResolvedValue(savedTrade())) {
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
});
