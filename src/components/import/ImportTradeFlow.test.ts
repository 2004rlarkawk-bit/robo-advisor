// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { tradeProfileToFormData } from '../../services/tradeDataMapper';
import { buildImportAnalysisRequestDocuments } from '../../services/importDocumentAnalysisService';
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

  it('같은 거래의 로컬 표시 ID가 달라도 동일 metadata의 DB storagePath를 복원한다', () => {
    const hydrated = hydrateImportDraft({
      ...baseState,
      tradeId: 'import-trade',
      documents: [{
        id: 'local-pending-id',
        name: attachment.fileName,
        size: attachment.sizeBytes,
        mimeType: attachment.mimeType,
        type: attachment.documentType,
        status: 'ready',
        uploadStatus: 'uploaded',
        analysisStatus: 'pending',
        storageBucket: 'trade-documents',
        storagePath: '',
      }],
    }, draft('forwarder'));

    expect(hydrated.documents).toHaveLength(1);
    expect(hydrated.documents[0]).toMatchObject({
      id: 'local-pending-id',
      storageBucket: attachment.storageBucket,
      storagePath: attachment.storagePath,
      uploadedAt: attachment.uploadedAt,
    });
  });

  it('모호한 파일 metadata는 다른 persisted 경로에 임의 연결하지 않는다', () => {
    const duplicate = {
      ...attachment,
      id: 'ci-2',
      storagePath: 'user/import-trade/commercial_invoice/ci-2-invoice.pdf',
    };
    const baseDraft = draft('forwarder');
    const hydrated = hydrateImportDraft({
      ...baseState,
      tradeId: 'import-trade',
      documents: [{
        id: 'local-pending-id',
        name: attachment.fileName,
        size: attachment.sizeBytes,
        mimeType: attachment.mimeType,
        type: attachment.documentType,
        status: 'ready',
        storagePath: '',
      }],
    }, {
      ...baseDraft,
      form_data: {
        ...baseDraft.form_data!,
        attachments: [attachment, duplicate],
      },
    });

    expect(hydrated.documents).toHaveLength(1);
    expect(hydrated.documents[0].storagePath).toBe('');
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

    const resolved = await resolveImportAnalysisFiles(
      [document],
      {},
      loader,
      'user',
    );

    expect(loader).toHaveBeenCalledWith(
      expect.objectContaining({
        storageBucket: 'trade-documents',
        storagePath: attachment.storagePath,
        fileName: 'invoice.pdf',
      }),
      'user',
    );
    expect(resolved.files[document.id]).toBe(file);
    expect(resolved.failures).toEqual([]);
  });

  it('download 실패 시 metadata를 변경하지 않고 파일별 안전한 오류를 반환한다', async () => {
    const document = hydrateImportDraft(baseState, draft('shipper')).documents[0];
    const before = JSON.stringify(document);
    const loader = vi.fn().mockRejectedValue(new Error('Object not found'));

    const result = await resolveImportAnalysisFiles([document], {}, loader);

    expect(result.files).toEqual({});
    expect(result.failures).toEqual([
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

    expect(resolved.files.pending).toBe(file);
    expect(resolved.failures).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });

  it('source File과 storagePath가 모두 없는 경우에만 PENDING_FILE_MISSING을 반환한다', async () => {
    const result = await resolveImportAnalysisFiles([{
      id: 'missing',
      name: 'missing.pdf',
      size: 10,
      mimeType: 'application/pdf',
      type: 'commercial_invoice',
      status: 'ready',
      storageBucket: 'trade-documents',
      storagePath: '',
    }], {}, vi.fn());

    expect(result.files).toEqual({});
    expect(result.failures).toEqual([
      expect.objectContaining({
        documentId: 'missing',
        code: 'PENDING_FILE_MISSING',
        maskedStoragePath: '',
      }),
    ]);
  });

  it('ID가 달랐던 persisted 3개를 hydration한 뒤 각각 실제 storagePath로 download한다', async () => {
    const types = ['commercial_invoice', 'packing_list', 'bill_of_lading'] as const;
    const attachments = types.map((documentType, index) => ({
      ...attachment,
      id: `persisted-${index}`,
      documentType,
      fileName: `${documentType}.pdf`,
      storagePath: `user/import-trade/${documentType}/persisted-${index}.pdf`,
    }));
    const baseDraft = draft('shipper');
    const hydrated = hydrateImportDraft({
      ...baseState,
      tradeId: 'import-trade',
      documents: attachments.map((item, index) => ({
        id: `local-${index}`,
        name: item.fileName,
        size: item.sizeBytes,
        mimeType: item.mimeType,
        type: item.documentType,
        status: 'ready' as const,
        uploadStatus: 'uploaded' as const,
        analysisStatus: 'pending' as const,
        storageBucket: 'trade-documents',
        storagePath: '',
      })),
    }, {
      ...baseDraft,
      form_data: {
        ...baseDraft.form_data!,
        attachments,
      },
    });
    const loader = vi.fn(async (input: { fileName: string }) =>
      new File(['pdf'], input.fileName, { type: 'application/pdf' }));

    const result = await resolveImportAnalysisFiles(hydrated.documents, {}, loader, 'user');

    expect(loader).toHaveBeenCalledTimes(3);
    attachments.forEach((item) => {
      expect(loader).toHaveBeenCalledWith(
        expect.objectContaining({ storagePath: item.storagePath }),
        'user',
      );
    });
    expect(result.failures).toEqual([]);
    expect(Object.keys(result.files)).toEqual(['local-0', 'local-1', 'local-2']);
  });

  it('여러 persisted 문서의 Storage download를 동시에 시작한다', async () => {
    const documents = ['ci', 'pl', 'bl'].map((id) => ({
      id,
      name: `${id}.pdf`,
      size: 3,
      mimeType: 'application/pdf',
      type: 'other' as const,
      status: 'ready' as const,
      storageBucket: 'trade-documents',
      storagePath: `user/draft/${id}.pdf`,
    }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const loader = vi.fn(async (input: { fileName: string }) => {
      await gate;
      return new File(['pdf'], input.fileName, { type: 'application/pdf' });
    });

    const pending = resolveImportAnalysisFiles(documents, {}, loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(3));
    release();
    const result = await pending;

    expect(Object.keys(result.files)).toEqual(['ci', 'pl', 'bl']);
  });

  it('3개 중 1개 download 실패 시 성공한 2개 File과 실패 metadata를 함께 반환한다', async () => {
    const documents = ['ci', 'pl', 'bl'].map((id, index) => ({
      id,
      name: `${id}.pdf`,
      size: 3,
      mimeType: 'application/pdf',
      type: [
        'commercial_invoice',
        'packing_list',
        'bill_of_lading',
      ][index] as 'commercial_invoice' | 'packing_list' | 'bill_of_lading',
      status: 'ready' as const,
      storageBucket: 'trade-documents',
      storagePath: `user/draft-import-forwarder/${id}/${id}.pdf`,
    }));
    const loader = vi.fn(async (input: { fileName: string }) => {
      if (input.fileName === 'pl.pdf') throw new Error('download failed');
      return new File(['pdf'], input.fileName, { type: 'application/pdf' });
    });

    const result = await resolveImportAnalysisFiles(documents, {}, loader);

    expect(Object.keys(result.files)).toEqual(['ci', 'bl']);
    expect(result.failures).toEqual([
      expect.objectContaining({ documentId: 'pl', fileName: 'pl.pdf' }),
    ]);
    expect(documents[1].storagePath).toBe(
      'user/draft-import-forwarder/pl/pl.pdf',
    );
  });

  it('모든 persisted download가 실패하면 분석 중단용 오류에 실패 목록을 보존한다', async () => {
    const document = hydrateImportDraft(baseState, draft('shipper')).documents[0];
    const result = await resolveImportAnalysisFiles(
      [document],
      {},
      vi.fn().mockRejectedValue(new Error('download failed')),
    );

    expect(() => {
      if (Object.keys(result.files).length === 0) {
        throw new ImportFileResolutionError(result.failures);
      }
    }).toThrow(ImportFileResolutionError);
    expect(result.failures).toHaveLength(1);
  });

  it('새로고침 전 pending File과 새로고침 후 복원 File이 동일 분석 요청 구조를 만든다', async () => {
    const document = hydrateImportDraft(baseState, draft('shipper')).documents[0];
    const pending = new File(['same-pdf'], document.name, {
      type: document.mimeType,
    });
    const restored = new File(['same-pdf'], document.name, {
      type: document.mimeType,
    });

    const beforeRefresh = await buildImportAnalysisRequestDocuments(
      [document],
      { [document.id]: pending },
    );
    const afterRefresh = await buildImportAnalysisRequestDocuments(
      [document],
      { [document.id]: restored },
    );

    expect(afterRefresh).toEqual(beforeRefresh);
    expect(afterRefresh[0]).toMatchObject({
      id: document.id,
      fileName: document.name,
      mimeType: document.mimeType,
      documentType: document.type,
    });
    expect(afterRefresh[0].dataUrl).toMatch(/^data:application\/pdf;base64,/);
  });
});
