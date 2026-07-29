// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { normalizeImportAnalysisResult } from './importDocumentAnalysisService';
import {
  analyzeForwarderAttachments,
  mapExtractedFieldsToForwarderForm,
  mergeForwarderAutoFill,
} from './forwarderDocumentAnalysisService';
import { createEmptyForwarderFormState } from '../utils/forwarderForm';
import type { TradeAttachment } from '../types/tradeFormData';

const invoice: TradeAttachment = {
  id: 'invoice',
  documentType: 'other',
  fileName: 'commercial-invoice.pdf',
  storageBucket: 'trade-documents',
  storagePath: 'user/draft-export-forwarder/other/invoice.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 100,
  uploadedAt: '2026-07-30T00:00:00.000Z',
};

const packing: TradeAttachment = {
  ...invoice,
  id: 'packing',
  fileName: 'packing-list.pdf',
  storagePath: 'user/draft-export-forwarder/other/packing.pdf',
};

function response(id: string, extracted: Record<string, unknown>) {
  return {
    analysis: normalizeImportAnalysisResult({ extracted }),
    classifications: [{
      id,
      type: id === 'invoice' ? 'commercial_invoice' as const : 'packing_list' as const,
      confidence: 0.95,
      summary: 'classified',
      sourceId: id,
    }],
    suggestions: [],
    source: 'openai' as const,
    model: 'test',
  };
}

describe('수출 포워더 AI 문서 분석', () => {
  it('기존 수입 분석 응답을 현재 포워더 폼 필드에만 매핑한다', () => {
    const fields = normalizeImportAnalysisResult({
      extracted: {
        exporterDetails: { name: 'Exporter Co', address: 'Seoul' },
        consigneeDetails: { name: 'Buyer LLC', address: 'LA' },
        notifyPartyDetails: { name: 'Notify Inc' },
        vesselName: 'PORT STAR',
        voyageNo: 'V001',
        loadPort: 'KRPUS',
        dischargePort: 'USLAX',
        shipmentDate: '2026-08-01',
        estimatedArrivalDate: '2026-08-15',
        containerNumbers: ['CONT1'],
        sealNumbers: ['SEAL1'],
        grossWeight: '1,250.5',
        totalPackageCount: '20',
        packageUnit: 'CTNS',
        items: [{ description: 'Cotton shirts' }],
      },
    }).extracted;

    expect(mapExtractedFieldsToForwarderForm(fields)).toMatchObject({
      companyName: 'Exporter Co',
      companyAddress: 'Seoul',
      partnerName: 'Buyer LLC',
      partnerAddress: 'LA',
      notifyPartyName: 'Notify Inc',
      vesselOrFlight: 'PORT STAR',
      voyageNo: 'V001',
      loadPort: 'KRPUS',
      dischargePort: 'USLAX',
      itemName: 'Cotton shirts',
      packageCount: 20,
      packageType: 'CTNS',
      grossWeight: 1250.5,
    });
  });

  it('여러 문서를 개별 분석해 한 파일 실패 시 나머지 결과와 분류를 반영한다', async () => {
    const invoiceFile = new File(['invoice'], 'commercial-invoice.pdf', { type: 'application/pdf' });
    const loadFile = vi.fn(async (attachment: Pick<TradeAttachment, 'fileName'>) => {
      if (attachment.fileName === 'packing-list.pdf') throw new Error('Object not found');
      return invoiceFile;
    });
    const analyze = vi.fn(async () => response('invoice', {
      exporterDetails: { name: 'Exporter Co' },
      invoiceNo: 'INV-1',
      items: [{ description: 'Cotton shirts' }],
    }));

    const result = await analyzeForwarderAttachments(
      [invoice, packing],
      {},
      { loadFile, analyze },
    );

    expect(analyze).toHaveBeenCalledOnce();
    expect(result.values).toMatchObject({
      companyName: 'Exporter Co',
      itemName: 'Cotton shirts',
    });
    expect(result.classifications.invoice).toBe('commercial_invoice');
    expect(result.failures).toEqual([
      expect.objectContaining({ attachmentId: 'packing', fileName: 'packing-list.pdf' }),
    ]);
  });

  it('새로 업로드한 File은 다시 Storage download하지 않고 분석한다', async () => {
    const file = new File(['invoice'], 'commercial-invoice.pdf', { type: 'application/pdf' });
    const loadFile = vi.fn();
    const analyze = vi.fn(async () => response('invoice', {
      exporterDetails: { name: 'Exporter Co' },
    }));

    await analyzeForwarderAttachments(
      [invoice],
      { invoice: file },
      { loadFile, analyze },
    );

    expect(loadFile).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'invoice', storagePath: invoice.storagePath })],
      { invoice: file },
    );
  });

  it('빈 필드만 채우고 사용자가 입력한 충돌값은 보호한다', () => {
    const current = {
      ...createEmptyForwarderFormState(),
      companyName: 'User Company',
    };
    const merged = mergeForwarderAutoFill(current, {
      companyName: 'AI Company',
      itemName: 'Cotton shirts',
    }, {
      companyName: 'invoice.pdf',
      itemName: 'invoice.pdf',
    });

    expect(merged.state.companyName).toBe('User Company');
    expect(merged.state.itemName).toBe('Cotton shirts');
    expect(merged.conflicts).toEqual([
      expect.objectContaining({
        field: 'companyName',
        currentValue: 'User Company',
        analyzedValue: 'AI Company',
        sourceFileName: 'invoice.pdf',
      }),
    ]);
  });
});
