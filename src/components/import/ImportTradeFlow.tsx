import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, PenLine, Eye, FileText, OctagonAlert, RefreshCw, RotateCcw, Search, Terminal } from 'lucide-react';
import ImportStepIndicator from './ImportStepIndicator';
import ImportDocumentUploader from './ImportDocumentUploader';
import ImportAnalysisSummary from './ImportAnalysisSummary';
import {
  downloadImportDeclarationFormDocx,
  mapImportDeclarationForm,
} from '../../services/importDeclarationFormService';
import ImportDeclarationFormPreview from './ImportDeclarationFormPreview';
import ImportUnipassSubmit from './ImportUnipassSubmit';
import ImportDeclarationChecklist from './ImportDeclarationChecklist';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import {
  analyzeImportDocuments,
  IMPORT_DOCUMENT_TYPE_LABELS,
  normalizeImportAnalysisResult,
  normalizeImportExtractedFields,
  syncLegacyImportFields,
} from '../../services/importDocumentAnalysisService';
import { calculateEstimatedImportDuty } from '../../services/importDutyService';
import {
  recommendImportHSKForItems,
  validateOfficialImportHSK,
} from '../../services/importHSCodeSuggestionService';
import { resolveImportRisks } from '../../services/importRiskService';
import { applyChosenValue, clearChosenValue, mergeEditedChoices } from '../../services/importValueChoiceService';
import { IMPORT_DEMO_SCENARIO } from '../../services/importReconciliationFixtures';
import {
  buildImportDeclarationDocx,
  downloadImportDeclarationDocx,
  printImportDeclarationAsPdf,
  renderImportDeclarationPreview,
} from '../../services/importDeclarationService';
import { cleanRiskTitle, displayRelatedDocuments } from '../../utils/riskDisplay';
import { duplicateImportDocumentsMessage, findDuplicateImportDocuments } from '../../utils/importDocumentDuplicates';
import { lookupImportCargo } from '../../services/cargoProgressService';
import { saveShipperReturnReply } from '../../services/forwarderCaseService';
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
  ImportDeliveryRequest,
  ImportHSCodeSuggestion,
  ImportRisk,
  ImportRiskFixTarget,
  ImportRiskPickGroup,
  ImportTradeSnapshot,
  UserTradeRole,
} from '../../types/importTrade';
import {
  CO_HOLDING_CHOICES,
  CO_HOLDING_KEY,
  FTA_CHOICE_KEY,
  FTA_REVIEW_CHOICE,
  isFtaReviewChoice,
  type CoHolding,
} from '../../types/importTrade';
import type { PersistedTradeStatus, SavedTrade, TradeProfile } from '../../types';
import type { TradeFormDataV3 } from '../../types/tradeFormData';
import type { TradeDraftRow } from '../../services/draftCacheService';
import { deleteTradeDraft, isSubmittedTradeDraft, saveTradeFormDraft } from '../../services/draftCacheService';
import { useFormDataDraft } from '../../hooks/useFormDataDraft';
import DocumentManagerReadOnlyAction from '../DocumentManagerReadOnlyAction';

const IMPORT_DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_SUBMISSION === 'true';

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
  /** 화주가 입력한 배송 요청 — 제출 시 스냅샷에 실려 포워더에게 전달된다 */
  deliveryRequest?: ImportDeliveryRequest;
  generatedAt: string | null;
  tradeId?: string;
  existingStatus?: PersistedTradeStatus;
  /** 포워더 보완 요청으로 다시 연 거래 — 2단계 상단에 수정 안내 카드를 띄운다 */
  reviseNotice?: { reason: string } | null;
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
  // 서류 분석 진행 표시 — 실제 단계와 경과 시간(초), HS 추천은 끝난 품목 수까지 보여준다.
  const [analysisPhase, setAnalysisPhase] = useState<{ label: string; startedAt: number; done?: number; total?: number } | null>(null);
  const [phaseNow, setPhaseNow] = useState(() => Date.now());
  useEffect(() => {
    if (!analysisPhase) return;
    setPhaseNow(Date.now());
    const timer = setInterval(() => setPhaseNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [analysisPhase]);
  const elapsedSeconds = (startedAt: number) => Math.max(0, Math.round((Date.now() - startedAt) / 1000));

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
  const declarationPreviewRef = useRef<HTMLDivElement | null>(null);
  const [declarationError, setDeclarationError] = useState('');
  const [declarationFormPreview, setDeclarationFormPreview] = useState(false);
  const [declarationFormError, setDeclarationFormError] = useState('');
  // 포워더 보완 요청에 대한 화주 회신 메모 — 요청·회신이 같은 의뢰에 남는다
  const [reviseReply, setReviseReply] = useState('');
  const [reviseReplyBusy, setReviseReplyBusy] = useState(false);
  const [reviseReplySaved, setReviseReplySaved] = useState(false);
  const canBrowseReadOnlyResultSteps = readOnly;
  const moveToReadOnlyResultStep = (step: number) => {
    // 화주는 2~4단계(HSK 검토 · FTA/세액 · 신고자료)를 조회 상태로 오갈 수 있다.
    if (!canBrowseReadOnlyResultSteps || step < 2 || step > 4) return;
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
    // 같은 종류 서류가 2부 이상이면 서류끼리 대조할 수 없으므로 분석 전에 막는다.
    const duplicateDocuments = findDuplicateImportDocuments(state.documents);
    if (duplicateDocuments.length) return setMessage(duplicateImportDocumentsMessage(duplicateDocuments));
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
      pushAnalysisLog('Document Agent', `파일 ${analyzableDocuments.length}건 로드 완료`, 'success');
      pushAnalysisLog('Analysis Agent', `AI가 서류 ${analyzableDocuments.length}건을 읽고 서로 대조하는 중이에요.`);
      const analysisStartedAt = Date.now();
      setAnalysisPhase({ label: '서류 분석 중', startedAt: analysisStartedAt });
      const result = await analyzeImportDocuments(analyzableDocuments, resolvedFiles);
      pushAnalysisLog('Analysis Agent', `서류 분석 완료 (${elapsedSeconds(analysisStartedAt)}초)`, 'success');
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
      let suggestions: ImportHSCodeSuggestion[] = [];
      if (role === 'shipper' && analysis.extracted.items.length > 0) {
        const hsStartedAt = Date.now();
        pushAnalysisLog('HSCode Agent', `품목 ${analysis.extracted.items.length}건의 대한민국 HS 코드를 추천하는 중이에요.`);
        setAnalysisPhase({ label: 'HS 코드 추천 중', startedAt: hsStartedAt, done: 0, total: analysis.extracted.items.length });
        suggestions = await recommendImportHSKForItems(analysis.extracted.items, (done, total) => {
          setAnalysisPhase((current) => (current ? { ...current, done, total } : current));
        });
        pushAnalysisLog('HSCode Agent', `HS 코드 추천 완료 (${elapsedSeconds(hsStartedAt)}초)`, 'success');
      }
      setAnalysisPhase(null);
      pushAnalysisLog('Orchestrator Agent', '분석 완료 — 추출값을 분석 결과 폼에 반영했습니다.', 'success');
      setTimeout(() => setShowAnalysisConsole(false), 900);
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
          risks: resolveImportRisks(documents, analysis, suggestions, '', undefined, role),
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
      setAnalysisPhase(null);
      pushAnalysisLog('Orchestrator Agent', '분석 실패 — 오류 내용을 확인해 주세요.');
      setTimeout(() => setShowAnalysisConsole(false), 900);
    } finally {
      setBusy(false);
    }
  };

  const loadDemoScenario = () => {
    const scenario = IMPORT_DEMO_SCENARIO;
    setSourceFiles({});
    setManualHsInputs({});
    setManualHsErrors({});
    setMessage('PDF 샘플의 추출값을 규칙 엔진으로 대조했습니다.');
    setState((current) => ({
      ...current,
      step: 2,
      documents: scenario.documents.map((document) => ({ ...document })),
      analysis: scenario.analysis,
      suggestions: [],
      selectedCode: '',
      duty: null,
      dutyError: '',
      risks: resolveImportRisks(
        scenario.documents,
        scenario.analysis,
        [],
        '',
        scenario.input,
        role,
      ),
    }));
  };

  /**
   * 예상세액만 다시 계산한다.
   * FTA 적용 여부나 값 선택을 바꾸면 duty를 비우는데, 그때 기본 관세율 기준 세액은 계속 보여야 한다.
   */
  const [dutyBusy, setDutyBusy] = useState(false);
  const recalculateDuty = useCallback(async () => {
    const analysis = state.analysis;
    if (!analysis || role !== 'shipper') return;
    const fields = analysis.extracted;
    if (!fields.items.length) return;
    setDutyBusy(true);
    try {
      const duty = await calculateEstimatedImportDuty({
        items: fields.items,
        invoiceCurrency: fields.currency,
        invoiceAmount: fields.totalAmount,
        invoiceDate: fields.invoiceDate,
        originCountry: fields.items.map((item) => item.originCountry).filter(Boolean).join(', '),
        destinationCountry: fields.destinationCountry,
      });
      setState((current) => ({ ...current, duty, dutyError: '' }));
    } catch (error) {
      const dutyError = error instanceof Error ? error.message : '예상세액을 계산하지 못했습니다.';
      console.error('[Import Duty] recalculation failed', { error, dutyError });
      setState((current) => ({ ...current, dutyError }));
    } finally {
      setDutyBusy(false);
    }
  }, [role, state.analysis]);

  // 3단계(FTA·세액)에 들어왔는데 세액이 비어 있으면 기본 관세율 기준으로 다시 계산한다.
  useEffect(() => {
    if (state.step !== 3 || role !== 'shipper' || readOnly) return;
    if (state.duty || state.dutyError || dutyBusy) return;
    void recalculateDuty();
  }, [state.step, state.duty, state.dutyError, role, readOnly, dutyBusy, recalculateDuty]);

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
    const risks = resolveImportRisks(state.documents, state.analysis, state.suggestions, dutyError, undefined, role)
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
        deliveryRequest: state.deliveryRequest,
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

  const returnAfterHsConfirm = (itemId: string) => {
    const fromRiskId = hsReturnRiskRef.current;
    if (!fromRiskId) return;
    const nextItem = state.analysis?.extracted.items.find((item) => item.id !== itemId && !item.confirmedHSCode);
    window.setTimeout(() => {
      if (nextItem) {
        goToHsItem(nextItem.id, fromRiskId);
        return;
      }
      hsReturnRiskRef.current = null;
      const card = document.getElementById(`import-risk-${fromRiskId}`) ?? document.getElementById('import-risk-summary');
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card?.classList.add('import-risk--flash');
      window.setTimeout(() => card?.classList.remove('import-risk--flash'), 2000);
    }, 350);
  };

  const selectRecommendedHS = (itemId: string, code: string) => {
    setManualHsInputs((current) => ({ ...current, [itemId]: code }));
    setManualHsErrors((current) => ({ ...current, [itemId]: '' }));
    updateConfirmedHS(itemId, code);
    returnAfterHsConfirm(itemId);
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
    returnAfterHsConfirm(itemId);
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
    if (unresolvedHigh.length && !window.confirm(`확인이 끝나지 않은 신고 항목이 ${unresolvedHigh.length}건 있습니다. 내용을 확인했으며 계속 진행할까요?`)) return;
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
        deliveryRequest: state.deliveryRequest,
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
    const storedById = new Map(state.risks.map((risk) => [risk.id, risk]));
    return resolveImportRisks(state.documents, state.analysis, state.suggestions, state.dutyError, undefined, role)
      .map((risk) => {
        const stored = storedById.get(risk.id);
        // 값을 고른 카드는 항상 해결됨. 고른 값을 되돌렸다면 저장된 '해결됨'도 따라가지 않는다.
        if (risk.chosen || risk.autoResolved || stored?.chosen) return risk;
        return { ...risk, status: stored?.status ?? risk.status };
      });
  }, [state.analysis, state.documents, state.suggestions, state.dutyError, state.risks, importerCompanyName, role]);

  // 재계산으로 목록이 바뀌어도 '확인 완료' 표시가 유실되지 않도록 파생 목록을 그대로 저장한다.
  const toggleRisk = (id: string) => setState((current) => ({
    ...current,
    risks: liveRisks.map((risk) => (risk.id === id
      ? { ...risk, status: risk.status === 'resolved' ? 'unresolved' : 'resolved' }
      : risk)),
  }));

  // 불일치 카드에서 맞는 값을 고르면 분석 결과에 반영하고, 세액은 새 값으로 다시 계산하게 비운다.
  const chooseRiskValue = (key: string, value: string) => setState((current) => (current.analysis ? {
    ...current,
    analysis: applyChosenValue(current.analysis, key, value),
    duty: null,
    dutyError: '',
  } : current));
  // HS 미확정 카드 → 아래 G. HSK 확정 칸의 해당 품목으로 이동
  // 경고 카드에서 HS 확정하러 내려간 경우, 확정 후 그 카드로 다시 올라간다.
  const hsReturnRiskRef = useRef<string | null>(null);
  const goToHsItem = (itemId: string, fromRiskId?: string) => {
    hsReturnRiskRef.current = fromRiskId ?? null;
    const target = document.getElementById(`import-hs-item-${itemId}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.classList.add('import-hs-item--focus');
    window.setTimeout(() => target?.classList.remove('import-hs-item--focus'), 2400);
  };
  // 서류 누락 카드 → 1단계(서류 업로드)로 돌아가 추가 업로드
  const goToUploadStep = () => setState((current) => ({ ...current, step: 1 }));

  // FTA·원산지증명서는 3단계에서 따로 다루고, 2단계에서는 신고값만 본다.
  const isFtaRisk = (risk: ImportRisk) => Boolean(risk.ftaChoice) || risk.id === 'missing-co' || risk.id.startsWith('co-');
  const declarationRisks = liveRisks.filter((risk) => !isFtaRisk(risk));
  const ftaChoice = state.analysis?.chosenValues?.[FTA_CHOICE_KEY];
  const ftaReviewing = isFtaReviewChoice(ftaChoice);
  const coHolding = state.analysis?.chosenValues?.[CO_HOLDING_KEY] as CoHolding | undefined;
  const hasCertificateOfOrigin = state.documents.some((document) => document.type === 'certificate_of_origin');
  const clearRiskValue = (key: string) => setState((current) => (current.analysis ? {
    ...current,
    analysis: clearChosenValue(current.analysis, key),
  } : current));

  const declarationData = useMemo(() => (state.analysis ? {
    fields: state.analysis.extracted,
    duty: state.duty ?? undefined,
    dutyError: state.dutyError,
    risks: state.risks,
    documents: state.documents,
    importerCompanyName,
    tradeId: state.tradeId,
    ftaChoice: state.analysis.chosenValues?.[FTA_CHOICE_KEY],
  } : null), [state.analysis, state.duty, state.dutyError, state.risks, state.documents, state.tradeId, importerCompanyName]);

  // 보기를 누르면 다운로드와 같은 docx를 그대로 렌더한다.
  useEffect(() => {
    const container = declarationPreviewRef.current;
    if (!preview || !declarationData || !container) return;
    let cancelled = false;
    setDeclarationError('');
    void buildImportDeclarationDocx(declarationData)
      .then((blob) => (cancelled ? undefined : renderImportDeclarationPreview(blob, container)))
      .catch((error) => {
        console.error('[수입신고의뢰서] 미리보기 실패:', error);
        if (!cancelled) setDeclarationError('수입신고의뢰서를 만들지 못했습니다. 다시 시도해 주세요.');
      });
    return () => { cancelled = true; };
  }, [preview, declarationData]);

  // 수입신고서(초안) — 관세청 서식에 확인된 값만 채운다.
  const declarationFormData = useMemo(() => ({
    fields: state.analysis?.extracted ?? normalizeImportExtractedFields({}),
    duty: state.duty,
    importerCompanyName,
  }), [state.analysis, state.duty, importerCompanyName]);

  /** 미리보기에 얹을 값 — 다운로드 docx와 같은 매핑을 쓴다. */
  const declarationFormValues = useMemo(
    () => mapImportDeclarationForm(declarationFormData),
    [declarationFormData],
  );

  /** UNI-PASS 전송 전에 확인시킬 요약 — 신고서에 들어간 값을 그대로 보여준다. */
  const unipassSummary = useMemo(() => {
    const form = declarationFormValues;
    return [
      { label: 'B/L 번호', value: form.bl_no ?? '' },
      { label: '신고 물품', value: form.first_goods_name ?? '' },
      { label: 'HSK', value: form.first_hs_code ?? '' },
      { label: '총 과세가격', value: form.total_customs_value_krw ? `${form.total_customs_value_krw}원` : '' },
      { label: '총 예상세액', value: form.total_tax ? `${form.total_tax}원` : '' },
    ];
  }, [declarationFormValues]);

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
        labels={role === 'shipper'
          ? ['수입서류 등록', 'HSK 검토', 'FTA · 세액 확인', '신고자료 준비']
          : ['서류 업로드', '서류 확인', '통관 처리']}
        onMove={canBrowseReadOnlyResultSteps
          ? moveToReadOnlyResultStep
          : readOnly ? undefined : (step) => setState((current) => ({ ...current, step }))}
        canMoveTo={canBrowseReadOnlyResultSteps ? (step) => step >= 2 : undefined}
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
                    {analysisPhase
                      ? `${analysisPhase.label}${analysisPhase.total ? ` (품목 ${analysisPhase.done ?? 0}/${analysisPhase.total})` : ''} · 경과 ${Math.max(0, Math.round((phaseNow - analysisPhase.startedAt) / 1000))}초`
                      : '수입 문서 AI 분석 처리 중...'}
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
            : <div className="import-actions">
              {IMPORT_DEMO_ENABLED && <button type="button" className="btn btn-secondary" disabled={busy} onClick={loadDemoScenario}>데모 데이터</button>}
              <button className="btn btn-primary" disabled={busy} onClick={() => void analyze()}>{busy ? 'AI 분석 중…' : 'AI 분석 실행'}</button>
            </div>}
        </>
      )}

      {state.step === 2 && state.analysis && (
        <>
          {state.reviseNotice && (
            <section className="form-card import-card revise-notice">
              <div className="import-card-heading">
                <div><h2>포워더 보완 요청</h2><p>아래 항목을 수정한 뒤 끝까지 진행해 다시 제출하면 포워더에게 회신됩니다.</p></div>
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setState((current) => ({ ...current, reviseNotice: null }))}
                  >
                    확인
                  </button>
                )}
              </div>
              <p className="revise-notice-text">{state.reviseNotice.reason}</p>
              {!readOnly && state.tradeId && (
                <div className="revise-reply">
                  <input
                    className="form-input"
                    value={reviseReply}
                    onChange={(event) => { setReviseReply(event.target.value); setReviseReplySaved(false); }}
                    placeholder="포워더에게 회신 메모 (예: 실측 900개가 맞아 송장을 수정했습니다)"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={reviseReplyBusy || reviseReply.trim() === ''}
                    onClick={() => {
                      if (!state.tradeId) return;
                      setReviseReplyBusy(true);
                      void saveShipperReturnReply(state.tradeId, reviseReply)
                        .then(() => setReviseReplySaved(true))
                        .catch((error) => console.error('회신 메모 저장 실패:', error))
                        .finally(() => setReviseReplyBusy(false));
                    }}
                  >
                    {reviseReplySaved ? '회신 저장됨 ✓' : reviseReplyBusy ? '저장 중…' : '회신 저장'}
                  </button>
                </div>
              )}
            </section>
          )}
          <div className="import-analysis-disclaimer">
            <p>아래 분석 결과에서 값을 고치면 이 목록도 즉시 다시 계산됩니다.</p>
          </div>
          <ImportAnalysisSummary
            analysis={state.analysis}
            hasCertificateOfOriginDocument={state.documents.some((document) => document.type === 'certificate_of_origin')}
            readOnly={readOnly}
            onChange={(extracted) => setState((current) => ({
              ...current,
              // 서류끼리 비교하는 칸(중량·항구·Consignee 등)을 직접 고쳐도 확인한 값으로 보고 경고를 다시 계산한다.
              analysis: current.analysis ? mergeEditedChoices(current.analysis, extracted) : null,
              duty: null,
              dutyError: '',
            }))}
          />
          {role === 'shipper' ? (
            <ImportDeclarationChecklist
              fields={state.analysis.extracted}
              risks={declarationRisks}
              onChoose={readOnly ? undefined : chooseRiskValue}
              onClearChoice={readOnly ? undefined : clearRiskValue}
              onGoHs={readOnly ? undefined : goToHsItem}
            />
          ) : (
            <RiskSummary
              risks={liveRisks}
              onToggle={readOnly ? undefined : toggleRisk}
              onGoUpload={readOnly ? undefined : goToUploadStep}
            />
          )}
          {role === 'forwarder' ? <ImportDocumentComparison rows={state.analysis.comparison} /> : (
            <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
            <section className="form-card import-card">
              <div className="import-card-heading import-hs-heading">
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
                  <div className="import-hs-item" id={`import-hs-item-${item.id}`} key={item.id}>
                    <h3>품목 {index + 1}: {item.description || '품명 미확인'}</h3>
                    <div className="import-hs-reference">
                      <span className="form-label">해외 문서 HS Code</span>
                      <strong>{item.documentHSCode || '첨부문서에서 확인되지 않음'}</strong>
                      <small>해외 수출자가 작성한 HS Code로 참고용입니다.</small>
                    </div>
                    <h4 className="import-hs-subheading">대한민국 HSK 자동추천</h4>
                    <div className="hs-suggestion-list">
                      {candidates.length === 0 ? <p className="import-empty">추천 근거가 부족하거나 후보가 없습니다. 직접 확인해 주세요.</p> : candidates.map((suggestion) => (
                        <label key={`${item.id}-${suggestion.code}`} className={`hs-suggestion ${item.confirmedHSCode === suggestion.code ? 'selected' : ''}`}>
                          <input type="radio" name={`import-hs-${item.id}`} checked={item.confirmedHSCode === suggestion.code} disabled={readOnly} onChange={() => selectRecommendedHS(item.id, suggestion.code)} />
                          <span>
                            <strong title={`${suggestion.code} · ${suggestion.description}`}>{suggestion.code} · {suggestion.description}</strong>
                            <small>추천 신뢰도 {Math.round(suggestion.confidence * 100)}%</small>
                            <small>{suggestion.reasoning}</small>
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
            {/* 수입요건은 HSK가 정해져야 판단할 수 있다. 앱에는 세번별 요건 데이터가 없어
                추정값을 보여주지 않고, 공식 확인 경로만 안내한다(추후 관세청 API 연동 예정). */}
            <section className="form-card import-card">
              <div className="import-card-heading">
                <div><h2>H. 수입요건 확인</h2></div>
                <p>확정한 HSK에 세관장확인 대상 요건(식품·전기용품·전파 등)이 걸리는지는 공식 경로에서 확인해야 합니다.</p>
              </div>
              <p className="import-card-note">
                이 앱은 요건 해당 여부를 판정하지 않습니다. 관세법령정보포털(unipass.customs.go.kr)의 세번별 요건 또는 관세사를 통해 확인하세요.
              </p>
            </section>
            </fieldset>
          )}
          {readOnly && onClose ? (
            <DocumentManagerReadOnlyAction
              onClose={onClose}
              className="import-actions"
              navigationAction={{
                label: role === 'forwarder' ? '3단계 통관처리 보기' : '3단계 FTA·세액 확인 보기',
                onClick: () => moveToReadOnlyResultStep(3),
              }}
            />
          ) : (
            <div className="import-actions">
              <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 1 }))}>이전</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void confirmAndCalculate()}>
                {role === 'shipper' ? '다음: FTA · 세액 확인' : '확인 및 다음 단계'}
              </button>
            </div>
          )}
        </>
      )}

      {state.step === 3 && state.analysis && role === 'shipper' && (
        <>
          <section className="form-card import-card">
            <div className="import-card-heading">
              <div><h2>FTA 적용 여부</h2></div>
              {/* 설명은 길어서 카드 머리를 밀어내므로 TIP을 눌렀을 때만 펼친다. */}
              <details className="import-tip">
                <summary>TIP</summary>
                <p>협정세율을 적용하면 관세를 줄일 수 있습니다. 적용 안 함을 골라도 기본 관세율로 예상세액은 계산됩니다.</p>
              </details>
            </div>
            <div className="import-fta-choices" role="group" aria-label="FTA 적용 여부">
              <button
                type="button"
                className={`btn import-fta-choice${ftaChoice === 'FTA 적용 안 함' ? ' is-selected' : ''}`}
                disabled={readOnly}
                onClick={() => (ftaChoice === 'FTA 적용 안 함' ? clearRiskValue(FTA_CHOICE_KEY) : chooseRiskValue(FTA_CHOICE_KEY, 'FTA 적용 안 함'))}
              >
                적용 안 함
              </button>
              <button
                type="button"
                className={`btn import-fta-choice${ftaReviewing ? ' is-selected' : ''}`}
                disabled={readOnly}
                onClick={() => (ftaReviewing ? clearRiskValue(FTA_CHOICE_KEY) : chooseRiskValue(FTA_CHOICE_KEY, FTA_REVIEW_CHOICE))}
              >
                적용 가능 여부 확인
              </button>
            </div>

            {ftaReviewing && (
              <div className="import-fta-review">
                <span className="form-label">원산지증명서(C/O) 보유</span>
                <div className="import-fta-choices" role="group" aria-label="원산지증명서 보유 여부">
                  {CO_HOLDING_CHOICES.map((choice) => {
                    const selected = coHolding === choice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        className={`btn import-fta-choice${selected ? ' is-selected' : ''}`}
                        disabled={readOnly}
                        onClick={() => (selected ? clearRiskValue(CO_HOLDING_KEY) : chooseRiskValue(CO_HOLDING_KEY, choice))}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
                <ul className="import-fta-checks">
                  <li>원산지: {state.analysis.extracted.items.map((item) => item.originCountry).filter(Boolean).join(', ') || '확인 필요'}</li>
                  <li>HSK: {state.analysis.extracted.items.map((item) => item.confirmedHSCode).filter(Boolean).join(', ') || '확정 필요'}</li>
                  <li>협정세율: {state.duty?.ftaRate == null ? '확인 필요 (관세사 또는 관세법령정보포털)' : `${state.duty.ftaRate}%`}</li>
                  <li>원산지증명서: {hasCertificateOfOrigin ? '첨부됨' : coHolding === '있음' ? '서류 추가 필요' : coHolding ? '발급 후 첨부하면 협정세율 적용 가능' : '보유 여부 선택 필요'}</li>
                </ul>
                {coHolding === '있음' && !hasCertificateOfOrigin && !readOnly && (
                  <button type="button" className="btn btn-primary" onClick={goToUploadStep}>원산지증명서 추가하러 가기 →</button>
                )}
              </div>
            )}

            <p className="import-card-note">
              {!ftaChoice
                ? '고르지 않으면 기본 관세율로 예상세액을 계산합니다.'
                : ftaChoice === 'FTA 적용 안 함'
                  ? '기본 관세율로 진행합니다. 원산지증명서는 제출하지 않아도 됩니다.'
                  : '협정 적용 요건은 이 앱이 판정하지 않습니다. 위 항목을 확인한 뒤 관세사와 최종 적용 여부를 정하세요.'}
            </p>
          </section>
          <DutySummary duty={state.duty} error={state.dutyError} busy={dutyBusy} ftaReviewing={ftaReviewing} />
          {readOnly && onClose ? (
            <DocumentManagerReadOnlyAction
              onClose={onClose}
              className="import-actions"
              navigationAction={{ label: '4단계 신고자료 준비 보기', onClick: () => moveToReadOnlyResultStep(4) }}
            />
          ) : (
            <div className="import-actions">
              <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => setState((current) => ({ ...current, step: 4 }))}>
                다음: 신고자료 준비
              </button>
            </div>
          )}
        </>
      )}

      {state.step === 4 && state.analysis && role === 'shipper' && declarationData && (
        <>
          <ImportDeclarationChecklist fields={state.analysis.extracted} risks={declarationRisks} summary />
          <section className="form-card import-card">
            <div className="import-card-heading"><div><h2>수입신고 의뢰서</h2></div><p>서류에서 확인된 값을 수입신고의뢰서 양식에 채웠습니다. 관세사에게 보내기 전에 빈칸과 체크 항목을 확인하세요.</p></div>
            <div className="document-preview-actions">
              <button className="btn btn-secondary" onClick={() => setPreview((value) => !value)}><Eye size={17} /> {preview ? '닫기' : '보기'}</button>
              <button
                className="btn btn-secondary"
                onClick={() => void downloadImportDeclarationDocx(declarationData).catch(() => setDeclarationError('DOCX를 만들지 못했습니다. 다시 시도해 주세요.'))}
              >
                <Download size={17} /> DOCX 다운로드
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void printImportDeclarationAsPdf(declarationData).catch(() => setDeclarationError('PDF 인쇄 창을 열지 못했습니다. 다시 시도해 주세요.'))}
              >
                <Download size={17} /> PDF 저장
              </button>
            </div>
            {declarationError && <p className="form-message error" role="alert">{declarationError}</p>}
            {preview && <div className="declaration-preview" ref={declarationPreviewRef} />}
          </section>

          {/* 수입신고서(초안) — 관세법 시행규칙 별지 제1호의3서식에 확인된 값만 채운다. */}
          <section className="form-card import-card">
            <div className="import-card-heading">
              <div><h2>수입신고서(초안)</h2></div>
              <p>관세청 서식에 확인된 값을 채웠습니다. 신고번호·부호칸과 세관기재란은 신고 후 확정되거나 관세사가 적는 자리라 비워 둡니다.</p>
            </div>
            <div className="document-preview-actions">
              <button className="btn btn-secondary" onClick={() => setDeclarationFormPreview((value) => !value)}>
                <Eye size={17} /> {declarationFormPreview ? '닫기' : '보기'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => void downloadImportDeclarationFormDocx(declarationFormData)
                  .catch(() => setDeclarationFormError('수입신고서를 만들지 못했습니다. 다시 시도해 주세요.'))}
              >
                <Download size={17} /> DOCX 다운로드
              </button>
            </div>
            {declarationFormError && <p className="form-message error" role="alert">{declarationFormError}</p>}
            {declarationFormPreview && <ImportDeclarationFormPreview values={declarationFormValues} />}
          </section>

          <ImportUnipassSubmit
            seed={declarationFormValues.bl_no ?? ''}
            customsOffice={declarationFormValues.customs_office}
            summary={unipassSummary}
            pendingCount={liveRisks.filter((risk) => risk.status !== 'resolved').length}
          />

          {readOnly && onClose ? <DocumentManagerReadOnlyAction
            onClose={onClose}
            className="import-actions"
            navigationAction={{
              label: '3단계 FTA·세액 확인 보기',
              onClick: () => moveToReadOnlyResultStep(3),
            }}
          /> : (
            <>
              {liveRisks.some((risk) => risk.status !== 'resolved') && (
                <p className="import-card-note">
                  남은 확인 항목 {liveRisks.filter((risk) => risk.status !== 'resolved').length}건은 제출 후 포워더가 원본 서류와 대조합니다.
                </p>
              )}
              <div className="import-actions">
                <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 3 }))}>이전</button>
                <button className="btn btn-primary" disabled={busy} onClick={() => void complete()}>{busy ? '완료 처리 중…' : '완료'}</button>
              </div>
            </>
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

function DutySummary({ duty, error, busy = false, ftaReviewing = false }: {
  duty: ImportDutyEstimate | null;
  error: string;
  busy?: boolean;
  /** FTA 적용 가능 여부를 확인 중인지 */
  ftaReviewing?: boolean;
}) {
  if (!duty) return (
    <section className="form-card import-card">
      <div className="import-card-heading">
        <div><h2>예상 관세액</h2></div>
        <span className="source-badge">{busy ? '계산 중' : '계산 전'}</span>
      </div>
      <div className={`form-message ${busy ? 'info' : 'warning'}`} role="status">
        {busy ? '기본 관세율로 예상세액을 계산하고 있습니다…' : error || '관세율 정보를 확인할 수 없어 예상세액을 계산하지 못했습니다.'}
      </div>
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
        <div><dt>FTA 세율</dt><dd>{duty.ftaRate == null ? (ftaReviewing ? '확인 필요' : '미적용') : `${duty.ftaRate}%`}</dd></div>
        <div><dt>예상 관세</dt><dd>{krw(duty.basicDuty)}</dd></div>
        <div><dt>부가가치세</dt><dd>{krw(duty.vat)}</dd></div>
        <div><dt>기타 세금</dt><dd>{krw(duty.otherTaxes)}</dd></div>
        <div><dt>총 예상세액</dt><dd>{krw(duty.totalTax)}</dd></div>
        <div><dt>예상 절감액</dt><dd>{krw(duty.estimatedSavings)}</dd></div>
      </dl>
      <p className="import-notice">
        {ftaReviewing
          ? duty.ftaRate == null
            ? '위 금액은 기본 관세율 기준입니다. 협정세율을 확인하면 FTA 적용 예상세액과 절감액을 함께 보여줍니다.'
            : '원산지증명서와 협정 요건을 관세사와 확인한 뒤 협정세율을 적용하세요.'
          : '위 금액은 기본 관세율 기준입니다. FTA 협정세율은 원산지증명서와 적용 요건 확인 전에는 적용하지 않습니다.'}
      </p>
    </section>
  );
}

/** 고른 값과 서류 값이 같은지 — '4,631 KG'와 '4631', '550.00 KG'와 '550'도 같은 값으로 본다. */
export function sameChoiceValue(a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const numeric = (value: string) => /\d/.test(value) && /^[\d.,\s]*[A-Za-z]*\s*$/.test(value.trim());
  // 글자로 비교하면 '550.00'과 '550'이 달라 보이므로 숫자 값으로 비교한다.
  const amount = (value: string) => Number(value.replace(/[^\d.]/g, ''));
  return numeric(a) && numeric(b) && amount(a) === amount(b);
}

const FULL_DOC_LABEL: Record<string, string> = {
  'C/I': 'Commercial Invoice (CI)', 'Commercial Invoice': 'Commercial Invoice (CI)',
  'P/L': 'Packing List (PL)', 'Packing List': 'Packing List (PL)',
  'B/L': 'Bill of Lading (B/L)', 'Bill of Lading': 'Bill of Lading (B/L)',
  'C/O': 'Certificate of Origin (C/O)', 'Certificate of Origin': 'Certificate of Origin (C/O)',
};
const fullDocLabel = (source: string) => FULL_DOC_LABEL[source] ?? source;

/** 수입 '반드시 수정' — 두 서류 값을 ≠로 나란히 보여주고 [수정하기]로 맞는 값을 고른다. */
function BlockerCompareCard({ risk, num, group, onChoose, onClearChoice }: {
  risk: ImportRisk;
  num: number;
  group: ImportRiskPickGroup;
  onChoose: (key: string, value: string) => void;
  onClearChoice?: (key: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [custom, setCustom] = useState('');
  const resolved = risk.status === 'resolved';
  const [left, right] = group.choices;
  const selected = group.selected;
  const isPicked = (value: string) => !!selected && sameChoiceValue(selected, value);
  const customPicked = !!selected && !group.choices.some((choice) => sameChoiceValue(selected, choice.value));
  const pick = (value: string) => {
    if (isPicked(value)) onClearChoice?.(group.key);
    else onChoose(group.key, value);
    setEditing(false);
  };
  const applyCustom = () => {
    if (!custom.trim()) return;
    onChoose(group.key, custom.trim());
    setCustom('');
    setEditing(false);
  };
  const side = (choice: { source: string; value: string }) => (
    <button
      type="button"
      className={`risk-compare__side${isPicked(choice.value) ? ' is-selected' : ''}`}
      aria-pressed={isPicked(choice.value)}
      disabled={!editing}
      onClick={() => pick(choice.value)}
    >
      <span className="risk-compare__doc">{fullDocLabel(choice.source)}</span>
      <strong className="risk-compare__value">{choice.value}</strong>
      {isPicked(choice.value) && <span className="risk-compare__picked"><CheckCircle2 size={13} /> 이 값으로 통일</span>}
    </button>
  );
  return (
    <div className={`mobile-fix-card fix-card risk-compare-card sev-error${resolved ? ' risk-resolved' : ''}`}>
      <div className="risk-compare__head">
        <span className="fix-card__marker fix-card__marker--num">{num}</span>
        <div className="risk-compare__titles">
          <span className="fix-card__title">{cleanRiskTitle(risk.item)}</span>
          <p className="fix-card__desc">{group.label} 정보가 서류 간에 일치하지 않습니다.</p>
        </div>
        <button
          type="button"
          className="risk-compare__collapse"
          aria-expanded={!collapsed}
          aria-label={collapsed ? '펼치기' : '접기'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="risk-compare__row">
            <div className="risk-compare">
              {side(left)}
              <span className="risk-compare__neq" aria-label="다름">≠</span>
              {side(right)}
            </div>
            {selected ? (
              <button type="button" className="risk-compare__action is-done" onClick={() => onClearChoice?.(group.key)}>
                <RotateCcw size={14} /> 선택 취소
              </button>
            ) : (
              <button type="button" className="risk-compare__action" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
                {editing ? '닫기' : <><PenLine size={14} /> 수정하기</>}
              </button>
            )}
          </div>
          {customPicked && (
            <p className="risk-compare__custom-picked"><CheckCircle2 size={13} /> 직접 입력한 값으로 통일: <strong>{selected}</strong></p>
          )}
          {editing && !selected && (
            <div className="risk-compare__edit">
              <p>맞는 쪽 값을 누르면 그 값으로 통일돼요. 둘 다 틀렸다면 직접 입력하세요.</p>
              <div className="risk-pick-custom">
                <input
                  className="form-input"
                  value={custom}
                  placeholder="둘 다 틀렸다면 직접 입력"
                  aria-label={`${group.label} 직접 입력`}
                  onChange={(event) => setCustom(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      applyCustom();
                    }
                  }}
                />
                <button type="button" className="risk-pick-apply" disabled={!custom.trim()} onClick={applyCustom}>적용</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RiskSummary({ risks, onToggle, onChoose, onClearChoice, onFix, onGoHs, onGoUpload, collapseAdvisories = false }: {
  risks: ImportRisk[];
  /** 화주 수입: '확인 권장' 목록을 처음엔 접어 두고 헤더를 눌러 펼친다 */
  collapseAdvisories?: boolean;
  onToggle?: (id: string) => void;
  /** 불일치 카드에서 맞는 값을 골랐을 때 */
  onChoose?: (key: string, value: string) => void;
  /** 고른 값 되돌리기 — 눌린 버튼을 다시 누르거나 [선택 취소] */
  onClearChoice?: (key: string) => void;
  /** 카드 안에서 값을 입력해 고쳤을 때 */
  onFix?: (target: ImportRiskFixTarget, value: string) => void;
  onGoHs?: (itemId: string, fromRiskId?: string) => void;
  onGoUpload?: () => void;
}) {
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [advisoriesOpen, setAdvisoriesOpen] = useState(!collapseAdvisories);
  // 수출 결과 페이지의 확인 항목과 같은 문법: 반드시 수정(high) / 확인 권장(그 외) 두 그룹.
  // 값을 이미 정한 항목은 '확인 필요'에서 빼고 따로 묶는다 — 다 정했는데 4건 남은 것처럼 보이지 않게.
  const pending = risks.filter((risk) => risk.status !== 'resolved');
  const settled = risks.filter((risk) => risk.status === 'resolved');
  const blockers = pending.filter((risk) => risk.level === 'high');
  const advisories = pending.filter((risk) => risk.level === 'medium' || risk.level === 'low');
  const nothingFound = pending.length === 0 && settled.length === 0;
  const [settledOpen, setSettledOpen] = useState(false);

  let advisorySeq = 0;
  let blockerSeq = 0;
  const renderCard = (risk: ImportRisk) => {
    const isBlocker = risk.level === 'high';
    const resolved = risk.status === 'resolved';
    const num = isBlocker ? ++blockerSeq : ++advisorySeq;
    const hasDetail = !!risk.differentValues?.length || !!risk.recommendation;
    // FTA 적용 안 함을 고른 카드는 흐리게 — 검토 완료는 화주가 직접 누른다.
    const dimmed = !resolved && risk.ftaChoice === 'FTA 적용 안 함';
    // 반드시 수정 중 서류 두 곳의 값이 다른 카드는 두 값을 나란히(≠) 보여주는 비교형으로 그린다.
    const compareGroup = isBlocker && onChoose && risk.pickGroups?.length === 1 && risk.pickGroups[0].choices.length === 2
      ? risk.pickGroups[0]
      : undefined;
    if (compareGroup && onChoose) {
      return (
        <BlockerCompareCard
          key={risk.id}
          risk={risk}
          num={num}
          group={compareGroup}
          onChoose={onChoose}
          onClearChoice={onClearChoice}
        />
      );
    }
    return (
      <div key={risk.id} id={`import-risk-${risk.id}`} className={`mobile-fix-card fix-card ${isBlocker ? 'sev-error' : 'sev-warning'}${resolved ? ' risk-resolved' : ''}${dimmed ? ' risk-dimmed' : ''}`}>
        <div className="fix-card__head">
          <span className={`fix-card__marker fix-card__marker--${isBlocker ? 'icon' : 'num'}`}>
            {isBlocker ? <FileText size={17} /> : num}
          </span>
          <div className="fix-card__text">
            <div className="fix-card__titlerow">
              <span className="fix-card__title">{cleanRiskTitle(risk.item)}</span>
              {displayRelatedDocuments(risk.relatedDocuments).slice(0, 3).map((doc) => (
                <span key={doc} className="fix-card__doc">{doc}</span>
              ))}
            </div>
            <p className="fix-card__desc">{risk.cause}</p>
            {onChoose && (!resolved || risk.chosen) && risk.pickGroups?.map((group) => {
              const customKey = `${risk.id}::${group.key}`;
              const custom = customValues[customKey] ?? '';
              const selected = group.selected;
              const selectedIsChoice = !!selected && group.choices.some((choice) => sameChoiceValue(selected, choice.value));
              return (
                <div key={group.key} className="risk-pick">
                  <span className="risk-pick-label">맞는 {group.label} 고르기</span>
                  <div className="risk-pick-choices">
                    {group.choices.map((choice) => {
                      const isSelected = !!selected && sameChoiceValue(selected, choice.value);
                      return (
                        <button
                          key={`${choice.source}-${choice.value}`}
                          type="button"
                          className={`risk-pick-choice${isSelected ? ' is-selected' : ''}`}
                          aria-pressed={isSelected}
                          onClick={() => (isSelected ? onClearChoice?.(group.key) : onChoose(group.key, choice.value))}
                        >
                          <em>{choice.source}</em>{choice.value}
                        </button>
                      );
                    })}
                    {selected && !selectedIsChoice && (
                      <button
                        type="button"
                        className="risk-pick-choice is-selected"
                        aria-pressed
                        onClick={() => onClearChoice?.(group.key)}
                      >
                        <em>직접 입력</em>{selected}
                      </button>
                    )}
                  </div>
                  <div className="risk-pick-custom">
                    <input
                      className="form-input"
                      value={custom}
                      placeholder="둘 다 틀렸다면 직접 입력"
                      aria-label={`${group.label} 직접 입력`}
                      onChange={(event) => setCustomValues((current) => ({ ...current, [customKey]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing && custom.trim()) {
                          event.preventDefault();
                          onChoose(group.key, custom);
                        }
                      }}
                    />
                    <button type="button" className="risk-pick-apply" disabled={!custom.trim()} onClick={() => onChoose(group.key, custom)}>
                      적용
                    </button>
                  </div>
                </div>
              );
            })}
            {(!resolved || risk.chosen) && risk.fixes?.map((fix, fixIndex) => {
              // 해결된 카드에서는 고른 선택(FTA)만 다시 바꿀 수 있게 남긴다.
              if (resolved && fix.kind !== 'fta') return null;
              if (fix.kind === 'hs') {
                return onGoHs ? (
                  <div key={`${risk.id}-hs`} className="risk-fix-actions">
                    <button type="button" className="risk-fix-link" onClick={() => onGoHs(fix.itemId, risk.id)}>HS Code 확정하러 가기 →</button>
                  </div>
                ) : null;
              }
              if (fix.kind === 'upload') {
                if (risk.ftaChoice === 'FTA 적용 요청') {
                  return (
                    <div key={`${risk.id}-upload`} className="risk-co-required" role="status">
                      <strong><AlertTriangle size={15} /> 원산지증명서(C/O)가 필요합니다</strong>
                      <span>FTA 협정세율을 적용하려면 원산지증명서를 서류로 추가해 주세요. 올리면 이 카드는 서류 대조 결과로 바뀝니다.</span>
                      {onGoUpload && (
                        <button type="button" className="btn btn-primary risk-co-required__btn" onClick={onGoUpload}>원산지증명서 올리러 가기 →</button>
                      )}
                    </div>
                  );
                }
                return onGoUpload ? (
                  <div key={`${risk.id}-upload`} className="risk-fix-actions">
                    <button type="button" className="risk-fix-link" onClick={onGoUpload}>서류 추가하러 가기 →</button>
                  </div>
                ) : null;
              }
              // FTA 선택은 3단계 'FTA 적용 여부' 카드에서 다룬다 — 카드에는 값 입력만 남긴다.
              if (fix.kind !== 'value' || !onFix) return null;
              const fixKey = `${risk.id}::fix${fixIndex}`;
              const draft = customValues[fixKey] ?? '';
              const setDraft = (value: string) => setCustomValues((current) => ({ ...current, [fixKey]: value }));
              return (
                <div key={fixKey} className="risk-pick">
                  <span className="risk-pick-label">{fix.label}</span>
                  {!!fix.choices?.length && (
                    <div className="risk-pick-choices">
                      {fix.choices.map((choice) => (
                        <button key={`${choice.source}-${choice.value}`} type="button" className="risk-pick-choice" onClick={() => onFix(fix.target, choice.value)}>
                          <em>{choice.source}</em>{choice.value}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="risk-pick-custom">
                    {fix.options ? (
                      <select className="form-input" value={draft} aria-label={fix.label} onChange={(event) => setDraft(event.target.value)}>
                        <option value="">선택하세요</option>
                        {fix.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        className="form-input"
                        value={draft}
                        placeholder={fix.placeholder ?? '값 입력'}
                        aria-label={fix.label}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft.trim()) {
                            event.preventDefault();
                            onFix(fix.target, draft);
                          }
                        }}
                      />
                    )}
                    <button type="button" className="risk-pick-apply" disabled={!draft.trim()} onClick={() => onFix(fix.target, draft)}>적용</button>
                  </div>
                </div>
              );
            })}
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
          {risk.autoResolved ? (
            <span className="risk-check-btn on"><CheckCircle2 size={14} /> 확정됨</span>
          ) : risk.chosen && onClearChoice ? (
            <button
              type="button"
              className="risk-check-btn on"
              onClick={() => {
                if (risk.ftaChoice) onClearChoice(FTA_CHOICE_KEY);
                risk.pickGroups?.forEach((group) => { if (group.selected) onClearChoice(group.key); });
              }}
            >
              <RotateCcw size={14} /> 선택 취소
            </button>
          ) : onToggle ? (
            <button
              type="button"
              className={`risk-check-btn${resolved ? ' on' : ''}`}
              onClick={() => onToggle(risk.id)}
            >
              {resolved ? <><RotateCcw size={14} /> 검토 취소</> : <><CheckCircle2 size={14} /> 검토 완료</>}
            </button>
          ) : resolved ? (
            <span className="risk-check-btn on" aria-hidden><CheckCircle2 size={14} /> 확인됨</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className="form-card import-card" id="import-risk-summary">
      <div className="import-card-heading">
        <div><h2>신고 전 확인사항</h2></div>
        <p>수입신고에 직접 영향을 주는 값만 확인합니다. 회사명·주소·연락처 같은 표기 차이는 확인 대상이 아닙니다.</p>
      </div>
      {nothingFound ? (
        <div className="risk-pass">
          <CheckCircle2 size={20} />
          <div>
            <strong>확인할 항목이 없습니다</strong>
            <p>관세사에게 보내기 전에 원본 서류와 한 번 더 대조하세요.</p>
          </div>
        </div>
      ) : (
        <div className="mobile-fix-list">
          {blockers.length > 0 && (
            <div className="sev-section-header sev-error">
              <span className="sev-section-icon"><OctagonAlert size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">확인 필요</span>
              <span className="sev-section-count">{blockers.length}</span>
            </div>
          )}
          {blockers.map(renderCard)}
          {advisories.length > 0 && (collapseAdvisories ? (
            <button
              type="button"
              className={`sev-section-header sev-warning sev-section-toggle${advisoriesOpen ? ' is-open' : ''}`}
              aria-expanded={advisoriesOpen}
              onClick={() => setAdvisoriesOpen((open) => !open)}
            >
              <span className="sev-section-icon"><AlertTriangle size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">참고 항목</span>
              <span className="sev-section-count">{advisories.length}</span>
              <span className="sev-section-toggle-hint">{advisoriesOpen ? '접기' : '펼쳐 보기'}<ChevronDown size={16} /></span>
            </button>
          ) : (
            <div className="sev-section-header sev-warning">
              <span className="sev-section-icon"><AlertTriangle size={17} strokeWidth={2.4} /></span>
              <span className="sev-section-label">참고 항목</span>
              <span className="sev-section-count">{advisories.length}</span>
            </div>
          ))}
          {advisoriesOpen && advisories.map(renderCard)}
          {settled.length > 0 && (
            <>
              <button
                type="button"
                className={`sev-section-header sev-section-toggle${settledOpen ? ' is-open' : ''}`}
                aria-expanded={settledOpen}
                onClick={() => setSettledOpen((open) => !open)}
              >
                <span className="sev-section-icon"><CheckCircle2 size={17} strokeWidth={2.4} /></span>
                <span className="sev-section-label">정한 항목</span>
                <span className="sev-section-count">{settled.length}</span>
                <span className="sev-section-toggle-hint">{settledOpen ? '접기' : '펼쳐 보기'}<ChevronDown size={16} /></span>
              </button>
              {settledOpen && settled.map(renderCard)}
            </>
          )}
        </div>
      )}
    </section>
  );
}
