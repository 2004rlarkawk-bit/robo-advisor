import type { ForwarderFormState } from '../utils/forwarderForm';
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

export interface ForwarderAnalysisFailure {
  attachmentId: string;
  fileName: string;
  message: string;
}

export interface ForwarderDocumentConflict {
  field: keyof ForwarderFormState;
  currentValue: ForwarderFormState[keyof ForwarderFormState];
  analyzedValue: ForwarderFormState[keyof ForwarderFormState];
  sourceFileName: string;
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

function text(value: string | undefined): string {
  return value?.trim() ?? '';
}

function numberValue(value: string): number | '' {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return '';
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : '';
}

export function mapExtractedFieldsToForwarderForm(
  fields: ImportExtractedFields,
): Partial<ForwarderFormState> {
  const firstItem = fields.items[0];
  const consignee = fields.consigneeDetails.name
    ? fields.consigneeDetails
    : fields.importerDetails;
  return {
    companyName: text(fields.exporterDetails.name || fields.shipper),
    companyAddress: text(fields.exporterDetails.address),
    partnerName: text(consignee.name || fields.consignee || fields.importer),
    partnerAddress: text(consignee.address),
    vesselOrFlight: text(fields.vesselName),
    voyageNo: text(fields.voyageNo),
    loadPort: text(fields.loadPort),
    dischargePort: text(fields.dischargePort),
    departureDate: text(fields.shipmentDate),
    arrivalDate: text(fields.estimatedArrivalDate),
    notifyPartyName: text(fields.notifyPartyDetails.name || fields.notifyParty),
    containerNo: text(fields.containerNumbers.join(', ') || fields.containerNo),
    sealNo: text(fields.sealNumbers.join(', ') || fields.sealNo),
    itemName: text(firstItem?.description || fields.productDescription),
    packageCount: numberValue(fields.totalPackageCount),
    packageType: text(fields.packageUnit || firstItem?.quantityUnit),
    grossWeight: numberValue(fields.grossWeight),
  };
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
  const documentConflicts: ForwarderDocumentConflict[] = [];
  const failures: ForwarderAnalysisFailure[] = [];

  for (const attachment of attachments) {
    try {
      const file = pendingFiles[attachment.id]
        ?? await dependencies.loadFile(attachment, expectedUserId);
      const document = importDocument(attachment);
      const result = await dependencies.analyze([document], { [attachment.id]: file });
      const mapped = mapExtractedFieldsToForwarderForm(result.analysis.extracted);
      const classified = result.classifications.find(({ id }) => id === attachment.id)?.type;
      if (classified && classified !== 'unknown') {
        classifications[attachment.id] = classified;
      }
      for (const [field, analyzedValue] of Object.entries(mapped) as Array<
        [keyof ForwarderFormState, ForwarderFormState[keyof ForwarderFormState]]
      >) {
        if (!isFilled(analyzedValue)) continue;
        const currentValue = values[field] as ForwarderFormState[keyof ForwarderFormState] | undefined;
        if (!isFilled(currentValue)) {
          Object.assign(values, { [field]: analyzedValue });
          sourceFiles[field] = attachment.fileName;
        } else if (String(currentValue).trim() !== String(analyzedValue).trim()) {
          documentConflicts.push({
            field,
            currentValue: currentValue!,
            analyzedValue,
            sourceFileName: attachment.fileName,
          });
        }
      }
    } catch (error) {
      failures.push({
        attachmentId: attachment.id,
        fileName: attachment.fileName,
        message: error instanceof Error ? error.message : '문서 분석에 실패했습니다.',
      });
    }
  }

  return { values, classifications, sourceFiles, documentConflicts, failures };
}

export function mergeForwarderAutoFill(
  current: ForwarderFormState,
  analyzed: Partial<ForwarderFormState>,
  sourceFiles: Record<string, string> = {},
): { state: ForwarderFormState; conflicts: ForwarderDocumentConflict[] } {
  const state = { ...current };
  const conflicts: ForwarderDocumentConflict[] = [];
  for (const [field, analyzedValue] of Object.entries(analyzed) as Array<
    [keyof ForwarderFormState, ForwarderFormState[keyof ForwarderFormState]]
  >) {
    if (!isFilled(analyzedValue)) continue;
    const currentValue = state[field];
    if (!isFilled(currentValue)) {
      Object.assign(state, { [field]: analyzedValue });
    } else if (String(currentValue).trim() !== String(analyzedValue).trim()) {
      conflicts.push({
        field,
        currentValue,
        analyzedValue,
        sourceFileName: sourceFiles[field] || 'AI 분석 문서',
      });
    }
  }
  return { state, conflicts };
}
