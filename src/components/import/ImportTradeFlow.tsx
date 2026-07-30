import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, RefreshCw, Search } from 'lucide-react';
import ImportStepIndicator from './ImportStepIndicator';
import ImportDocumentUploader from './ImportDocumentUploader';
import ImportAnalysisSummary from './ImportAnalysisSummary';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import {
  analyzeImportDocuments,
  normalizeImportAnalysisResult,
  syncLegacyImportFields,
} from '../../services/importDocumentAnalysisService';
import { calculateEstimatedImportDuty } from '../../services/importDutyService';
import { assessImportRisks } from '../../services/importRiskService';
import {
  downloadImportDeclarationRequest,
  generateImportDeclarationHtml,
} from '../../services/importDeclarationService';
import type { ImportDeclarationDownloadFormat } from '../../services/importDeclarationService';
import { lookupImportCargo } from '../../services/cargoProgressService';
import {
  arrivalNoticeToAttachment,
  findArrivalNotice,
  hasValidStoragePath,
  importDocumentToAttachment,
  importSnapshotToPersistence,
  tradeAttachmentToImportDocument,
  tradeProfileToFormData,
} from '../../services/tradeDataMapper';
import {
  loadTradeAttachmentFile,
  moveTradeAttachmentsToScope,
  removeTradeAttachment,
  TradeAttachmentDownloadError,
  uploadTradeAttachment,
} from '../../services/tradeAttachmentStorageService';
import type {
  ArrivalNoticeMeta,
  CargoTrackingResult,
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportDutyEstimate,
  ImportHSCodeSuggestion,
  ImportRisk,
  ImportTradeSnapshot,
  UserTradeRole,
} from '../../types/importTrade';
import type { PersistedTradeStatus, SavedTrade, TradeProfile } from '../../types';
import type { TradeFormDataV3 } from '../../types/tradeFormData';
import type { TradeDraftRow } from '../../services/draftCacheService';
import { saveTradeFormDraft } from '../../services/draftCacheService';
import { useFormDataDraft } from '../../hooks/useFormDataDraft';

interface Props {
  role: UserTradeRole;
  userId: string;
  importerCompanyName?: string;
  onGenerate: (snapshot: ImportTradeSnapshot) => Promise<string>;
  onComplete: (snapshot: ImportTradeSnapshot) => Promise<SavedTrade>;
  onSaved?: (trade: SavedTrade) => void;
  onWorkspaceStateChange?: (state: { currentStep: number; tradeId: string | null }) => void;
}

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
  generatedAt: string | null;
  tradeId?: string;
  existingStatus?: PersistedTradeStatus;
}
const EMPTY: CachedState = {
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
function loadCached(key: string): CachedState {
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
  const persistedDocuments = draft.form_data.attachments
    .map(tradeAttachmentToImportDocument)
    .filter((document): document is ImportDocumentMeta => document !== null);
  const persistedById = new Map(persistedDocuments.map((document) => [document.id, document]));
  const currentTradeIsAuthoritative = Boolean(
    current.tradeId
    && draft.trade_id
    && current.tradeId === draft.trade_id,
  );
  const documents = current.documents.map((document) => {
    const persisted = persistedById.get(document.id);
    if (!persisted) return document;
    persistedById.delete(document.id);
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
  const failures: ImportFileResolutionFailure[] = [];

  for (const document of documents) {
    if (resolved[document.id]) continue;
    if (!hasValidStoragePath(document)) {
      failures.push({
        documentId: document.id,
        fileName: document.name,
        message: '업로드 전 원본 파일을 찾을 수 없습니다.',
        code: 'PENDING_FILE_MISSING',
        bucket: document.storageBucket || 'trade-documents',
        maskedStoragePath: '',
        status: '',
      });
      continue;
    }
    try {
      resolved[document.id] = await loader({
        storageBucket: document.storageBucket || 'trade-documents',
        storagePath: document.storagePath!,
        fileName: document.name,
        mimeType: document.mimeType,
        documentType: document.type === 'unknown' ? 'other' : document.type,
      }, expectedUserId);
    } catch (error) {
      const downloadError = error instanceof TradeAttachmentDownloadError ? error : null;
      failures.push({
        documentId: document.id,
        fileName: document.name,
        message: downloadError?.message
          || (error instanceof Error ? error.message : 'Storage download 실패'),
        code: downloadError?.code || 'STORAGE_DOWNLOAD_FAILED',
        bucket: downloadError?.bucket || document.storageBucket || 'trade-documents',
        maskedStoragePath: downloadError?.maskedStoragePath || '<user>/…',
        status: downloadError?.status || '',
      });
    }
  }

  return { files: resolved, failures };
}

export default function ImportTradeFlow({
  role,
  userId,
  importerCompanyName = '',
  onGenerate,
  onComplete,
  onSaved,
  onWorkspaceStateChange,
}: Props) {
  const cacheKey = `portai_import_draft:${userId}:${role}`;
  const [state, setState] = useState<CachedState>(() => loadCached(cacheKey));
  const [sourceFiles, setSourceFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [showInProgressConfirmation, setShowInProgressConfirmation] = useState(false);
  const skipNextLocalCacheWriteRef = useRef(false);
  const [downloadFormat, setDownloadFormat] = useState<ImportDeclarationDownloadFormat>('pdf');
  const selectedHS = useMemo(() => {
    const firstCode = state.analysis?.extracted.items.find((item) => item.confirmedHSCode)?.confirmedHSCode;
    return state.suggestions.find((item) => item.code === firstCode || item.code === state.selectedCode);
  }, [state.analysis, state.selectedCode, state.suggestions]);
  const draftFormData = useMemo(() => importDraftFormData(state, role), [role, state]);
  const handleDraftRestore = useCallback((draft: TradeDraftRow | null) => {
    setState((current) => hydrateImportDraft(current, draft));
  }, []);
  const {
    isHydrated: isDraftHydrated,
    saveStatus: draftSaveStatus,
    completeDraft,
  } = useFormDataDraft({
    userId,
    enabled: Boolean(userId),
    direction: 'import',
    role,
    formData: draftFormData,
    currentStep: state.step,
    tradeId: state.tradeId ?? null,
    onRestore: handleDraftRestore,
  });

  useEffect(() => {
    onWorkspaceStateChange?.({
      currentStep: state.step,
      tradeId: state.tradeId ?? null,
    });
  }, [onWorkspaceStateChange, state.step, state.tradeId]);

  const persistImportDocuments = async (): Promise<ImportDocumentMeta[]> => {
    const missingFiles = state.documents.filter((document) =>
      !hasValidStoragePath(document) && !sourceFiles[document.id]);
    if (missingFiles.length > 0) {
      throw new Error('새로고침 후 파일 내용은 복원할 수 없습니다. Storage에 저장되지 않은 문서를 다시 첨부해 주세요.');
    }

    const scopeId = state.tradeId ?? `draft-import-${role}`;
    const persisted = [...state.documents];
    for (let index = 0; index < persisted.length; index += 1) {
      const document = persisted[index];
      if (hasValidStoragePath(document)) continue;
      const file = sourceFiles[document.id];
      if (!file) continue;
      const uploaded = await uploadTradeAttachment({
        userId,
        scopeId,
        documentType: document.type === 'unknown' ? 'other' : document.type,
        file,
      });
      persisted[index] = {
        ...document,
        storageBucket: uploaded.storageBucket,
        storagePath: uploaded.storagePath,
        uploadedAt: uploaded.uploadedAt,
      };
      setState((current) => ({ ...current, documents: [...persisted] }));
    }
    return persisted;
  };

  useEffect(() => {
    if (skipNextLocalCacheWriteRef.current) {
      skipNextLocalCacheWriteRef.current = false;
      return;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[Import Draft] localStorage 임시 저장 실패:', error);
    }
  }, [cacheKey, state]);

  const analyze = async () => {
    setMessage('');
    if (!state.documents.length) return setMessage('분석할 파일을 먼저 업로드해 주세요.');
    if (role === 'shipper') {
      const required: ImportDocumentType[] = ['commercial_invoice', 'packing_list', 'bill_of_lading'];
      const missing = required.filter((type) => !state.documents.some((document) => document.type === type));
      if (missing.length) {
        const labels: Record<string, string> = { commercial_invoice: 'C/I', packing_list: 'P/L', bill_of_lading: 'B/L' };
        return setMessage(`필수 기본서류를 첨부해 주세요: ${missing.map((type) => labels[type]).join(', ')}`);
      }
    }
    setBusy(true);
    setState((current) => ({
      ...current,
      documents: current.documents.map((document) => ({ ...document, status: 'analyzing', analysisStatus: 'analyzing', errorMessage: undefined })),
    }));
    try {
      const { files: resolvedFiles, failures } = await resolveImportAnalysisFiles(
        state.documents,
        sourceFiles,
        loadTradeAttachmentFile,
        userId,
      );
      const analyzableDocuments = state.documents.filter(
        (document) => Boolean(resolvedFiles[document.id]),
      );
      if (analyzableDocuments.length === 0) {
        throw new ImportFileResolutionError(failures);
      }
      setSourceFiles(resolvedFiles);
      const result = await analyzeImportDocuments(analyzableDocuments, resolvedFiles);
      const failedIds = new Set(failures.map((failure) => failure.documentId));
      setState((current) => {
        const documents = current.documents.map((document) => {
          if (failedIds.has(document.id)) {
            return {
              ...document,
              status: 'error' as const,
              analysisStatus: 'error' as const,
              analysisSuccess: false,
              errorMessage: '저장된 원본 파일을 불러오지 못했습니다.',
            };
          }
          const classification = result.classifications.find((item) => item.id === document.id);
          return {
            ...document,
            type: classification?.type ?? document.type,
            status: 'analyzed' as const,
            analysisStatus: 'success' as const,
            analysisSuccess: true,
            sourceId: classification?.sourceId || document.sourceId || document.id,
          };
        });
        const suggestions = role === 'shipper' ? result.suggestions : [];
        const analysis: ImportAnalysisResult = {
          ...result.analysis,
          extracted: {
            ...result.analysis.extracted,
            certificateOfOriginAvailable: documents.some((document) => document.type === 'certificate_of_origin'),
          },
        };
        return {
          ...current,
          step: 2,
          documents,
          analysis,
          suggestions,
          selectedCode: '',
          duty: null,
          dutyError: '',
          risks: assessImportRisks(documents, analysis, suggestions, '', importerCompanyName),
        };
      });
      if (failures.length > 0) {
        setMessage(
          `${state.documents.length}개 파일 중 ${failures.length}개를 불러오지 못했습니다. `
          + `나머지 ${analyzableDocuments.length}개 파일로 분석을 계속했습니다.`,
        );
        console.warn('[Import Document Analysis] partial download failure', {
          files: failures.map(({
            fileName, code, status, bucket, maskedStoragePath,
          }) => ({
            fileName,
            code,
            status,
            bucket,
            storagePath: maskedStoragePath,
          })),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '문서 분석에 실패했습니다.';
      const failedIds = new Set(
        error instanceof ImportFileResolutionError
          ? error.failures.map((failure) => failure.documentId)
          : state.documents.map((document) => document.id),
      );
      console.error('[Import Document Analysis] failed', {
        message: errorMessage,
        files: error instanceof ImportFileResolutionError
          ? error.failures.map(({
            fileName, code, status, bucket, maskedStoragePath,
          }) => ({
            fileName,
            code,
            status,
            bucket,
            storagePath: maskedStoragePath,
          }))
          : undefined,
      });
      setState((current) => ({
        ...current,
        documents: current.documents.map((document) => ({
          ...document,
          status: failedIds.has(document.id) ? 'error' : 'ready',
          analysisStatus: failedIds.has(document.id) ? 'error' : 'pending',
          analysisSuccess: failedIds.has(document.id) ? false : document.analysisSuccess,
          errorMessage: failedIds.has(document.id) ? errorMessage : undefined,
        })),
      }));
      setMessage(errorMessage);
    } finally {
      setBusy(false);
    }
  };

  const confirmAndCalculate = async () => {
    if (!state.analysis) return;
    setBusy(true);
    setMessage('');
    let duty: ImportDutyEstimate | null = null;
    let dutyError = '';
    const fields = state.analysis.extracted;
    const missingDescriptions = fields.items.some((item) => !item.description);
    if (!fields.items.length || missingDescriptions) {
      setBusy(false);
      return setMessage('품목정보의 품명은 분석 결과 확정에 필요합니다.');
    }
    try {
      duty = role === 'shipper'
        ? await calculateEstimatedImportDuty({
          items: fields.items,
          invoiceCurrency: fields.currency,
          invoiceAmount: fields.totalAmount,
          invoiceDate: fields.invoiceDate,
          originCountry: fields.items.map((item) => item.originCountry).filter(Boolean).join(', '),
          destinationCountry: fields.destinationCountry,
        })
        : null;
    } catch (error) {
      dutyError = error instanceof Error ? error.message : '예상세액을 계산할 수 없습니다.';
      console.error('[Import Duty] calculation failed', { error, message: dutyError });
    }
    const risks = assessImportRisks(state.documents, state.analysis, state.suggestions, dutyError, importerCompanyName);
    const generatedAt = new Date().toISOString();
    try {
      let persistedDocuments = await persistImportDocuments();
      const generatedSnapshot: ImportTradeSnapshot = {
        tradeId: state.tradeId,
        direction: 'import',
        role,
        documents: persistedDocuments,
        arrivalNotice: state.arrivalNotice ?? undefined,
        analysis: state.analysis,
        selectedHSCode: selectedHS,
        duty: duty ?? undefined,
        risks,
        cargo: state.cargo ?? undefined,
        generatedAt,
      };
      const tradeId = await onGenerate(generatedSnapshot);
      setState((current) => ({ ...current, tradeId }));
      if (!state.tradeId) {
        const originalAttachments = persistedDocuments
          .map(importDocumentToAttachment)
          .filter((attachment): attachment is NonNullable<typeof attachment> => attachment !== null);
        if (originalAttachments.length > 0) {
          const scopedAttachments = await moveTradeAttachmentsToScope({
            userId,
            scopeId: tradeId,
            attachments: originalAttachments,
          });
          const scopedById = new Map(scopedAttachments.map((attachment) => [attachment.id, attachment]));
          persistedDocuments = persistedDocuments.map((document) => {
            const attachment = scopedById.get(document.id);
            return attachment ? {
              ...document,
              storageBucket: attachment.storageBucket,
              storagePath: attachment.storagePath,
              uploadedAt: attachment.uploadedAt,
              uploadStatus: 'uploaded',
            } : document;
          });
          await onGenerate({
            ...generatedSnapshot,
            tradeId,
            documents: persistedDocuments,
          });
        }
      }
      const nextState: CachedState = {
        ...state,
        documents: persistedDocuments,
        step: 3,
        duty,
        dutyError,
        risks,
        generatedAt,
        tradeId,
        existingStatus: 'generated',
      };
      setState(nextState);
      await saveTradeFormDraft({
        userId,
        direction: 'import',
        role,
        formData: importDraftFormData(nextState, role),
        currentStep: nextState.step,
        tradeId,
      });
      setMessage(dutyError ? `${dutyError} 사유를 표시한 상태로 다음 단계로 이동했습니다.` : '');
    } catch (error) {
      console.error('[Import Trade] generated 상태 저장 실패:', error);
      setMessage(error instanceof Error
        ? error.message
        : '확인 결과를 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const updateConfirmedHS = (itemId: string, code: string) => setState((current) => {
    if (!current.analysis) return current;
    return {
      ...current,
      selectedCode: code,
      analysis: {
        ...current.analysis,
        extracted: syncLegacyImportFields({
          ...current.analysis.extracted,
          items: current.analysis.extracted.items.map((item) => item.id === itemId ? { ...item, confirmedHSCode: code } : item),
        }),
      },
    };
  });

  const lookupCargo = async () => {
    if (!state.analysis?.extracted.blNo) return setMessage('B/L 번호를 입력해 주세요.');
    setBusy(true);
    try {
      const cargo = await lookupImportCargo(state.analysis.extracted.blNo);
      setState((current) => ({ ...current, cargo }));
    } catch (error) {
      console.error(error);
      setMessage('통관 진행 정보를 조회하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!state.analysis || busy) return;
    if (!state.generatedAt) return setMessage('수입신고 의뢰서를 먼저 생성해 주세요.');
    const unresolvedHigh = state.risks.filter((risk) => risk.level === 'high' && risk.status !== 'resolved');
    if (unresolvedHigh.length && !window.confirm(`미해결 HIGH 리스크가 ${unresolvedHigh.length}건 있습니다. 내용을 확인했으며 계속 진행할까요?`)) return;
    if (state.dutyError && !window.confirm(`예상세액이 계산되지 않았습니다.\n${state.dutyError}\n사유를 확인했으며 계속 진행할까요?`)) return;
    if (role === 'forwarder' && !hasValidStoragePath(state.arrivalNotice)) {
      setShowInProgressConfirmation(true);
      return;
    }
    if (!window.confirm('수입 거래를 최종 제출할까요?')) return;
    await persistCompletedTrade();
  };

  const persistCompletedTrade = async () => {
    if (!state.analysis || busy || !state.generatedAt) return;
    setShowInProgressConfirmation(false);
    setBusy(true);
    let tradeSaved = false;
    try {
      const completedTrade = await onComplete({
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
        generatedAt: state.generatedAt,
        flowCompletedAt: new Date().toISOString(),
      });
      tradeSaved = true;
      await completeDraft();
      skipNextLocalCacheWriteRef.current = true;
      localStorage.removeItem(cacheKey);
      setState(EMPTY);
      setSourceFiles({});
      setMessage('');
      onWorkspaceStateChange?.({ currentStep: 1, tradeId: null });
      onSaved?.(completedTrade);
    } catch (error) {
      console.error(error);
      setMessage(tradeSaved
        ? '거래는 저장했지만 작업실 초안을 정리하지 못했습니다. 입력 상태를 유지합니다.'
        : '거래 저장에 실패했습니다. 입력과 첨부는 유지됩니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (!window.confirm('현재 수입 거래의 단계와 분석 결과를 모두 초기화할까요?')) return;
    skipNextLocalCacheWriteRef.current = true;
    localStorage.removeItem(cacheKey);
    setState(EMPTY);
    setSourceFiles({});
    setMessage('');
  };
  const declarationData = state.analysis ? {
    fields: state.analysis.extracted,
    duty: state.duty ?? undefined,
    dutyError: state.dutyError,
    risks: state.risks,
  } : null;

  return (
    <div className="import-flow">
      <div className="import-flow-header">
        <div>
          <h2>수입 {role === 'shipper' ? '화주' : '포워더'} 업무</h2>
          <p>{role === 'shipper' ? '해외 수출자가 보낸 해상 서류를 AI로 분석한 뒤 확인·수정합니다.' : '화주 또는 수출지 포워더에게 받은 서류를 저장하고 통관 진행을 추적합니다.'}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reset}><RefreshCw size={15} /> 단계 초기화</button>
      </div>
      <ImportStepIndicator
        current={state.step}
        labels={role === 'shipper' ? ['서류 업로드·AI 분석', '분석 결과·HS 확정', '세액·의뢰서·리스크'] : ['서류 업로드', '서류 확인', '통관 처리']}
        onMove={(step) => setState((current) => ({ ...current, step }))}
      />
      {message && <div className={`form-message ${state.dutyError && state.step === 3 ? 'warning' : 'error'}`} role="alert">{message}</div>}
      {!isDraftHydrated && <div className="draft-save-status saving" role="status">초안 복원 중...</div>}
      {draftSaveStatus === 'error' && <div className="form-message error" role="alert">초안 자동 저장에 실패했습니다.</div>}
      {showInProgressConfirmation && (
        <div className="confirmation-backdrop" role="presentation">
          <section className="confirmation-dialog" role="dialog" aria-modal="true" aria-labelledby="in-progress-title">
            <h3 id="in-progress-title">진행 중 상태로 저장할까요?</h3>
            <p>D/O 또는 도착통지서가 아직 첨부되지 않았습니다. 현재 입력 내용을 진행 중 거래로 저장하고 거래관리로 이동합니다. 이후 거래관리에서 이어서 작성할 수 있습니다.</p>
            <div className="confirmation-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowInProgressConfirmation(false)}>취소</button>
              <button type="button" className="btn btn-primary" onClick={() => void persistCompletedTrade()}>진행 중으로 저장</button>
            </div>
          </section>
        </div>
      )}

      {state.step === 1 && (
        <>
          <ImportDocumentUploader
            structured={role === 'shipper'}
            documents={state.documents}
            onChange={(documents) => setState((current) => ({ ...current, documents }))}
            onFilesAdded={(entries) => setSourceFiles((current) => {
              const next = { ...current };
              entries.forEach(({ id, file }) => { next[id] = file; });
              return next;
            })}
            onFileRemoved={async (document) => {
              if (document.storageBucket && document.storagePath) {
                await removeTradeAttachment({
                  storageBucket: document.storageBucket,
                  storagePath: document.storagePath,
                });
              }
              setSourceFiles((current) => {
              const next = { ...current };
              delete next[document.id];
              return next;
              });
            }}
            description={role === 'shipper'
              ? '해외 수출업자에게 받은 C/I, P/L, B/L, C/O 및 기타서류를 한 번에 업로드해 주세요.'
              : 'B/L, C/I, P/L 사본을 업로드해 주세요.'}
          />
          <div className="import-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void analyze()}>{busy ? 'AI 분석 중…' : 'AI 분석 실행'}</button></div>
        </>
      )}

      {state.step === 2 && state.analysis && (
        <>
          <ImportAnalysisSummary
            analysis={state.analysis}
            importerCompanyName={role === 'shipper' ? importerCompanyName : undefined}
            hasCertificateOfOriginDocument={state.documents.some((document) => document.type === 'certificate_of_origin')}
            onChange={(extracted) => setState((current) => ({
              ...current,
              analysis: current.analysis ? { ...current.analysis, extracted } : null,
              duty: null,
              dutyError: '',
            }))}
          />
          {role === 'forwarder' ? <ImportDocumentComparison rows={state.analysis.comparison} /> : (
            <section className="form-card import-card">
              <div className="import-card-heading">
                <div><span className="ai-badge">수입국 기준 추천</span><h2>G. 품목별 HS Code 추천 및 확정</h2></div>
                <p>문서 추출값과 AI 추천값은 구분됩니다. 사용자가 선택하거나 직접 입력한 값만 최종값입니다.</p>
              </div>
              {state.analysis.extracted.items.map((item, index) => {
                const candidates = state.suggestions.filter((suggestion) => !suggestion.itemId || suggestion.itemId === item.id);
                return (
                  <div className="import-hs-item" key={item.id}>
                    <h3>품목 {index + 1}: {item.description || '품명 미확인'}</h3>
                    <div className="import-field-grid">
                      <label className="form-group"><span className="form-label">문서에서 추출한 HS Code</span><input className="form-input" readOnly value={item.documentHSCode} placeholder="첨부문서에서 확인되지 않음" /></label>
                      <label className="form-group"><span className="form-label">사용자가 확정한 HS Code</span><input className="form-input user-editable" value={item.confirmedHSCode} onChange={(event) => updateConfirmedHS(item.id, event.target.value)} placeholder="후보 선택 또는 직접 입력" /></label>
                    </div>
                    {item.documentHSCode && <button type="button" className="btn btn-secondary" onClick={() => updateConfirmedHS(item.id, item.documentHSCode)}>문서값을 최종 확정</button>}
                    <div className="hs-suggestion-list">
                      {candidates.length === 0 ? <p className="import-empty">추천 근거가 부족하거나 후보가 없습니다. 직접 확인해 주세요.</p> : candidates.map((suggestion) => (
                        <label key={`${item.id}-${suggestion.code}`} className={`hs-suggestion ${item.confirmedHSCode === suggestion.code ? 'selected' : ''}`}>
                          <input type="radio" name={`import-hs-${item.id}`} checked={item.confirmedHSCode === suggestion.code} onChange={() => updateConfirmedHS(item.id, suggestion.code)} />
                          <span>
                            <strong>{suggestion.code} · {suggestion.description}</strong>
                            <small>{suggestion.reasoning} · 신뢰도 {Math.round(suggestion.confidence * 100)}%</small>
                            {!!suggestion.missingInformation?.length && <small>추가 확인: {suggestion.missingInformation.join(', ')}</small>}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          <div className="import-actions">
            <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 1 }))}>이전</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void confirmAndCalculate()}>
              {role === 'shipper' ? '분석 결과 확인 및 예상세액 계산' : '확인 및 다음 단계'}
            </button>
          </div>
        </>
      )}

      {state.step === 3 && state.analysis && role === 'shipper' && declarationData && (
        <>
          <DutySummary duty={state.duty} error={state.dutyError} />
          <section className="form-card import-card">
            <div className="import-card-heading"><div><h2>수입신고 의뢰서</h2></div><p>확정된 입력값과 예상세액 상태를 사용한 공식 신고 전 검토자료입니다.</p></div>
            <div className="document-preview-actions">
              <button className="btn btn-secondary" onClick={() => setPreview((value) => !value)}><Eye size={17} /> 보기</button>
              <label className="document-format-select">
                <select
                  className="form-input"
                  aria-label="다운로드 파일 형식"
                  value={downloadFormat}
                  onChange={(event) => setDownloadFormat(event.target.value as ImportDeclarationDownloadFormat)}
                >
                  <option value="pdf">PDF (.pdf)</option>
                  <option value="docx">Word (.docx)</option>
                </select>
              </label>
              <button className="btn btn-primary" onClick={() => void downloadImportDeclarationRequest(declarationData, downloadFormat)}>
                <Download size={17} /> 선택 형식 다운로드
              </button>
            </div>
            {preview && <div className="declaration-preview" dangerouslySetInnerHTML={{ __html: generateImportDeclarationHtml(declarationData) }} />}
          </section>
          <RiskSummary
            risks={state.risks}
            onToggle={(id) => setState((current) => ({
              ...current,
              risks: current.risks.map((risk) => risk.id === id ? { ...risk, status: risk.status === 'resolved' ? 'unresolved' : 'resolved' } : risk),
            }))}
          />
          <div className="import-actions">
            <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void complete()}>{busy ? '완료 처리 중…' : '완료'}</button>
          </div>
        </>
      )}

      {state.step === 3 && state.analysis && role === 'forwarder' && (
        <>
          <section className="form-card import-card">
            <div className="import-card-heading"><div><h2>통관 진행 현황</h2></div></div>
            <div className="cargo-query">
              <label className="form-group"><span className="form-label">M/H B/L 번호</span><input className="form-input" value={state.analysis.extracted.blNo} readOnly /></label>
              <button className="btn btn-primary" disabled={busy} onClick={() => void lookupCargo()}><Search size={16} /> 조회</button>
            </div>
            {state.cargo && <p className="cargo-status-text"><strong>{state.cargo.status}</strong> · {state.cargo.detail}</p>}
          </section>
          <ArrivalNoticeUploader
            value={state.arrivalNotice}
            onChange={(arrivalNotice) => setState((current) => ({ ...current, arrivalNotice }))}
            userId={userId}
            tradeId={state.tradeId}
          />
          <RiskSummary risks={state.risks} />
          <div className="import-actions"><button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button><button className="btn btn-primary" disabled={busy || state.existingStatus === 'submitted'} onClick={() => void complete()}>{state.existingStatus === 'submitted' ? '제출 완료' : hasValidStoragePath(state.arrivalNotice) ? '완료 및 제출' : '진행 중으로 저장'}</button></div>
        </>
      )}
    </div>
  );
}

function DutySummary({ duty, error }: { duty: ImportDutyEstimate | null; error: string }) {
  if (!duty) return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>예상 관세액</h2></div><span className="source-badge">계산 불가</span></div>
      <div className="form-message warning">{error || '계산에 필요한 값을 확인해 주세요.'}</div>
      <p className="import-notice">샘플 환율·임의 관세율·0원 값을 사용하지 않았습니다.</p>
    </section>
  );
  const krw = (value: number | null) => value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`;
  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>예상 관세액</h2></div><span className="source-badge">API</span></div>
      <dl className="duty-grid">
        <div><dt>Invoice 통화</dt><dd>{duty.invoiceCurrency}</dd></div>
        <div><dt>Invoice 금액</dt><dd>{duty.invoiceAmount.toLocaleString()}</dd></div>
        <div><dt>적용 환율</dt><dd>{duty.exchangeRate.toLocaleString()}원</dd></div>
        <div><dt>환율 기준일</dt><dd>{duty.exchangeRateDate}</dd></div>
        <div><dt>원화 환산금액</dt><dd>{krw(duty.convertedInvoiceKrw)}</dd></div>
        <div><dt>예상 과세가격</dt><dd>{krw(duty.customsValue)}</dd></div>
        <div><dt>기본 관세율</dt><dd>{duty.basicRate}%</dd></div>
        <div><dt>FTA 협정</dt><dd>{duty.ftaAgreement}</dd></div>
        <div><dt>FTA 세율</dt><dd>{duty.ftaRate == null ? '확인 필요' : `${duty.ftaRate}%`}</dd></div>
        <div><dt>예상 관세</dt><dd>{krw(duty.basicDuty)}</dd></div>
        <div><dt>부가가치세</dt><dd>{krw(duty.vat)}</dd></div>
        <div><dt>기타 세금</dt><dd>{krw(duty.otherTaxes)}</dd></div>
        <div><dt>총 예상세액</dt><dd>{krw(duty.totalTax)}</dd></div>
        <div><dt>예상 절감액</dt><dd>{krw(duty.estimatedSavings)}</dd></div>
      </dl>
      <p className="import-notice">FTA 협정세율은 원산지증명서와 적용 요건 확인 전에는 적용하지 않습니다.</p>
    </section>
  );
}

function RiskSummary({ risks, onToggle }: { risks: ImportRisk[]; onToggle?: (id: string) => void }) {
  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>종합 리스크</h2></div></div>
      <div className="risk-list">
        {risks.map((risk) => (
          <article key={risk.id} className={`risk-item ${risk.level}`}>
            <span>{risk.level.toUpperCase()}</span>
            <div>
              <strong>{risk.item}</strong>
              <p>{risk.cause}</p>
              {!!risk.relatedDocuments.length && <small>출처: {risk.relatedDocuments.join(', ')}</small>}
              {!!risk.differentValues?.length && <small>서로 다른 값: {risk.differentValues.join(' / ')}</small>}
              <small>해결 방법: {risk.recommendation}</small>
              <small>해결 여부: {risk.status === 'resolved' ? '확인 완료' : '미확인'}</small>
            </div>
            {onToggle && <button type="button" className="btn btn-secondary" onClick={() => onToggle(risk.id)}>{risk.status === 'resolved' ? '미확인으로 변경' : '확인 완료'}</button>}
          </article>
        ))}
      </div>
      <p className="import-notice">자동 분석 결과는 참고정보이며 최종 법률·통관 판단이 아닙니다.</p>
    </section>
  );
}
