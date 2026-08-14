// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { normalizeImportAnalysisResult } from './importDocumentAnalysisService';
import {
  analyzeForwarderAttachments,
  mapExtractedFieldsToForwarderForm,
  mergeForwarderCargoDocuments,
  mergeForwarderAutoFill,
} from './forwarderDocumentAnalysisService';
import { createEmptyForwarderFormState } from '../utils/forwarderForm';
import type { ForwarderFormState } from '../utils/forwarderForm';
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
        invoiceNo: 'INV-100',
        exportDeclarationNo: 'EXP-100',
        incoterms: 'FOB',
        loadingMode: 'FCL',
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
        measurement: '12.5 CBM',
        shippingMarks: 'ABC / BUSAN',
        items: [{ description: 'Cotton shirts' }],
      },
    }).extracted;

    expect(mapExtractedFieldsToForwarderForm(fields)).toMatchObject({
      companyName: 'Exporter Co',
      companyAddress: 'Seoul',
      partnerName: 'Buyer LLC',
      partnerAddress: 'LA',
      notifyPartyName: 'Notify Inc',
      invoiceNo: 'INV-100',
      exportDeclarationNo: 'EXP-100',
      incoterms: 'FOB',
      loadPort: 'KRPUS',
      dischargePort: 'USLAX',
      requestedDepartureDate: '2026-08-01',
      loadingMode: 'FCL',
      itemName: 'Cotton shirts',
      packageCount: 20,
      packageType: 'CARTON',
      grossWeight: 1250.5,
      measurement: '12.5',
      shippingMarks: 'ABC / BUSAN',
    });
    expect(mapExtractedFieldsToForwarderForm(fields)).not.toHaveProperty('vesselOrFlight');
    expect(mapExtractedFieldsToForwarderForm(fields)).not.toHaveProperty('voyageNo');
    expect(mapExtractedFieldsToForwarderForm(fields)).not.toHaveProperty('arrivalDate');
    expect(mapExtractedFieldsToForwarderForm(fields)).not.toHaveProperty('containerNo');
    expect(mapExtractedFieldsToForwarderForm(fields)).not.toHaveProperty('sealNo');
  });

  it('품목별 값 없이 TOTAL만 있으면 첫 품목 필드로 복사하지 않고 P/L total만 보존한다', async () => {
    const files = {
      invoice: new File(['invoice'], invoice.fileName, { type: 'application/pdf' }),
      packing: new File(['packing'], packing.fileName, { type: 'application/pdf' }),
    };
    const analyze = vi.fn(async (documents: Array<{ id: string }>) => response(documents[0].id, documents[0].id === 'invoice'
      ? { totalPackageCount: '10', grossWeight: '100', shippingMarks: 'INVOICE MARK' }
      : { totalPackageCount: '20', grossWeight: '250', shippingMarks: 'PACKING MARK' }));
    const result = await analyzeForwarderAttachments([invoice, packing], files, {
      loadFile: vi.fn(), analyze,
    });
    expect(result.values.cargoItems).toBeUndefined();
    expect(result.values.cargoTotals).toEqual({
      numberOfPackages: 20, grossWeightKg: 250, measurementCbm: '',
    });
    expect(result.values.packageCount).toBeUndefined();
    expect(result.values.grossWeight).toBeUndefined();
  });

  it('2개 품목과 문서 TOTAL을 분리해 품목별 수치를 유지한다', () => {
    const mapped = mapExtractedFieldsToForwarderForm(normalizeImportAnalysisResult({ extracted: {
      totalPackageCount: '30', grossWeight: '300', measurement: '1.5',
      items: [
        { id: 'a', description: 'Facial Toner', packageCount: '10', packageUnit: 'Cartons', grossWeight: '100', measurement: '0.5' },
        { id: 'b', description: 'Moisturizing Cream', packageCount: '20', packageUnit: 'CARTON', grossWeight: '200', measurement: '1.0' },
      ],
    } }).extracted);

    expect(mapped.cargoItems).toEqual([
      expect.objectContaining({ descriptionOfGoods: 'Facial Toner', numberOfPackages: 10, kindOfPackages: 'CARTON', grossWeightKg: 100, measurementCbm: '0.5' }),
      expect.objectContaining({ descriptionOfGoods: 'Moisturizing Cream', numberOfPackages: 20, kindOfPackages: 'CARTON', grossWeightKg: 200, measurementCbm: '1.0' }),
    ]);
    expect(mapped.cargoTotals).toEqual({ numberOfPackages: 30, grossWeightKg: 300, measurementCbm: '1.5' });
    expect(mapped.packageCount).toBe(10);
    expect(mapped.grossWeight).toBe(100);
  });

  it('C/I 품명과 P/L 물류 수치를 같은 품목명으로 병합하고 P/L을 우선한다', () => {
    const emptyTotals = { numberOfPackages: '' as const, grossWeightKg: '' as const, measurementCbm: '' };
    const ciItems = mapExtractedFieldsToForwarderForm(normalizeImportAnalysisResult({ extracted: { items: [
      { id: 'ci-1', description: 'Facial Toner' },
      { id: 'ci-2', description: 'Moisturizing Cream' },
    ] } }).extracted).cargoItems!;
    const plItems = mapExtractedFieldsToForwarderForm(normalizeImportAnalysisResult({ extracted: { items: [
      { id: 'pl-1', description: 'Facial Toner', packageCount: '10', packageUnit: 'Cartons', grossWeight: '100', measurement: '0.5' },
      { id: 'pl-2', description: 'Moisturizing Cream', packageCount: '20', packageUnit: 'Cartons', grossWeight: '200', measurement: '1.0' },
    ] } }).extracted).cargoItems!;
    const merged = mergeForwarderCargoDocuments([
      { items: plItems, totals: emptyTotals, documentType: 'packing_list' },
      { items: ciItems, totals: emptyTotals, documentType: 'commercial_invoice' },
    ]);

    expect(merged.items).toHaveLength(2);
    expect(merged.items[0]).toMatchObject({ descriptionOfGoods: 'Facial Toner', numberOfPackages: 10, grossWeightKg: 100 });
    expect(merged.items[1]).toMatchObject({ descriptionOfGoods: 'Moisturizing Cream', numberOfPackages: 20, grossWeightKg: 200 });
  });

  it('단순 표기 차이는 충돌로 만들지 않고 실제 차이만 유지한다', () => {
    const current = {
      ...createEmptyForwarderFormState(),
      packageType: 'CARTON',
      dischargePort: 'Tokyo Port',
      incoterms: 'FOB' as const,
    };
    const equivalent = mergeForwarderAutoFill(current, {
      packageType: 'Cartons',
      dischargePort: 'TOKYO',
      incoterms: 'FOB Busan Port' as ForwarderFormState['incoterms'],
    });
    expect(equivalent.conflicts).toEqual([]);

    const different = mergeForwarderAutoFill(current, {
      dischargePort: 'Shanghai Port',
      incoterms: 'CIF' as const,
    });
    expect(different.conflicts.map(({ field }) => field).sort())
      .toEqual(['dischargePort', 'incoterms']);
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

  it('독립 문서 분석을 동시에 시작하고 결과는 첨부 순서대로 병합한다', async () => {
    const files = {
      invoice: new File(['invoice'], invoice.fileName, { type: 'application/pdf' }),
      packing: new File(['packing'], packing.fileName, { type: 'application/pdf' }),
    };
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const analyze = vi.fn(async (documents: Array<{ id: string }>) => {
      await gate;
      return response(documents[0].id, {
        exporterDetails: { name: documents[0].id === 'invoice' ? 'First' : 'Second' },
      });
    });

    const pending = analyzeForwarderAttachments(
      [invoice, packing],
      files,
      { loadFile: vi.fn(), analyze },
    );

    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    release();
    const result = await pending;

    expect(result.values.companyName).toBe('First');
    expect(result.documentConflicts).toEqual([
      expect.objectContaining({ currentValue: 'First', analyzedValue: 'Second' }),
    ]);
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
    expect(merged.profileReplacements).toEqual([]);
  });

  it('수동 수정하지 않은 기본 프로필 값은 충돌 시 서류값으로 교체한다', () => {
    const current = {
      ...createEmptyForwarderFormState(),
      companyName: 'Profile Company',
      companyAddress: 'Profile Address',
    };
    const merged = mergeForwarderAutoFill(
      current,
      { companyName: 'Document Company', companyAddress: 'Document Address' },
      { companyName: 'invoice.pdf', companyAddress: 'invoice.pdf' },
      { companyName: 'Profile Company', companyAddress: 'Profile Address' },
    );

    expect(merged.state.companyName).toBe('Document Company');
    expect(merged.state.companyAddress).toBe('Document Address');
    expect(merged.conflicts).toEqual([]);
    expect(merged.profileReplacements).toHaveLength(2);
  });

  it('기본 프로필에서 시작했어도 사용자가 수정한 필드는 서류값으로 덮어쓰지 않는다', () => {
    const current = {
      ...createEmptyForwarderFormState(),
      companyName: 'Manually Edited Company',
    };
    const merged = mergeForwarderAutoFill(
      current,
      { companyName: 'Document Company' },
      { companyName: 'invoice.pdf' },
      { companyName: 'Profile Company' },
      new Set<keyof ForwarderFormState>(['companyName']),
    );

    expect(merged.state.companyName).toBe('Manually Edited Company');
    expect(merged.profileReplacements).toEqual([]);
    expect(merged.conflicts).toEqual([
      expect.objectContaining({ currentValue: 'Manually Edited Company', analyzedValue: 'Document Company' }),
    ]);
  });
});
