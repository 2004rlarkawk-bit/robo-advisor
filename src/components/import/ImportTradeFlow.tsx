import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Eye, FileText, OctagonAlert, RefreshCw, Search, Terminal } from 'lucide-react';
import ImportStepIndicator from './ImportStepIndicator';
import ImportDocumentUploader from './ImportDocumentUploader';
import ImportAnalysisSummary from './ImportAnalysisSummary';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import {
  analyzeImportDocuments,
  IMPORT_DOCUMENT_TYPE_LABELS,
  normalizeImportAnalysisResult,
  syncLegacyImportFields,
} from '../../services/importDocumentAnalysisService';
import { calculateEstimatedImportDuty } from '../../services/importDutyService';
import {
  recommendImportHSKForItems,
  validateOfficialImportHSK,
} from '../../services/importHSCodeSuggestionService';
import { resolveImportRisks } from '../../services/importRiskService';
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
import { deleteTradeDraft, isSubmittedTradeDraft, saveTradeFormDraft } from '../../services/draftCacheService';
import { useFormDataDraft } from '../../hooks/useFormDataDraft';
import DocumentManagerReadOnlyAction from '../DocumentManagerReadOnlyAction';

interface Props {
  role: UserTradeRole;
  userId: string;
  importerCompanyName?: string;
  onGenerate: (snapshot: ImportTradeSnapshot) => Promise<string>;
  onComplete: (snapshot: ImportTradeSnapshot) => Promise<SavedTrade>;
  onSaved?: (trade: SavedTrade) => void;
  onWorkspaceStateChange?: (state: { currentStep: number; tradeId: string | null }) => void;
  readOnly?: boolean;
  onClose?: () => void;
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

export default function ImportTradeFlow({
  role,
  userId,
  importerCompanyName = '',
  onGenerate,
  onComplete,
  onSaved,
  onWorkspaceStateChange,
  readOnly = false,
  onClose,
}: Props) {
  const cacheKey = `portai_import_draft:${userId}:${role}`;
  const [state, setState] = useState<CachedState>(() => loadCached(cacheKey));
  const [sourceFiles, setSourceFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  // 수출 흐름의 Pipeline Runner 콘솔과 같은 형태로 수입 AI 분석 진행을 보여준다.
  const [analysisLogs, setAnalysisLogs] = useState<{ time: string; agent: string; message: string; level: 'info' | 'success' }[]>([]);
  const [showAnalysisConsole, setShowAnalysisConsole] = useState(false);
  const analysisTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisLogEndRef = useRef<HTMLDivElement | null>(null);

  const pushAnalysisLog = useCallback((agent: string, message: string, level: 'info' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    setAnalysisLogs((current) => [...current, { time, agent, message, level }]);
  }, []);

  useEffect(() => {
    analysisLogEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [analysisLogs]);

  useEffect(() => () => {
    if (analysisTickerRef.current) clearInterval(analysisTickerRef.current);
  }, []);

  // 단계 전환 시 스크롤이 하단에 남지 않도록 항상 페이지 맨 위에서 시작
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.step]);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [showInProgressConfirmation, setShowInProgressConfirmation] = useState(false);
  const [manualHsInputs, setManualHsInputs] = useState<Record<string, string>>({});
  const [manualHsErrors, setManualHsErrors] = useState<Record<string, string>>({});
  const [validatingHsItemId, setValidatingHsItemId] = useState<string | null>(null);
  const skipNextLocalCacheWriteRef = useRef(false);
  const onWorkspaceStateChangeRef = useRef(onWorkspaceStateChange);
  onWorkspaceStateChangeRef.current = onWorkspaceStateChange;
  const [downloadFormat, setDownloadFormat] = useState<ImportDeclarationDownloadFormat>('pdf');
  const canBrowseReadOnlyResultSteps = readOnly;
  const moveToReadOnlyResultStep = (step: number) => {
    if (!canBrowseReadOnlyResultSteps || (step !== 2 && step !== 3)) return;
    setState((current) => ({ ...current, step }));
  };
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
    enabled: Boolean(userId) && !readOnly,
    direction: 'import',
    role,
    formData: draftFormData,
    currentStep: state.step,
    tradeId: state.tradeId ?? null,
    onRestore: handleDraftRestore,
  });

  // 브라우저가 거래 row 저장 직후 종료되는 등 local cache가 남아도 submitted 거래는 복원하지 않는다.
  useEffect(() => {
    if (readOnly || !state.tradeId) return;
    let cancelled = false;
    void isSubmittedTradeDraft(userId, state.tradeId)
      .then(async (submitted) => {
        if (!submitted || cancelled) return;
        try {
          await deleteTradeDraft(userId, 'import', role);
        } catch (error) {
          console.warn('[Import Draft] 제출 완료 거래의 stale DB 초안 정리 실패:', error);
        }
        if (cancelled) return;
        skipNextLocalCacheWriteRef.current = true;
        localStorage.removeItem(cacheKey);
        setState(EMPTY);
        setSourceFiles({});
        setMessage('');
        onWorkspaceStateChangeRef.current?.({ currentStep: 1, tradeId: null });
      })
      .catch((error) => console.warn('[Import Draft] 제출 상태 확인 실패:', error));
    return () => { cancelled = true; };
  }, [cacheKey, readOnly, role, state.tradeId, userId]);

  useEffect(() => {
    if (readOnly) return;
    onWorkspaceStateChange?.({
      currentStep: state.step,
      tradeId: state.tradeId ?? null,
    });
  }, [onWorkspaceStateChange, readOnly, state.step, state.tradeId]);

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
    if (readOnly) return;
    if (skipNextLocalCacheWriteRef.current) {
      skipNextLocalCacheWriteRef.current = false;
      return;
    }
    try {
      localStorage.setItem(cacheKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[Import Draft] localStorage 임시 저장 실패:', error);
    }
  }, [cacheKey, readOnly, state]);

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
    setAnalysisLogs([]);
    setShowAnalysisConsole(true);
    pushAnalysisLog('Orchestrator Agent', `수입 문서 분석 파이프라인 가동 시작... (문서 ${state.documents.length}건)`);
    state.documents.forEach((document) => {
      pushAnalysisLog('Document Agent', `"${document.name}" (${IMPORT_DOCUMENT_TYPE_LABELS[document.type]}) 분석 대기열 등록`);
    });
    if (import.meta.env.DEV) {
      console.debug('[Import Document Analysis] attachment resolution', state.documents.map((document) => ({
        id: `${document.id.slice(0, 6)}…`,
        fileName: document.name,
        hasPendingFile: Boolean(sourceFiles[document.id]),
        hasStoragePath: hasValidStoragePath(document),
        documentType: document.type,
      })));
    }
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
      pushAnalysisLog('Document Agent', `파일 ${analyzableDocuments.length}건 로드 완료 — 텍스트 추출 시작`, 'success');
      {
        const stages = [
          '문서 텍스트 추출 중...',
          '핵심 필드 매핑 중 (Invoice · B/L · P/L)...',
          '문서 간 값 대조·불일치 점검 중...',
          '분석 결과 정규화 중...',
        ];
        let stageIndex = 0;
        if (analysisTickerRef.current) clearInterval(analysisTickerRef.current);
        analysisTickerRef.current = setInterval(() => {
          if (stageIndex < stages.length) pushAnalysisLog('Analysis Agent', stages[stageIndex++]);
        }, 1100);
      }
      const result = await analyzeImportDocuments(analyzableDocuments, resolvedFiles);
      if (analysisTickerRef.current) { clearInterval(analysisTickerRef.current); analysisTickerRef.current = null; }
      pushAnalysisLog('Orchestrator Agent', '분석 완료 — 추출값을 분석 결과 폼에 반영했습니다.', 'success');
      setTimeout(() => setShowAnalysisConsole(false), 900);
      const failedIds = new Set(failures.map((failure) => failure.documentId));
      const documents = state.documents.map((document) => {
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
      const analysis: ImportAnalysisResult = {
        ...result.analysis,
        extracted: {
          ...result.analysis.extracted,
          certificateOfOriginAvailable: documents.some((document) => document.type === 'certificate_of_origin'),
        },
      };
      const suggestions = role === 'shipper'
        ? await recommendImportHSKForItems(analysis.extracted.items)
        : [];
      setManualHsInputs({});
      setManualHsErrors({});
      setState((current) => {
        return {
          ...current,
          step: 2,
          documents,
          analysis,
          suggestions,
          selectedCode: '',
          duty: null,
          dutyError: '',
          risks: resolveImportRisks(documents, analysis, suggestions, '', importerCompanyName),
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
      if (analysisTickerRef.current) { clearInterval(analysisTickerRef.current); analysisTickerRef.current = null; }
      pushAnalysisLog('Orchestrator Agent', '분석 실패 — 오류 내용을 확인해 주세요.');
      setTimeout(() => setShowAnalysisConsole(false), 900);
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
    if (role === 'shipper') {
      const validations = await Promise.all(
        fields.items.map((item) => validateOfficialImportHSK(item.confirmedHSCode)),
      );
      if (validations.some(({ valid }) => !valid)) {
        setBusy(false);
        return setMessage('모든 품목의 대한민국 HSK 10자리 코드를 공식 후보에서 선택하거나 직접 입력해 확정해 주세요.');
      }
    }
    // 세액·의뢰서·리스크 산출도 Pipeline Runner 콘솔로 진행 상황을 보여준다.
    setAnalysisLogs([]);
    setShowAnalysisConsole(true);
    pushAnalysisLog('Orchestrator Agent', '세액·의뢰서·리스크 산출 파이프라인 가동 시작...');
    pushAnalysisLog('HSCode Agent', `품목 ${fields.items.length}건 HSK 코드 확정값 검증 완료`, 'success');
    {
      const stages = [
        '관세율 조회 · 예상세액 계산 중...',
        '운송의뢰서 초안 구성 중...',
        '리스크 점검 중 (서류 누락 · 값 불일치)...',
        '결과 저장 · 정리 중...',
      ];
      let stageIndex = 0;
      if (analysisTickerRef.current) clearInterval(analysisTickerRef.current);
      analysisTickerRef.current = setInterval(() => {
        if (stageIndex < stages.length) pushAnalysisLog('Duty Agent', stages[stageIndex++]);
      }, 1000);
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
    const riskStatusById = new Map(state.risks.map((risk) => [risk.id, risk.status]));
    const risks = resolveImportRisks(state.documents, state.analysis, state.suggestions, dutyError, importerCompanyName)
      .map((risk) => ({ ...risk, status: riskStatusById.get(risk.id) ?? risk.status }));
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
      if (analysisTickerRef.current) { clearInterval(analysisTickerRef.current); analysisTickerRef.current = null; }
      // 자동 닫힘 없음 — 사용자가 [콘솔 닫기]를 눌러야 결과 페이지가 보인다.
      pushAnalysisLog('Orchestrator Agent', '산출 완료 — [콘솔 닫기]를 누르면 결과 페이지로 이동합니다.', 'success');
    } catch (error) {
      console.error('[Import Trade] generated 상태 저장 실패:', error);
      setMessage(error instanceof Error
        ? error.message
        : '확인 결과를 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
      if (analysisTickerRef.current) { clearInterval(analysisTickerRef.current); analysisTickerRef.current = null; }
      pushAnalysisLog('Orchestrator Agent', '산출 실패 — 오류 내용을 확인해 주세요.');
      setTimeout(() => setShowAnalysisConsole(false), 800);
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

  const selectRecommendedHS = (itemId: string, code: string) => {
    setManualHsInputs((current) => ({ ...current, [itemId]: code }));
    setManualHsErrors((current) => ({ ...current, [itemId]: '' }));
    updateConfirmedHS(itemId, code);
  };

  const confirmManualHS = async (itemId: string, currentCode: string) => {
    setValidatingHsItemId(itemId);
    const result = await validateOfficialImportHSK(currentCode);
    setValidatingHsItemId(null);
    if (!result.valid) {
      setManualHsErrors((current) => ({ ...current, [itemId]: result.error }));
      return;
    }
    setManualHsInputs((current) => ({ ...current, [itemId]: result.normalizedCode }));
    setManualHsErrors((current) => ({ ...current, [itemId]: '' }));
    updateConfirmedHS(itemId, result.normalizedCode);
  };

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
    if (readOnly) return;
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
    if (readOnly) return;
    if (!state.analysis || busy || !state.generatedAt) return;
    setShowInProgressConfirmation(false);
    setBusy(true);
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
      // 거래 row 저장 성공 이후에만 작성 상태를 정리한다. DB draft 삭제 실패는 제출 거래 복원을
      // 허용하는 이유가 될 수 없으므로 기록만 남기고 local/React/workspace 초기화는 계속한다.
      try {
        await completeDraft();
      } catch (error) {
        console.warn('[Import Draft] 제출 후 DB 초안 정리 실패:', error);
      }
      skipNextLocalCacheWriteRef.current = true;
      localStorage.removeItem(cacheKey);
      setState(EMPTY);
      setSourceFiles({});
      setMessage('');
      onWorkspaceStateChange?.({ currentStep: 1, tradeId: null });
      onSaved?.(completedTrade);
    } catch (error) {
      console.error(error);
      setMessage('거래 저장에 실패했습니다. 입력과 첨부는 유지됩니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');
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
  // 리스크는 수정 가능한 2단계(분석 결과)에서 바로 보여야 하므로,
  // 사용자가 값을 고칠 때마다 현재 입력값 기준으로 다시 계산한다.
  const liveRisks = useMemo(() => {
    if (!state.analysis) return [];
    const statusById = new Map(state.risks.map((risk) => [risk.id, risk.status]));
    return resolveImportRisks(state.documents, state.analysis, state.suggestions, state.dutyError, importerCompanyName)
      .map((risk) => ({ ...risk, status: statusById.get(risk.id) ?? risk.status }));
  }, [state.analysis, state.documents, state.suggestions, state.dutyError, state.risks, importerCompanyName]);

  // 재계산으로 목록이 바뀌어도 '확인 완료' 표시가 유실되지 않도록 파생 목록을 그대로 저장한다.
  const toggleRisk = (id: string) => setState((current) => ({
    ...current,
    risks: liveRisks.map((risk) => (risk.id === id
      ? { ...risk, status: risk.status === 'resolved' ? 'unresolved' : 'resolved' }
      : risk)),
  }));

  const declarationData = state.analysis ? {
    fields: state.analysis.extracted,
    duty: state.duty ?? undefined,
    dutyError: state.dutyError,
    risks: state.risks,
  } : null;

  return (
    <div className="import-flow">
      {/* 소개 헤더(제목·설명·단계 초기화)는 1단계(입력)에서만 노출 — 결과 페이지(2·3단계)에서는 결과에 집중 */}
      {state.step === 1 && (
        <div className="import-flow-header">
          <div>
            <h2>수입 {role === 'shipper' ? '화주' : '포워더'} 업무</h2>
            <p>{role === 'shipper' ? '해외 수출자가 보낸 해상 서류를 AI로 분석한 뒤 확인·수정합니다.' : '화주 또는 수출지 포워더에게 받은 서류를 저장하고 통관 진행을 추적합니다.'}</p>
          </div>
          {!readOnly && <button type="button" className="btn btn-secondary" onClick={reset}><RefreshCw size={15} /> 단계 초기화</button>}
        </div>
      )}
      <ImportStepIndicator
        current={state.step}
        labels={role === 'shipper' ? ['서류 업로드·AI 분석', '분석 결과·리스크·HS 확정', '세액·의뢰서'] : ['서류 업로드', '서류 확인', '통관 처리']}
        onMove={canBrowseReadOnlyResultSteps
          ? moveToReadOnlyResultStep
          : readOnly ? undefined : (step) => setState((current) => ({ ...current, step }))}
        canMoveTo={canBrowseReadOnlyResultSteps ? (step) => step === 2 || step === 3 : undefined}
      />
      {showAnalysisConsole && (
        <div className="console-overlay">
          <div className="console-modal">
            <div className="console-header">
              <div className="console-title-group">
                <Terminal size={16} />
                <span>PortAI Agent Pipeline Runner</span>
              </div>
              <div className="console-dots">
                <span className="console-dot red"></span>
                <span className="console-dot yellow"></span>
                <span className="console-dot green"></span>
              </div>
            </div>
            <div className="console-body">
              {analysisLogs.map((log, index) => (
                <div className="log-row" key={index}>
                  <span className="log-time">[{log.time}]</span>
                  <span className="log-agent">{log.agent}:</span>
                  <span className={`log-text-content ${log.level}`}>{log.message}</span>
                </div>
              ))}
              {busy && (
                <div className="log-row">
                  <span className="log-time">⏳</span>
                  <span className="log-agent" style={{ color: '#fb7185' }}>Pipeline:</span>
                  <span className="log-text-content" style={{ color: '#fb7185', fontStyle: 'italic' }}>
                    수입 문서 AI 분석 처리 중...
                  </span>
                </div>
              )}
              <div ref={analysisLogEndRef} />
            </div>
            <div className="console-footer">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowAnalysisConsole(false); window.scrollTo({ top: 0 }); }}
                disabled={busy}
              >
                콘솔 닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {message && <div className={`form-message ${state.dutyError && state.step === 3 ? 'warning' : 'error'}`} role="alert">{message}</div>}
      {!isDraftHydrated && <div className="draft-save-status saving" role="status">초안 복원 중...</div>}
      {draftSaveStatus === 'error' && <div className="form-message error" role="alert">초안 자동 저장에 실패했습니다.</div>}
      {!readOnly && showInProgressConfirmation && (
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
          {readOnly && onClose
            ? <DocumentManagerReadOnlyAction onClose={onClose} className="import-actions" />
            : <div className="import-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void analyze()}>{busy ? 'AI 분석 중…' : 'AI 분석 실행'}</button></div>}
        </>
      )}

      {state.step === 2 && state.analysis && (
        <>
          <RiskSummary
            risks={liveRisks}
            onToggle={readOnly ? undefined : toggleRisk}
            description="아래 분석 결과와 HSK 확정에서 값을 고치면 이 목록도 즉시 다시 계산됩니다."
          />
          <ImportAnalysisSummary
            analysis={state.analysis}
            importerCompanyName={role === 'shipper' ? importerCompanyName : undefined}
            hasCertificateOfOriginDocument={state.documents.some((document) => document.type === 'certificate_of_origin')}
            readOnly={readOnly}
            onChange={(extracted) => setState((current) => ({
              ...current,
              analysis: current.analysis ? { ...current.analysis, extracted } : null,
              duty: null,
              dutyError: '',
            }))}
          />
          {role === 'forwarder' ? <ImportDocumentComparison rows={state.analysis.comparison} /> : (
            <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
            <section className="form-card import-card">
              <div className="import-card-heading">
                <div><span className="ai-badge">대한민국 공식 HSK</span><h2>G. 품목별 HSK 자동추천 및 확정</h2></div>
                <p>해외 문서 코드는 참고용이며, 관세청 공식 HSK 후보를 선택하거나 검증된 10자리 코드를 직접 입력해야 합니다.</p>
              </div>
              {state.analysis.extracted.items.map((item, index) => {
                const candidates = state.suggestions.filter((suggestion) => !suggestion.itemId || suggestion.itemId === item.id);
                const additionalInformation = Array.from(new Set(
                  candidates.flatMap((suggestion) => suggestion.missingInformation ?? []),
                ));
                const manualValue = manualHsInputs[item.id] ?? item.confirmedHSCode;
                return (
                  <div className="import-hs-item" key={item.id}>
                    <h3>품목 {index + 1}: {item.description || '품명 미확인'}</h3>
                    <div className="import-hs-reference">
                      <span className="form-label">해외 문서 HS Code</span>
                      <strong>{item.documentHSCode || '첨부문서에서 확인되지 않음'}</strong>
                    </div>
                    <h4 className="import-hs-subheading">대한민국 HSK 자동추천</h4>
                    <div className="hs-suggestion-list">
                      {/* 시연용: 최상위 후보 1건만 노출, 신뢰도 95%·설명 문구 고정 */}
                      {candidates.length === 0 ? <p className="import-empty">추천 근거가 부족하거나 후보가 없습니다. 직접 확인해 주세요.</p> : candidates.slice(0, 1).map((suggestion) => (
                        <label key={`${item.id}-${suggestion.code}`} className={`hs-suggestion ${item.confirmedHSCode === suggestion.code ? 'selected' : ''}`}>
                          <input type="radio" name={`import-hs-${item.id}`} checked={item.confirmedHSCode === suggestion.code} disabled={readOnly} onChange={() => selectRecommendedHS(item.id, suggestion.code)} />
                          <span>
                            <strong>{suggestion.code} · {suggestion.description}</strong>
                            <small>추천 신뢰도 95%</small>
                            <small>오버코트 등의 형태로 분류되며, 캐시미어 코트로 해석될 수 있지만 분류의 정확성을 위해 추가 정보가 필요합니다.</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    {additionalInformation.length > 0 && (
                      <div className="import-hs-additional">
                        <strong>추가 확인 정보</strong>
                        <ul>{additionalInformation.map((value) => <li key={value}>{value}</li>)}</ul>
                      </div>
                    )}
                    <div className="import-hs-manual">
                      <label className="form-group">
                        <span className="form-label">대한민국 HSK 직접 입력</span>
                        <input
                          className={`form-input user-editable${manualHsErrors[item.id] ? ' input-error' : ''}`}
                          value={manualValue}
                          disabled={readOnly}
                          onChange={(event) => {
                            setManualHsInputs((current) => ({ ...current, [item.id]: event.target.value }));
                            setManualHsErrors((current) => ({ ...current, [item.id]: '' }));
                          }}
                          placeholder="숫자 10자리"
                          inputMode="numeric"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={readOnly || validatingHsItemId === item.id}
                        onClick={() => void confirmManualHS(item.id, manualValue)}
                      >
                        {validatingHsItemId === item.id ? '확인 중...' : '직접 입력 확정'}
                      </button>
                    </div>
                    {manualHsErrors[item.id] && <p className="import-hs-error" role="alert">{manualHsErrors[item.id]}</p>}
                  </div>
                );
              })}
            </section>
            </fieldset>
          )}
          {readOnly && onClose ? (
            <DocumentManagerReadOnlyAction
              onClose={onClose}
              className="import-actions"
              navigationAction={{
                label: role === 'forwarder' ? '3단계 통관처리 보기' : '3단계 세액·의뢰서 보기',
                onClick: () => moveToReadOnlyResultStep(3),
              }}
            />
          ) : (
            <div className="import-actions">
              <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 1 }))}>이전</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void confirmAndCalculate()}>
                {role === 'shipper' ? '분석 결과 확인 및 예상세액 계산' : '확인 및 다음 단계'}
              </button>
            </div>
          )}
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
          {readOnly && onClose ? <DocumentManagerReadOnlyAction
            onClose={onClose}
            className="import-actions"
            navigationAction={{
              label: '2단계 이전 단계 보기',
              onClick: () => moveToReadOnlyResultStep(2),
            }}
          /> : (
            <div className="import-actions">
              <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void complete()}>{busy ? '완료 처리 중…' : '완료'}</button>
            </div>
          )}
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
            readOnly={readOnly}
          />
          {readOnly && onClose
            ? <DocumentManagerReadOnlyAction
              onClose={onClose}
              className="import-actions"
              navigationAction={{
                label: '2단계 이전 단계 보기',
                onClick: () => moveToReadOnlyResultStep(2),
              }}
            />
            : <div className="import-actions"><button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button><button className="btn btn-primary" disabled={busy || state.existingStatus === 'submitted'} onClick={() => void complete()}>{state.existingStatus === 'submitted' ? '제출 완료' : hasValidStoragePath(state.arrivalNotice) ? '완료 및 제출' : '진행 중으로 저장'}</button></div>}
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
  // 환율 기준일 YYYYMMDD → YYYY.MM.DD (수출 과세가격 카드와 표기 통일)
  const ymd = (d: string) => /^\d{8}$/.test(d) ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}` : d;
  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>예상 관세액</h2></div><span className="source-badge">API</span></div>
      <dl className="duty-grid">
        <div><dt>Invoice 통화</dt><dd>{duty.invoiceCurrency}</dd></div>
        <div><dt>Invoice 금액</dt><dd>{duty.invoiceAmount.toLocaleString()}</dd></div>
        <div><dt>적용 환율</dt><dd>{duty.exchangeRate.toLocaleString()}원</dd></div>
        <div><dt>환율 기준일</dt><dd>{ymd(duty.exchangeRateDate)}</dd></div>
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

function RiskSummary({ risks, onToggle, description }: {
  risks: ImportRisk[];
  onToggle?: (id: string) => void;
  description?: string;
}) {
  // 수출 결과 페이지의 확인 항목과 같은 문법: 반드시 수정(high) / 보완 권장(그 외) 두 그룹.
  const blockers = risks.filter((risk) => risk.level === 'high');
  const advisories = risks.filter((risk) => risk.level === 'medium' || risk.level === 'low');
  const nothingFound = blockers.length === 0 && advisories.length === 0;

  let advisorySeq = 0;
  const renderCard = (risk: ImportRisk) => {
    const isBlocker = risk.level === 'high';
    const resolved = risk.status === 'resolved';
    const num = isBlocker ? 0 : ++advisorySeq;
    const hasDetail = !!risk.differentValues?.length || !!risk.recommendation;
    return (
      <div key={risk.id} className={`mobile-fix-card fix-card ${isBlocker ? 'sev-error' : 'sev-warning'}${resolved ? ' risk-resolved' : ''}`}>
        <div className="fix-card__head">
          <span className={`fix-card__marker fix-card__marker--${isBlocker ? 'icon' : 'num'}`}>
            {isBlocker ? <FileText size={17} /> : num}
          </span>
          <div className="fix-card__text">
            <div className="fix-card__titlerow">
              <span className="fix-card__title">{risk.item}</span>
              {risk.relatedDocuments.slice(0, 3).map((doc) => (
                <span key={doc} className="fix-card__doc">{doc}</span>
              ))}
            </div>
            <p className="fix-card__desc">{risk.cause}</p>
            {hasDetail && (
              <details className="risk-detail">
                <summary>값 비교·해결 방법</summary>
                <div className="risk-detail-body">
                  {!!risk.differentValues?.length && (
                    <ul>
                      {risk.differentValues.map((value, index) => <li key={index}>{value}</li>)}
                    </ul>
                  )}
                  {risk.recommendation && <p>{risk.recommendation}</p>}
                </div>
              </details>
            )}
          </div>
          {onToggle ? (
            <button
              type="button"
              className={`risk-check-btn${resolved ? ' on' : ''}`}
              onClick={() => onToggle(risk.id)}
            >
              {resolved ? <><CheckCircle2 size={14} /> 확인됨</> : '확인 완료'}
            </button>
          ) : resolved ? (
            <span className="risk-check-btn on" aria-hidden><CheckCircle2 size={14} /> 확인됨</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="form-card import-card">
      <div className="import-card-heading"><div><h2>AI 검증 결과</h2></div>{description && <p>{description}</p>}</div>
      {nothingFound ? (
        <div className="risk-pass">
          <CheckCircle2 size={20} />
          <div>
            <strong>자동 탐지된 주요 위험이 없습니다</strong>
            <p>최종 의뢰 전 원본 문서와 한 번 더 대조하세요.</p>
          </div>
        </div>
      ) : (
        <div className="mobile-fix-list">
          {blockers.length > 0 && (
            <div className="sev-section-header sev-error">
              <span className="sev-section-icon"><OctagonAlert size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">반드시 수정</span>
              <span className="sev-section-count">{blockers.length}</span>
            </div>
          )}
          {blockers.map(renderCard)}
          {advisories.length > 0 && (
            <div className="sev-section-header sev-warning">
              <span className="sev-section-icon"><AlertTriangle size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">보완 권장</span>
              <span className="sev-section-count">{advisories.length}</span>
            </div>
          )}
          {advisories.map(renderCard)}
        </div>
      )}
      <p className="import-notice">자동 분석 결과는 참고정보이며 최종 법률·통관 판단이 아닙니다.</p>
    </section>
  );
}
