// @vitest-environment happy-dom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tradeProfileToFormData } from '../services/tradeDataMapper';
import type { TradeDraftRow } from '../services/draftCacheService';
import type { TradeProfile } from '../types';

const { loadMock, saveMock, isSubmittedMock, deleteMock } = vi.hoisted(() => ({
  loadMock: vi.fn(),
  saveMock: vi.fn(),
  isSubmittedMock: vi.fn().mockResolvedValue(false),
  deleteMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/draftCacheService', () => ({
  deleteTradeDraft: deleteMock,
  loadTradeDraft: loadMock,
  isSubmittedTradeDraft: isSubmittedMock,
  saveTradeFormDraft: saveMock,
}));

import { useFormDataDraft } from './useFormDataDraft';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const emptyProfile: TradeProfile = {
  tradeType: 'import' as const,
  itemName: '',
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
};
const emptyFormData = tradeProfileToFormData(emptyProfile, 'forwarder');
const restoredFormData = {
  ...emptyFormData,
  shipment: { ...emptyFormData.shipment, blNo: 'BL-RESTORED' },
};

function Harness({ enabled }: { enabled: boolean }) {
  const [formData, setFormData] = useState(emptyFormData);
  const [step, setStep] = useState(1);
  useFormDataDraft({
    userId: 'user',
    enabled,
    direction: 'import',
    role: 'forwarder',
    formData,
    currentStep: step,
    tradeId: null,
    onRestore: (draft) => {
      if (!draft?.form_data) return;
      setFormData(draft.form_data);
      setStep(draft.current_step ?? 1);
    },
  });
  return <span>{formData.shipment.blNo}|{step}</span>;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
  vi.clearAllMocks();
  isSubmittedMock.mockResolvedValue(false);
});

describe('공통 form_data draft hydration', () => {
  it('DB draft가 submitted 거래를 가리키면 formData와 step을 복원하지 않는다', async () => {
    isSubmittedMock.mockResolvedValue(true);
    saveMock.mockResolvedValue({ saved: true, updatedAt: '2026-08-15T00:01:00.000Z' });
    loadMock.mockResolvedValue({
      user_id: 'user', direction: 'import', role: 'forwarder', trade_id: 'submitted-trade',
      current_step: 3, form_data: restoredFormData, profile: emptyProfile,
      updated_at: '2026-08-15T00:00:00.000Z',
    });

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness enabled />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toBe('|1');
    expect(deleteMock).toHaveBeenCalledWith('user', 'import', 'forwarder');
  });

  it('DB hydration 전 빈 form_data를 저장하지 않고 복원된 step/form_data만 저장한다', async () => {
    vi.useFakeTimers();
    let resolveDraft!: (draft: TradeDraftRow) => void;
    loadMock.mockReturnValue(new Promise((resolve) => { resolveDraft = resolve; }));
    saveMock.mockResolvedValue({ saved: true, updatedAt: '2026-07-30T04:00:00.000Z' });

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Harness enabled={false} />));
    act(() => root?.render(<Harness enabled />));

    expect(saveMock).not.toHaveBeenCalled();
    await act(async () => {
      resolveDraft({
        user_id: 'user',
        direction: 'import',
        role: 'forwarder',
        schema_version: 3,
        current_step: 3,
        form_data: restoredFormData,
        profile: emptyProfile,
        updated_at: '2026-07-30T03:00:00.000Z',
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toBe('BL-RESTORED|3');
    expect(saveMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'import',
      role: 'forwarder',
      currentStep: 3,
      formData: expect.objectContaining({
        schemaVersion: 3,
        direction: 'import',
        role: 'forwarder',
      }),
    }));
  });
});
