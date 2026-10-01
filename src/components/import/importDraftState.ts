import { normalizeImportAnalysisResult } from '../../services/importDocumentAnalysisService';
import {
  arrivalNoticeToAttachment,
  findArrivalNotice,
  hasValidStoragePath,
  importDocumentToAttachment,
  importSnapshotToPersistence,
  tradeAttachmentToImportDocument,
  tradeProfileToFormData,
} from '../../services/tradeDataMapper';
import { loadTradeAttachmentFile, TradeAttachmentDownloadError } from '../../services/tradeAttachmentStorageService';
import type { TradeDraftRow } from '../../services/draftCacheService';
import type {
  ArrivalNoticeMeta,
  CargoTrackingResult,
  ImportAnalysisResult,
  ImportDeliveryRequest,
  ImportDocumentMeta,
  ImportDutyEstimate,
  ImportHSCodeSuggestion,
  ImportRisk,
  UserTradeRole,
} from '../../types/importTrade';
import type { PersistedTradeStatus, TradeProfile } from '../../types';
import type { TradeFormDataV3 } from '../../types/tradeFormData';

export interface ImportFileResolutionFailure {
  documentId: string;
  fileName: string;
  message: string;
  code: string;
  bucket: string;
  maskedStoragePath: string;
  status: string;
}

export class ImportFileResolutionError extends Error {
  readonly failures: ImportFileResolutionFailure[];

  constructor(failures: ImportFileResolutionFailure[]) {
    super('저장된 첨부파일 원본을 불러오지 못했습니다. 파일 정보는 유지됩니다. 해당 파일을 다시 첨부한 뒤 분석해 주세요.');
    this.name = 'ImportFileResolutionError';
    this.failures = failures;
  }
}
export interface CachedState {
  step: number;
  documents: ImportDocumentMeta[];
  analysis: ImportAnalysisResult | null;
  suggestions: ImportHSCodeSuggestion[];
  selectedCode: string;
  duty: ImportDutyEstimate | null;
  dutyError: string;
  risks: ImportRisk[];
  cargo: CargoTrackingResult | null;
  arrivalNotice: ArrivalNoticeMeta | null;
  /** 화주가 입력한 배송 요청 — 제출 시 스냅샷에 실려 포워더에게 전달된다 */
  deliveryRequest?: ImportDeliveryRequest;
  generatedAt: string | null;
  tradeId?: string;
  existingStatus?: PersistedTradeStatus;
  /** 포워더 보완 요청으로 다시 연 거래 — 2단계 상단에 수정 안내 카드를 띄운다 */
  reviseNotice?: { reason: string } | null;
}
export const EMPTY: CachedState = {
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
export function loadCached(key: string): CachedState {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<CachedState> | null;
    if (!parsed) return EMPTY;
    const legacyArrival = parsed.arrivalNotice as (Partial<ArrivalNoticeMeta> & { size?: number }) | null | undefined;
    const arrivalNotice = legacyArrival?.fileName
      ? {
        id: legacyArrival.id ?? crypto.randomUUID(),
        documentType: 'arrival_notice' as const,
        storageBucket: legacyArrival.storageBucket,
        storagePath: legacyArrival.storagePath,
        fileName: legacyArrival.fileName,
        mimeType: legacyArrival.mimeType ?? 'application/octet-stream',
        sizeBytes: legacyArrival.sizeBytes ?? legacyArrival.size ?? 0,
        uploadedAt: legacyArrival.uploadedAt ?? new Date().toISOString(),
      }
      : null;
    return {
      ...EMPTY,
      ...parsed,
      arrivalNotice,
      documents: parsed.documents ?? [],
      analysis: parsed.analysis ? normalizeImportAnalysisResult(parsed.analysis) : null,
      duty: parsed.duty?.status === 'calculated' ? parsed.duty : null,
      dutyError: parsed.duty && parsed.duty.status !== 'calculated'
        ? '기존 예상세액은 환율 환산 근거를 확인할 수 없어 다시 계산해야 합니다.'
        : parsed.dutyError ?? '',
    };
  } catch {
    return EMPTY;
  }
}

function emptyImportProfile(): TradeProfile {
  return {
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
  };
}

export function importDraftFormData(
  state: CachedState,
  role: UserTradeRole,
): TradeFormDataV3 {
  if (state.analysis) {
    const selectedHS = state.suggestions.find((item) =>
      item.code === state.selectedCode
      || state.analysis?.extracted.items.some((entry) => entry.confirmedHSCode === item.code));
    return importSnapshotToPersistence({
      tradeId: state.tradeId,
      direction: 'import',
      role,
      documents: state.documents,
      arrivalNotice: state.arrivalNotice ?? undefined,
      analysis: state.analysis,
      selectedHSCode: selectedHS,
      duty: state.duty ?? undefined,
      risks: state.risks,
      cargo: state.cargo ?? undefined,
      deliveryRequest: state.deliveryRequest,
      generatedAt: state.generatedAt ?? '',
    }).formData;
  }

  const attachments = state.documents
    .map(importDocumentToAttachment)
    .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null);
  const arrivalNotice = arrivalNoticeToAttachment(state.arrivalNotice);
  if (arrivalNotice) attachments.push(arrivalNotice);
  return tradeProfileToFormData(emptyImportProfile(), role, attachments);
}

export function hydrateImportDraft(
  current: CachedState,
  draft: TradeDraftRow | null,
): CachedState {
  if (!draft?.form_data) return current;
  // 이어서 작업할 거래가 이미 로드된 상태에서 서버 초안이 다른(또는 무소속) 거래의
  // 것이면 이전 세션의 잔재이므로 무시한다 — 보완 수정 재개가 1단계로 튕기던 원인.
  if (current.tradeId && draft.trade_id !== current.tradeId) return current;
  const persistedDocuments = draft.form_data.attachments
    .map(tradeAttachmentToImportDocument)
    .filter((document): document is ImportDocumentMeta => document !== null);
  const persistedById = new Map(persistedDocuments.map((document) => [document.id, document]));
  const persistedFingerprint = (document: ImportDocumentMeta) => [
    document.name,
    document.size,
    document.mimeType,
    document.type === 'unknown' ? 'other' : document.type,
  ].join('\u0000');
  const findPersistedDocument = (document: ImportDocumentMeta) => {
    const sameId = persistedById.get(document.id);
    if (sameId) return sameId;

    const fingerprint = persistedFingerprint(document);
    const candidates = [...persistedById.values()]
      .filter((candidate) => persistedFingerprint(candidate) === fingerprint);
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const currentTradeIsAuthoritative = Boolean(
    current.tradeId
    && draft.trade_id
    && current.tradeId === draft.trade_id,
  );
  const documents = current.documents.map((document) => {
    const persisted = findPersistedDocument(document);
    if (!persisted) return document;
    persistedById.delete(persisted.id);
    const useCurrentStorage = currentTradeIsAuthoritative && hasValidStoragePath(document);
    return {
      ...persisted,
      ...document,
      storageBucket: useCurrentStorage ? document.storageBucket : persisted.storageBucket,
      storagePath: useCurrentStorage ? document.storagePath : persisted.storagePath,
      uploadedAt: useCurrentStorage ? document.uploadedAt : persisted.uploadedAt,
    };
  });
  if (!currentTradeIsAuthoritative) documents.push(...persistedById.values());
  return {
    ...current,
    step: currentTradeIsAuthoritative ? current.step : draft.current_step ?? current.step,
    tradeId: draft.trade_id ?? current.tradeId,
    documents,
    arrivalNotice: current.arrivalNotice && hasValidStoragePath(current.arrivalNotice)
      ? current.arrivalNotice
      : findArrivalNotice(draft.form_data),
  };
}

type AttachmentFileLoader = typeof loadTradeAttachmentFile;

export interface ImportFileResolutionResult {
  files: Record<string, File>;
  failures: ImportFileResolutionFailure[];
}

export async function resolveImportAnalysisFiles(
  documents: ImportDocumentMeta[],
  sourceFiles: Record<string, File>,
  loader: AttachmentFileLoader = loadTradeAttachmentFile,
  expectedUserId?: string,
): Promise<ImportFileResolutionResult> {
  const resolved = { ...sourceFiles };
  const outcomes = await Promise.all(documents.map(async (document) => {
    if (resolved[document.id]) return null;
    if (!hasValidStoragePath(document)) {
      return {
        kind: 'failure' as const,
        failure: {
          documentId: document.id,
          fileName: document.name,
          message: '업로드 전 원본 파일을 찾을 수 없습니다.',
          code: 'PENDING_FILE_MISSING',
          bucket: document.storageBucket || 'trade-documents',
          maskedStoragePath: '',
          status: '',
        },
      };
    }
    try {
      const file = await loader({
        storageBucket: document.storageBucket || 'trade-documents',
        storagePath: document.storagePath!,
        fileName: document.name,
        mimeType: document.mimeType,
        documentType: document.type === 'unknown' ? 'other' : document.type,
      }, expectedUserId);
      return { kind: 'success' as const, documentId: document.id, file };
    } catch (error) {
      const downloadError = error instanceof TradeAttachmentDownloadError ? error : null;
      return {
        kind: 'failure' as const,
        failure: {
          documentId: document.id,
          fileName: document.name,
          message: downloadError?.message
            || (error instanceof Error ? error.message : 'Storage download 실패'),
          code: downloadError?.code || 'STORAGE_DOWNLOAD_FAILED',
          bucket: downloadError?.bucket || document.storageBucket || 'trade-documents',
          maskedStoragePath: downloadError?.maskedStoragePath || '<user>/…',
          status: downloadError?.status || '',
        },
      };
    }
  }));

  const failures: ImportFileResolutionFailure[] = [];
  outcomes.forEach((outcome) => {
    if (!outcome) return;
    if (outcome.kind === 'success') resolved[outcome.documentId] = outcome.file;
    else failures.push(outcome.failure);
  });

  return { files: resolved, failures };
}
