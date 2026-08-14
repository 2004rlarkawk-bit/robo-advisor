import {
  createEmptyForwarderCargoItem,
  type ForwarderFormState,
} from '../utils/forwarderForm';
import type { ForwarderCargoItem, ForwarderCargoTotals } from '../types';
import type {
  ImportDocumentAnalysisResponse,
  ImportDocumentMeta,
  ImportExtractedFields,
} from '../types/importTrade';
import type { TradeAttachment } from '../types/tradeFormData';
import {
  analyzeImportDocuments,
} from './importDocumentAnalysisService';
import { loadTradeAttachmentFile } from './tradeAttachmentStorageService';
import { normalizeExportPortValue } from '../constants/ports';
import {
  areEquivalentTradeFieldValues,
  normalizeIncotermsCode,
  normalizePackageTypeValue,
} from '../utils/tradeValueNormalization';

export interface ForwarderAnalysisFailure {
  attachmentId: string;
  fileName: string;
  message: string;
}

export interface ForwarderDocumentConflict {
  field: keyof ForwarderFormState;
  currentValue: unknown;
  analyzedValue: unknown;
  sourceFileName: string;
}

export interface ForwarderAutoFillApplicationResult {
  state: ForwarderFormState;
  conflicts: ForwarderDocumentConflict[];
  profileReplacements: ForwarderDocumentConflict[];
}

export interface ForwarderAttachmentAnalysis {
  values: Partial<ForwarderFormState>;
  classifications: Record<string, TradeAttachment['documentType']>;
  sourceFiles: Record<string, string>;
  documentConflicts: ForwarderDocumentConflict[];
  failures: ForwarderAnalysisFailure[];
}

interface AnalysisDependencies {
  loadFile: typeof loadTradeAttachmentFile;
  analyze: (
    documents: ImportDocumentMeta[],
    filesById: Record<string, File>,
  ) => Promise<ImportDocumentAnalysisResponse>;
}

const DEFAULT_DEPENDENCIES: AnalysisDependencies = {
  loadFile: loadTradeAttachmentFile,
  analyze: analyzeImportDocuments,
};
const MAX_CONCURRENT_ANALYSES = 3;

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function numberValue(value: string): number | '' {
  const normalized = value.replace(/,/g, '').trim().match(/-?\d+(?:\.\d+)?/)?.[0] ?? '';
  if (!normalized) return '';
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : '';
}

function decimalText(value: string): string {
  return value.replace(/,/g, '').trim().match(/-?\d+(?:\.\d+)?/)?.[0] ?? '';
}

function packageUnitFromValues(packageCount: string, packageUnit: string): string {
  const explicit = normalizePackageTypeValue(packageUnit);
  if (explicit) return explicit;
  const combinedUnit = packageCount.trim().match(/\d(?:[\d,.]*)\s*([A-Za-z]+)\b/)?.[1] ?? '';
  return normalizePackageTypeValue(combinedUnit);
}

function cargoItemsFromExtracted(fields: ImportExtractedFields): ForwarderCargoItem[] {
  const singleItem = fields.items.length === 1;
  return fields.items
    .map((item, index) => ({
      ...createEmptyForwarderCargoItem(item.id || `cargo-${index + 1}`),
      itemNo: text(item.itemNo),
      sku: text(item.sku),
      descriptionOfGoods: text(item.description),
      numberOfPackages: numberValue(item.packageCount || (singleItem ? fields.totalPackageCount : '')),
      kindOfPackages: packageUnitFromValues(
        item.packageCount || (singleItem ? fields.totalPackageCount : ''),
        item.packageUnit || (singleItem ? fields.packageUnit : ''),
      ),
      grossWeightKg: numberValue(item.grossWeight || (singleItem ? fields.grossWeight : '')),
      measurementCbm: decimalText(item.measurement || (singleItem ? fields.measurement : '')),
      marksAndNumbers: text(item.shippingMarks || (singleItem ? fields.shippingMarks : '')),
      sourceDocumentIds: item.sourceDocumentIds,
    }))
    .filter((item) => Object.entries(item).some(([key, value]) =>
      !['id', 'sourceDocumentIds'].includes(key) && value !== ''),
    );
}

function cargoTotalsFromExtracted(fields: ImportExtractedFields): ForwarderCargoTotals {
  return {
    numberOfPackages: numberValue(fields.cargoTotals.numberOfPackages),
    grossWeightKg: numberValue(fields.cargoTotals.grossWeight),
    measurementCbm: decimalText(fields.cargoTotals.measurement),
  };
}

export function mapExtractedFieldsToForwarderForm(
  fields: ImportExtractedFields,
): Partial<ForwarderFormState> {
  const firstItem = fields.items[0];
  const cargoItems = cargoItemsFromExtracted(fields);
  const firstCargo = cargoItems[0];
  const consignee = fields.consigneeDetails.name
    ? fields.consigneeDetails
    : fields.importerDetails;
  return {
    companyName: text(fields.exporterDetails.name || fields.shipper),
    companyAddress: text(fields.exporterDetails.address),
    partnerName: text(consignee.name || fields.consignee || fields.importer),
    partnerAddress: text(consignee.address),
    invoiceNo: text(fields.invoiceNo),
    exportDeclarationNo: text(fields.exportDeclarationNo),
    incoterms: normalizeIncotermsCode(fields.incoterms) as ForwarderFormState['incoterms'],
    loadPort: normalizeExportPortValue(fields.loadPort),
    dischargePort: normalizeExportPortValue(fields.dischargePort),
    requestedDepartureDate: text(fields.shipmentDate),
    loadingMode: fields.loadingMode === 'FCL' || fields.loadingMode === 'LCL' ? fields.loadingMode : '',
    notifyPartyName: text(fields.notifyPartyDetails.name || fields.notifyParty),
    itemName: text(firstCargo?.descriptionOfGoods || firstItem?.description || fields.productDescription),
    packageCount: firstCargo?.numberOfPackages ?? '',
    packageType: firstCargo?.kindOfPackages ?? '',
    grossWeight: firstCargo?.grossWeightKg ?? '',
    measurement: firstCargo?.measurementCbm ?? '',
    shippingMarks: firstCargo?.marksAndNumbers ?? '',
    cargoItems,
    cargoTotals: cargoTotalsFromExtracted(fields),
  };
}

const PACKING_FIELDS = new Set<keyof ForwarderFormState>([
  'packageCount', 'packageType', 'grossWeight', 'measurement', 'shippingMarks',
]);
const REQUEST_FIELDS = new Set<keyof ForwarderFormState>([
  'loadPort', 'dischargePort', 'requestedDepartureDate', 'loadingMode', 'incoterms',
]);
const INVOICE_FIELDS = new Set<keyof ForwarderFormState>([
  'companyName', 'companyAddress', 'partnerName', 'partnerAddress', 'notifyPartyName', 'invoiceNo', 'itemName',
]);
const LEGACY_CARGO_FIELDS = new Set<keyof ForwarderFormState>([
  'itemName', 'packageCount', 'packageType', 'grossWeight', 'measurement', 'shippingMarks',
]);

function sourcePriority(field: keyof ForwarderFormState, type: string | undefined): number {
  if (PACKING_FIELDS.has(field)) return type === 'packing_list' ? 40 : type === 'transport_request' ? 30 : 10;
  if (REQUEST_FIELDS.has(field)) return type === 'transport_request' ? 40 : type === 'commercial_invoice' ? 20 : 10;
  if (field === 'exportDeclarationNo') return type === 'export_declaration' ? 50 : 10;
  if (INVOICE_FIELDS.has(field)) return type === 'commercial_invoice' ? 40 : type === 'transport_request' ? 30 : 10;
  return 10;
}

const CARGO_LOGISTICS_FIELDS = [
  'numberOfPackages', 'kindOfPackages', 'grossWeightKg', 'measurementCbm', 'marksAndNumbers',
] as const;

function cargoIdentity(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .replace(/(\d+(?:\.\d+)?)\s+(ML|L|MG|G|KG)\b/g, '$1$2');
}

function findCargoMatch(
  current: ForwarderCargoItem[],
  incoming: ForwarderCargoItem,
  index: number,
  incomingLength: number,
): ForwarderCargoItem | undefined {
  const itemNo = cargoIdentity(incoming.itemNo);
  const sku = cargoIdentity(incoming.sku);
  const description = cargoIdentity(incoming.descriptionOfGoods);
  const exact = current.find((candidate) =>
    (itemNo && cargoIdentity(candidate.itemNo) === itemNo)
    || (sku && cargoIdentity(candidate.sku) === sku)
    || (description && cargoIdentity(candidate.descriptionOfGoods) === description));
  if (exact) return exact;
  const positional = current[index];
  if (current.length === incomingLength && positional) {
    const positionalDescription = cargoIdentity(positional.descriptionOfGoods);
    if (!description || !positionalDescription || description === positionalDescription) return positional;
  }
  return undefined;
}

export function mergeForwarderCargoDocuments(documents: Array<{
  items: ForwarderCargoItem[];
  totals: ForwarderCargoTotals;
  documentType: string;
}>): { items: ForwarderCargoItem[]; totals: ForwarderCargoTotals } {
  const result: ForwarderCargoItem[] = [];
  let totals: ForwarderCargoTotals = { numberOfPackages: '', grossWeightKg: '', measurementCbm: '' };
  const ordered = [...documents].sort((left, right) =>
    sourcePriority('packageCount', left.documentType) - sourcePriority('packageCount', right.documentType));

  for (const document of ordered) {
    document.items.forEach((incoming, index) => {
      const current = findCargoMatch(result, incoming, index, document.items.length);
      if (!current) {
        result.push({ ...incoming, sourceDocumentIds: [...incoming.sourceDocumentIds] });
        return;
      }
      for (const field of ['itemNo', 'sku', 'descriptionOfGoods'] as const) {
        if (!current[field] && incoming[field]) current[field] = incoming[field];
      }
      for (const field of CARGO_LOGISTICS_FIELDS) {
        const value = incoming[field];
        if (value !== '') Object.assign(current, { [field]: value });
      }
      current.sourceDocumentIds = [...new Set([...current.sourceDocumentIds, ...incoming.sourceDocumentIds])];
    });
    if (document.documentType === 'packing_list' || totals.numberOfPackages === '') {
      totals = {
        numberOfPackages: document.totals.numberOfPackages || totals.numberOfPackages,
        grossWeightKg: document.totals.grossWeightKg || totals.grossWeightKg,
        measurementCbm: document.totals.measurementCbm || totals.measurementCbm,
      };
    }
  }
  return { items: result, totals };
}

function importDocument(attachment: TradeAttachment): ImportDocumentMeta {
  return {
    id: attachment.id,
    name: attachment.fileName,
    size: attachment.sizeBytes,
    mimeType: attachment.mimeType,
    type: attachment.documentType === 'arrival_notice' ? 'other' : attachment.documentType,
    status: 'ready',
    uploadStatus: 'uploaded',
    analysisStatus: 'pending',
    sourceId: attachment.id,
    storageBucket: attachment.storageBucket,
    storagePath: attachment.storagePath,
    uploadedAt: attachment.uploadedAt,
  };
}

function isFilled(value: ForwarderFormState[keyof ForwarderFormState] | undefined): boolean {
  return value !== undefined && value !== '';
}

export async function analyzeForwarderAttachments(
  attachments: TradeAttachment[],
  pendingFiles: Record<string, File>,
  dependenciesOrUserId: AnalysisDependencies | string = DEFAULT_DEPENDENCIES,
): Promise<ForwarderAttachmentAnalysis> {
  const dependencies = typeof dependenciesOrUserId === 'string'
    ? DEFAULT_DEPENDENCIES
    : dependenciesOrUserId;
  const expectedUserId = typeof dependenciesOrUserId === 'string'
    ? dependenciesOrUserId
    : undefined;
  const values: Partial<ForwarderFormState> = {};
  const classifications: Record<string, TradeAttachment['documentType']> = {};
  const sourceFiles: Record<string, string> = {};
  const sourcePriorities: Partial<Record<keyof ForwarderFormState, number>> = {};
  const documentConflicts: ForwarderDocumentConflict[] = [];
  const failures: ForwarderAnalysisFailure[] = [];
  const cargoDocuments: Array<{
    items: ForwarderCargoItem[];
    totals: ForwarderCargoTotals;
    documentType: string;
  }> = [];

  const startedAt = performance.now();
  const outcomes = await mapWithConcurrency(
    attachments,
    MAX_CONCURRENT_ANALYSES,
    async (attachment) => {
      try {
        const file = pendingFiles[attachment.id]
          ?? await dependencies.loadFile(attachment, expectedUserId);
        if (import.meta.env.DEV) {
          console.debug('[Export Forwarder Analysis] file received', {
            attachmentId: attachment.id,
            documentType: attachment.documentType,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          });
        }
        const document = importDocument(attachment);
        const result = await dependencies.analyze([document], { [attachment.id]: file });
        const classified = result.classifications.find(({ id }) => id === attachment.id)?.type;
        const mapped = mapExtractedFieldsToForwarderForm(result.analysis.extracted);
        if (import.meta.env.DEV) {
          console.debug('[Export Forwarder Analysis] detected document type', {
            attachmentId: attachment.id,
            requestedType: attachment.documentType,
            detectedType: classified ?? 'unknown',
          });
          console.debug('[Export Forwarder Analysis] form mapping completed', {
            attachmentId: attachment.id,
            mappedFields: Object.keys(mapped).filter((field) => isFilled(mapped[field as keyof ForwarderFormState])),
          });
        }
        return {
          kind: 'success' as const,
          attachment,
          mapped,
          classified,
        };
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[Export Forwarder Analysis] attachment failed', {
            stage: 'load_or_analyze',
            attachmentId: attachment.id,
            documentType: attachment.documentType,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return {
          kind: 'failure' as const,
          attachment,
          error: error instanceof Error ? error.message : '문서 분석에 실패했습니다.',
        };
      }
    },
  );

  // 병렬 실행 결과는 기존과 같은 첨부 순서로 병합해 충돌 우선순위를 유지한다.
  for (const outcome of outcomes) {
    const { attachment } = outcome;
    if (outcome.kind === 'failure') {
      failures.push({
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        message: outcome.error,
      });
      continue;
    }
    const { mapped, classified } = outcome;
    if (classified && classified !== 'unknown') {
      classifications[attachment.id] = classified;
    }
    cargoDocuments.push({
      items: (mapped.cargoItems ?? []).map((item) => ({
        ...item,
        sourceDocumentIds: item.sourceDocumentIds.length ? item.sourceDocumentIds : [attachment.id],
      })),
      totals: mapped.cargoTotals ?? { numberOfPackages: '', grossWeightKg: '', measurementCbm: '' },
      documentType: classified ?? attachment.documentType,
    });
    for (const [field, analyzedValue] of Object.entries(mapped) as Array<
      [keyof ForwarderFormState, ForwarderFormState[keyof ForwarderFormState]]
    >) {
      if (field === 'cargoItems' || field === 'cargoTotals') continue;
      if (mapped.cargoItems?.length && LEGACY_CARGO_FIELDS.has(field)) continue;
      if (!isFilled(analyzedValue)) continue;
      const currentValue = values[field] as ForwarderFormState[keyof ForwarderFormState] | undefined;
      if (!isFilled(currentValue)) {
        Object.assign(values, { [field]: analyzedValue });
        sourceFiles[field] = attachment.fileName;
      } else if (!areEquivalentTradeFieldValues(field, currentValue, analyzedValue)) {
        const nextPriority = sourcePriority(field, classified ?? attachment.documentType);
        const currentPriority = sourcePriorities[field] ?? 10;
        if (nextPriority > currentPriority) {
          documentConflicts.push({ field, currentValue: analyzedValue, analyzedValue: currentValue!, sourceFileName: sourceFiles[field] || attachment.fileName });
          Object.assign(values, { [field]: analyzedValue });
          sourceFiles[field] = attachment.fileName;
          sourcePriorities[field] = nextPriority;
        } else {
          documentConflicts.push({ field, currentValue: currentValue!, analyzedValue, sourceFileName: attachment.fileName });
        }
      }
      if (sourcePriorities[field] === undefined) sourcePriorities[field] = sourcePriority(field, classified ?? attachment.documentType);
    }
  }

  const cargo = mergeForwarderCargoDocuments(cargoDocuments);
  if (Object.values(cargo.totals).some((value) => value !== '')) {
    values.cargoTotals = cargo.totals;
  }
  if (cargo.items.length) {
    values.cargoItems = cargo.items;
    const first = cargo.items[0];
    Object.assign(values, {
      itemName: first.descriptionOfGoods,
      packageCount: first.numberOfPackages,
      packageType: first.kindOfPackages,
      grossWeight: first.grossWeightKg,
      measurement: first.measurementCbm,
      shippingMarks: first.marksAndNumbers,
    });
    sourceFiles.cargoItems = attachments.map(({ fileName }) => fileName).join(', ');
  }

  if (import.meta.env.DEV) {
    console.debug('[Export Document Analysis] timing', {
      documentCount: attachments.length,
      concurrency: Math.min(MAX_CONCURRENT_ANALYSES, attachments.length),
      totalMs: Math.round(performance.now() - startedAt),
      failureCount: failures.length,
    });
  }

  return { values, classifications, sourceFiles, documentConflicts, failures };
}

export function mergeForwarderAutoFill(
  current: ForwarderFormState,
  analyzed: Partial<ForwarderFormState>,
  sourceFiles: Record<string, string> = {},
  profileDefaults: Partial<ForwarderFormState> = {},
  manuallyEditedFields: ReadonlySet<keyof ForwarderFormState> = new Set(),
): ForwarderAutoFillApplicationResult {
  const state = { ...current, cargoItems: current.cargoItems.map((item) => ({ ...item })) };
  const conflicts: ForwarderDocumentConflict[] = [];
  const profileReplacements: ForwarderDocumentConflict[] = [];
  for (const [field, analyzedValue] of Object.entries(analyzed) as Array<
    [keyof ForwarderFormState, ForwarderFormState[keyof ForwarderFormState]]
  >) {
    if (!isFilled(analyzedValue)) continue;
    if (analyzed.cargoItems?.length && LEGACY_CARGO_FIELDS.has(field)) continue;
    if (field === 'cargoItems') {
      const cargoItems = analyzedValue as ForwarderCargoItem[];
      if (!cargoItems.length) continue;
      if (manuallyEditedFields.has('cargoItems')) {
        conflicts.push({
          field,
          currentValue: `품목 ${state.cargoItems.length}개`,
          analyzedValue: `분석 품목 ${cargoItems.length}개`,
          sourceFileName: sourceFiles.cargoItems || 'AI 분석 문서',
        });
        continue;
      }
      state.cargoItems = cargoItems.map((item) => ({ ...item }));
      const first = cargoItems[0];
      Object.assign(state, {
        itemName: first.descriptionOfGoods,
        packageCount: first.numberOfPackages,
        packageType: first.kindOfPackages,
        grossWeight: first.grossWeightKg,
        measurement: first.measurementCbm,
        shippingMarks: first.marksAndNumbers,
      });
      continue;
    }
    if (field === 'cargoTotals') {
      state.cargoTotals = analyzedValue as ForwarderCargoTotals;
      continue;
    }
    const currentValue = state[field];
    if (!isFilled(currentValue)) {
      Object.assign(state, { [field]: analyzedValue });
    } else if (!areEquivalentTradeFieldValues(field, currentValue, analyzedValue)) {
      const difference = {
        field,
        currentValue,
        analyzedValue,
        sourceFileName: sourceFiles[field] || 'AI 분석 문서',
      };
      const profileDefault = profileDefaults[field];
      const isUntouchedProfileValue = !manuallyEditedFields.has(field)
        && isFilled(profileDefault)
        && String(currentValue).trim() === String(profileDefault).trim();
      if (isUntouchedProfileValue) {
        Object.assign(state, { [field]: analyzedValue });
        profileReplacements.push(difference);
      } else {
        conflicts.push(difference);
      }
    }
  }
  return { state, conflicts, profileReplacements };
}
