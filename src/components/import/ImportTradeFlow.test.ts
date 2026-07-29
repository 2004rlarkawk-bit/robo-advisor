import { describe, expect, it } from 'vitest';
import { tradeProfileToFormData } from '../../services/tradeDataMapper';
import type { TradeDraftRow } from '../../services/draftCacheService';
import {
  hydrateImportDraft,
  importDraftFormData,
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
});
