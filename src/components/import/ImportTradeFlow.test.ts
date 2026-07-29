// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { tradeProfileToFormData } from '../../services/tradeDataMapper';
import type { TradeDraftRow } from '../../services/draftCacheService';
import {
  hydrateImportDraft,
  ImportFileResolutionError,
  importDraftFormData,
  resolveImportAnalysisFiles,
  type CachedState,
} from './ImportTradeFlow';

const baseState: CachedState = {
  step: 1,
  documents: [],
  analysis: null,
  suggestions: [],
  selectedCode: '',
  duty: null,
  dutyError: '',
  risks: [],
  cargo: null,
  arrivalNotice: null,
  generatedAt: null,
};

const attachment = {
  id: 'ci-1',
  documentType: 'commercial_invoice' as const,
  fileName: 'invoice.pdf',
  storageBucket: 'trade-documents',
  storagePath: 'user/import-trade/commercial_invoice/ci-1-invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 500,
  uploadedAt: '2026-07-30T03:00:00.000Z',
};

function draft(role: 'shipper' | 'forwarder'): TradeDraftRow {
  const formData = tradeProfileToFormData({
    tradeType: 'import',
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
  }, role, [attachment]);
  return {
    user_id: 'user',
    direction: 'import',
    role,
    trade_id: 'import-trade',
    schema_version: 3,
    current_step: 3,
    form_data: formData,
    profile: {
      tradeType: 'import',
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
    },
    updated_at: '2026-07-30T03:00:00.000Z',
  };
}

describe('수입 초안 attachment hydration', () => {
  it.each(['shipper', 'forwarder'] as const)('import/%s 초안의 step, trade ID, persisted 파일을 복원한다', (role) => {
    const hydrated = hydrateImportDraft(baseState, draft(role));
    expect(hydrated.step).toBe(3);
    expect(hydrated.tradeId).toBe('import-trade');
    expect(hydrated.documents[0]).toMatchObject({
      id: 'ci-1',
      name: 'invoice.pdf',
      uploadStatus: 'uploaded',
      storagePath: attachment.storagePath,
    });
  });

  it('같은 거래 이어쓰기에서는 trade snapshot의 최신 경로를 stale draft보다 우선한다', () => {
    const currentPath = 'user/import-trade/commercial_invoice/current-invoice.pdf';
    const hydrated = hydrateImportDraft({
      ...baseState,
      step: 3,
      tradeId: 'import-trade',
      documents: [{
        id: 'ci-1',
        name: 'invoice.pdf',
        size: 500,
        mimeType: 'application/pdf',
        type: 'commercial_invoice',
        status: 'ready',
        uploadStatus: 'uploaded',
        analysisStatus: 'pending',
        storageBucket: 'trade-documents',
        storagePath: currentPath,
        uploadedAt: '2026-07-30T04:00:00.000Z',
      }],
    }, {
      ...draft('forwarder'),
      form_data: {
        ...draft('forwarder').form_data!,
        attachments: [{
          ...attachment,
          storagePath: 'user/draft-import-forwarder/commercial_invoice/stale-invoice.pdf',
        }],
      },
    });

    expect(hydrated.documents[0].storagePath).toBe(currentPath);
    expect(hydrated.step).toBe(3);
  });

  it('DB form_data에는 Storage 경로가 있는 metadata만 포함한다', () => {
    const formData = importDraftFormData({
      ...baseState,
      documents: [
        {
          id: 'pending',
          name: 'pending.pdf',
          size: 10,
          mimeType: 'application/pdf',
          type: 'commercial_invoice',
          status: 'ready',
        },
        {
          id: 'persisted',
          name: 'persisted.pdf',
          size: 20,
          mimeType: 'application/pdf',
          type: 'packing_list',
          status: 'ready',
          storageBucket: 'trade-documents',
          storagePath: 'user/draft/packing_list/persisted.pdf',
          uploadedAt: '2026-07-30T03:00:00.000Z',
        },
      ],
    }, 'forwarder');
    expect(formData.attachments).toHaveLength(1);
    expect(formData.attachments[0]).toMatchObject({
      id: 'persisted',
      storagePath: 'user/draft/packing_list/persisted.pdf',
    });
    expect(formData.attachments[0]).not.toHaveProperty('file');
  });

  it('metadata hydration만으로는 Storage download를 호출하지 않는다', () => {
    const loader = vi.fn();
    const hydrated = hydrateImportDraft(baseState, draft('shipper'));

    expect(hydrated.documents[0].name).toBe('invoice.pdf');
    expect(hydrated.documents[0].uploadStatus).toBe('uploaded');
    expect(loader).not.toHaveBeenCalled();
  });

  it('AI 분석 시에만 persisted 파일을 private Storage에서 File로 변환한다', async () => {
    const file = new File(['pdf'], 'invoice.pdf', { type: 'application/pdf' });
    const document = hydrateImportDraft(baseState, draft('shipper')).documents[0];
    const loader = vi.fn().mockResolvedValue(file);

    const resolved = await resolveImportAnalysisFiles([document], {}, loader);

    expect(loader).toHaveBeenCalledWith(expect.objectContaining({
      storageBucket: 'trade-documents',
      storagePath: attachment.storagePath,
      fileName: 'invoice.pdf',
    }));
    expect(resolved[document.id]).toBe(file);
  });

  it('download 실패 시 metadata를 변경하지 않고 파일별 안전한 오류를 제공한다', async () => {
    const document = hydrateImportDraft(baseState, draft('shipper')).documents[0];
    const before = JSON.stringify(document);
    const loader = vi.fn().mockRejectedValue(new Error('Object not found'));

    const error = await resolveImportAnalysisFiles([document], {}, loader)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(ImportFileResolutionError);
    expect(error.failures).toEqual([
      expect.objectContaining({
        documentId: document.id,
        fileName: 'invoice.pdf',
        code: 'STORAGE_DOWNLOAD_FAILED',
      }),
    ]);
    expect(JSON.stringify(document)).toBe(before);
  });

  it('pending File이 있으면 Storage download 없이 그대로 분석 입력에 사용한다', async () => {
    const document = {
      id: 'pending',
      name: 'pending.pdf',
      size: 10,
      mimeType: 'application/pdf',
      type: 'commercial_invoice' as const,
      status: 'ready' as const,
    };
    const file = new File(['pdf'], 'pending.pdf', { type: 'application/pdf' });
    const loader = vi.fn();

    const resolved = await resolveImportAnalysisFiles(
      [document],
      { pending: file },
      loader,
    );

    expect(resolved.pending).toBe(file);
    expect(loader).not.toHaveBeenCalled();
  });
});
