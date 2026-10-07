import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForwarderReturnRequestContent from './ForwarderReturnRequestContent';
import { returnRequestChips } from '../../utils/returnRequestDocuments';
import '../../styles/returnRequest.css';
import { Download, Eye, RefreshCw, Search, Terminal } from 'lucide-react';
import ImportStepIndicator from './ImportStepIndicator';
import ImportDocumentUploader from './ImportDocumentUploader';
import {
  computeImportAnalysisCacheKey,
  loadImportAnalysisCache,
  saveImportAnalysisCache,
} from '../../services/importAnalysisCache';
import ImportAnalysisSummary from './ImportAnalysisSummary';
import DutySummary from './ImportDutySummary';
import RiskSummary from './ImportRiskSummary';
import {
  EMPTY,
  ImportFileResolutionError,
  hydrateImportDraft,
  importDraftFormData,
  loadCached,
  resolveImportAnalysisFiles,
  type CachedState,
} from './importDraftState';
import { importDraftCacheKey } from '../../utils/importDraftCacheKey';
import {
  downloadImportDeclarationFormDocx,
  mapImportDeclarationForm,
} from '../../services/importDeclarationFormService';
import ImportDeclarationFormPreview from './ImportDeclarationFormPreview';
import ImportHandoffReadyCard from './ImportHandoffReadyCard';
import { scrollPageToTop } from '../../utils/scrollPageToTop';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import {
  analyzeImportDocuments,
  fillImporterFromConsignee,
  IMPORT_DOCUMENT_TYPE_LABELS,
  normalizeImportExtractedFields,
  syncLegacyImportFields,
} from '../../services/importDocumentAnalysisService';
import { calculateEstimatedImportDuty } from '../../services/importDutyService';
import { assessFtaEligibility } from '../../services/ftaAgreementService';
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
import { duplicateImportDocumentsMessage, findDuplicateImportDocuments } from '../../utils/importDocumentDuplicates';
import { lookupImportCargo } from '../../services/cargoProgressService';
import { saveShipperReturnReply } from '../../services/forwarderCaseService';
import {
  hasValidStoragePath,
  importDocumentToAttachment,
} from '../../services/tradeDataMapper';
import {
  loadTradeAttachmentFile,
  moveTradeAttachmentsToScope,
  removeTradeAttachment,
  uploadTradeAttachment,
} from '../../services/tradeAttachmentStorageService';
import type {
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportDutyEstimate,
  ImportHSCodeSuggestion,
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
import type { SavedTrade } from '../../types';
import type { TradeDraftRow } from '../../services/draftCacheService';
import { deleteTradeDraft, isSubmittedTradeDraft, saveTradeFormDraft } from '../../services/draftCacheService';
import { useFormDataDraft } from '../../hooks/useFormDataDraft';
import DocumentManagerReadOnlyAction from '../DocumentManagerReadOnlyAction';

const IMPORT_DEMO_ENABLED = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_SUBMISSION === 'true';

interface Props {
  role: UserTradeRole;
  userId: string;
  importerCompanyName?: string;
  /** 서류에 수입자 연락처가 없을 때 신고서 납세의무자 칸을 채우는 회원 프로필 값 */
  importerContact?: { tel?: string; email?: string; address?: string; contactName?: string };
  onGenerate: (snapshot: ImportTradeSnapshot) => Promise<string>;
  onComplete: (snapshot: ImportTradeSnapshot) => Promise<SavedTrade>;
  onSaved?: (trade: SavedTrade) => void;
  onWorkspaceStateChange?: (state: { currentStep: number; tradeId: string | null }) => void;
  readOnly?: boolean;
  onClose?: () => void;
}

/**
 * 에이전트 진행 콘솔을 보여 주는 시간. 저장된 분석 결과를 다시 쓰거나 세액 계산이 금방 끝나면
 * 콘솔이 1~3초 만에 지나가 각 에이전트가 무엇을 했는지 읽을 틈이 없어, 이 시간에 걸쳐 나눠 보여 준다.
 */
const CONSOLE_PACE_MS = 7_500;
// 세액·신고자료 산출 콘솔은 시연 흐름을 끊지 않도록 짧게 — 실제 계산·저장이 더 걸리면 그만큼 기다린다.
const OUTPUT_CONSOLE_PACE_MS = 1_500;

export default function ImportTradeFlow({
  role,
  userId,
  importerCompanyName = '',
  importerContact,
  onGenerate,
  onComplete,
  onSaved,
  onWorkspaceStateChange,
  readOnly = false,
  onClose,
}: Props) {
  const cacheKey = importDraftCacheKey(userId, role);
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
  // (창 스크롤만 올리면 본문 컨테이너가 내려가 있는 경우 그대로 남는다)
  useEffect(() => {
    scrollPageToTop();
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
      // 같은 파일 묶음을 이미 분석했다면 그 실제 AI 결과를 다시 쓴다(서류 읽기·HS 추천 재실행 생략).
      const cacheKey = failures.length === 0
        ? await computeImportAnalysisCacheKey(analyzableDocuments, resolvedFiles, role)
        : null;
      const cached = cacheKey ? loadImportAnalysisCache(cacheKey.key, cacheKey.hashById) : null;
      let result;
      if (cached) {
        result = cached.result;
        // 저장된 실제 분석 결과를 에이전트별로 약 7.5초(CONSOLE_PACE_MS)에 걸쳐 차례로 보여 준다.
        // 문구는 모두 앞서 AI가 실제로 뽑아낸 값이며, 지금 다시 읽는 중이라고 표시하지 않는다.
        const replayStartedAt = Date.now();
        setAnalysisPhase({ label: '저장된 분석 결과 정리 중', startedAt: replayStartedAt });
        const ex = cached.result.analysis.extracted;
        const formatHsk = (code: string) => code.length === 10 ? `${code.slice(0, 4)}.${code.slice(4, 6)}-${code.slice(6)}` : code;
        const steps: Array<[string, string]> = [
          ['Orchestrator Agent', `같은 서류 ${analyzableDocuments.length}건의 AI 분석 이력을 확인했습니다 — 저장된 분석 결과로 진행합니다 (재분석 생략).`],
          ...cached.result.classifications.map((item): [string, string] => {
            const name = analyzableDocuments.find((document) => document.id === item.id)?.name ?? '서류';
            return ['Document Agent', `"${name}" → ${IMPORT_DOCUMENT_TYPE_LABELS[item.type] ?? item.type} 분류 확인`];
          }),
          ...(ex.invoiceNo || ex.totalAmount
            ? [['Document Agent', `상업송장: Invoice ${ex.invoiceNo || '-'} · ${ex.currency || ''} ${ex.totalAmount || '-'}`.trim()] as [string, string]]
            : []),
          ...(ex.blNo
            ? [['Document Agent', `선하증권: B/L ${ex.blNo}${ex.loadPort || ex.dischargePort ? ` · ${ex.loadPort || '-'} → ${ex.dischargePort || '-'}` : ''}`] as [string, string]]
            : []),
          ...(ex.totalPackageCount || ex.grossWeight
            ? [['Document Agent', `포장명세서: ${ex.totalPackageCount || '-'} ${ex.packageUnit || ''} · 총중량 ${ex.grossWeight || '-'} ${ex.grossWeightUnit || ''}`.replace(/\s+/g, ' ').trim()] as [string, string]]
            : []),
          ['Document Agent', `품목 ${ex.items.length}건 추출: ${ex.items.map((item) => item.description).filter(Boolean).join(', ') || '-'}`],
          ...cached.suggestions.map((suggestion): [string, string] => {
            const item = ex.items.find((candidate) => candidate.id === suggestion.itemId);
            return ['HSCode Agent', `${item?.description || '품목'} → HSK ${formatHsk(suggestion.code)} ${suggestion.description}`.trim()];
          }),
        ];
        const stepDelayMs = Math.floor(CONSOLE_PACE_MS / Math.max(1, steps.length));
        for (const [agent, line] of steps) {
          await new Promise((resolve) => setTimeout(resolve, stepDelayMs));
          pushAnalysisLog(agent, line, 'success');
        }
      } else {
        pushAnalysisLog('Document Agent', `AI가 서류 ${analyzableDocuments.length}건을 읽고 서로 대조하는 중이에요.`);
        const analysisStartedAt = Date.now();
        setAnalysisPhase({ label: '서류 분석 중', startedAt: analysisStartedAt });
        result = await analyzeImportDocuments(analyzableDocuments, resolvedFiles);
        pushAnalysisLog('Document Agent', `서류 분석 완료 (${elapsedSeconds(analysisStartedAt)}초)`, 'success');
      }
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
        // 서류에 수입자가 따로 없으면 Consignee로 채운다(분석 화면에 그 사실을 표시한다).
        extracted: fillImporterFromConsignee({
          ...result.analysis.extracted,
          certificateOfOriginAvailable: documents.some((document) => document.type === 'certificate_of_origin'),
        }),
      };
      let suggestions: ImportHSCodeSuggestion[] = cached?.suggestions ?? [];
      // 캐시에 추천 결과가 있으면 위 정리 단계에서 이미 보여 줬으니 다시 추천하지 않는다.
      if (!(cached && suggestions.length > 0) && role === 'shipper' && analysis.extracted.items.length > 0) {
        const hsStartedAt = Date.now();
        pushAnalysisLog('HSCode Agent', `품목 ${analysis.extracted.items.length}건의 대한민국 HS 코드를 추천하는 중이에요.`);
        setAnalysisPhase({ label: 'HS 코드 추천 중', startedAt: hsStartedAt, done: 0, total: analysis.extracted.items.length });
        suggestions = await recommendImportHSKForItems(analysis.extracted.items, (done, total) => {
          setAnalysisPhase((current) => (current ? { ...current, done, total } : current));
        });
        pushAnalysisLog('HSCode Agent', `HS 코드 추천 완료 (${elapsedSeconds(hsStartedAt)}초)`, 'success');
      }
      if (cacheKey && !cached) saveImportAnalysisCache(cacheKey.key, cacheKey.hashById, result, suggestions);
      setAnalysisPhase(null);
      // 자동 닫힘 없음 — 수출처럼 사용자가 [콘솔 닫기]를 눌러야 HSK 검토 화면이 보인다.
      pushAnalysisLog('Orchestrator Agent', '분석 완료 — 추출값을 분석 결과 폼에 반영했습니다. [콘솔 닫기]를 누르면 HSK 검토로 이동합니다.', 'success');
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
        incoterms: fields.incoterms,
        freight: fields.freight,
        insurance: fields.insurance,
        otherAdditions: fields.otherAdditions,
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
    // 세액·신고자료 산출도 Pipeline Runner 콘솔로 진행 상황을 보여준다.
    // 문구는 새 전제(검증이 아니라 신고자료 준비)를 따른다 — '불일치 점검' 표현을 쓰지 않는다.
    setAnalysisLogs([]);
    setShowAnalysisConsole(true);
    const consoleStartedAt = Date.now();
    let consoleStages: string[] = [];
    let consoleStageIndex = 0;
    pushAnalysisLog('Orchestrator Agent', '세액·신고자료 산출 파이프라인 가동 시작...');
    pushAnalysisLog('HSCode Agent', `품목 ${fields.items.length}건 HSK 코드 확정값 검증 완료`, 'success');
    {
      const stages = [
        '관세율 조회 · 예상세액 계산 중...',
        '수입신고서 초안 · 수입신고 의뢰서 구성 중...',
        '신고자료 완성도 점검 중 (필수 항목 채움 확인)...',
        '결과 저장 · 정리 중...',
      ];
      // 단계 문구를 OUTPUT_CONSOLE_PACE_MS에 걸쳐 나눠 띄운다. 계산이 먼저 끝나도 아래에서 이 시간을 채운 뒤
      // 남은 단계를 마저 띄우고 완료를 알린다 — 4단계 중 1~2단계만 보이고 끝나지 않게.
      consoleStages = stages;
      consoleStageIndex = 0;
      if (analysisTickerRef.current) clearInterval(analysisTickerRef.current);
      analysisTickerRef.current = setInterval(() => {
        if (consoleStageIndex < stages.length) pushAnalysisLog('Compliance Agent', stages[consoleStageIndex++]);
      }, Math.floor(OUTPUT_CONSOLE_PACE_MS / (stages.length + 1)));
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
          incoterms: fields.incoterms,
          freight: fields.freight,
          insurance: fields.insurance,
          otherAdditions: fields.otherAdditions,
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
      const remainingMs = OUTPUT_CONSOLE_PACE_MS - (Date.now() - consoleStartedAt);
      if (remainingMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingMs));
      if (analysisTickerRef.current) { clearInterval(analysisTickerRef.current); analysisTickerRef.current = null; }
      while (consoleStageIndex < consoleStages.length) pushAnalysisLog('Compliance Agent', consoleStages[consoleStageIndex++]);
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
    if (!state.generatedAt) return setMessage('신고자료를 먼저 생성해 주세요.');
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

  const ftaChoice = state.analysis?.chosenValues?.[FTA_CHOICE_KEY];
  const ftaReviewing = isFtaReviewChoice(ftaChoice);
  const coHolding = state.analysis?.chosenValues?.[CO_HOLDING_KEY] as CoHolding | undefined;
  const hasCertificateOfOrigin = state.documents.some((document) => document.type === 'certificate_of_origin');
  // FTA 적용 가능성 — 협정·협정세율·절감액은 예상세액 계산 때 함께 받아 두고, 증빙(C/O)은 여기서 본다.
  const ftaEligibility = useMemo(() => {
    if (!state.duty?.fta || !state.analysis) return null;
    const coRows = state.analysis.comparison.filter((row) => row.certificateOfOrigin && row.certificateOfOrigin !== '-');
    return assessFtaEligibility(state.duty.fta, {
      originCountry: state.analysis.extracted.items.map((item) => item.originCountry).filter(Boolean).join(', '),
      basicRate: state.duty.basicRate,
      basicDuty: state.duty.basicDuty,
      hasCertificateOfOrigin,
      certificateMismatches: hasCertificateOfOrigin && coRows.length ? coRows.filter((row) => !row.matches).length : null,
    });
  }, [state.duty, state.analysis, hasCertificateOfOrigin]);
  const clearRiskValue = (key: string) => setState((current) => (current.analysis ? {
    ...current,
    analysis: clearChosenValue(current.analysis, key),
  } : current));

  // 수입신고 의뢰서 — 관세사에게 넘기는 의뢰 양식. 신고서 초안과 같은 값으로 만든다.
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
    importerTel: importerContact?.tel,
    importerEmail: importerContact?.email,
    importerAddress: importerContact?.address,
    importerContactName: importerContact?.contactName,
  }), [state.analysis, state.duty, importerCompanyName, importerContact]);

  /** 미리보기에 얹을 값 — 다운로드 docx와 같은 매핑을 쓴다. */
  const declarationFormValues = useMemo(
    () => mapImportDeclarationForm(declarationFormData),
    [declarationFormData],
  );

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
              {returnRequestChips(state.reviseNotice).length > 0 && (
                <div className="rr-card-docs revise-notice-docs">
                  <span>보완 서류</span>
                  <ul>{returnRequestChips(state.reviseNotice).map((chip) => <li key={chip}>{chip}</li>)}</ul>
                </div>
              )}
              <div className="rr-content revise-notice-body">
                <ForwarderReturnRequestContent reason={state.reviseNotice.reason} />
              </div>
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
          {/* 화주 화면에는 준비 현황 체크리스트를 두지 않는다 — 바로 아래 HSK 확정 화면에서
              같은 값을 다시 보여주고 고치게 되어 있어 같은 정보가 두 번 나온다.
              신고자료 요약은 4단계에서 한 번만 보여준다. */}
          {role !== 'shipper' && (
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
                    </div>
                    <h4 className="import-hs-subheading">대한민국 HSK 자동추천</h4>
                    <div className="hs-suggestion-list">
                      {candidates.length === 0 ? <p className="import-empty">추천 근거가 부족하거나 후보가 없습니다. 직접 확인해 주세요.</p> : candidates.map((suggestion) => (
                        <label key={`${item.id}-${suggestion.code}`} className={`hs-suggestion ${item.confirmedHSCode === suggestion.code ? 'selected' : ''}`}>
                          <input type="radio" name={`import-hs-${item.id}`} checked={item.confirmedHSCode === suggestion.code} disabled={readOnly} onChange={() => selectRecommendedHS(item.id, suggestion.code)} />
                          <span>
                            <strong title={`${suggestion.code} · ${suggestion.description}`}>{suggestion.code} · {suggestion.description}</strong>
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
                <p>FTA 세율은 국가·HSK·원산지 요건 확인 후 적용됩니다. 확인 전에는 기본세율로 계산합니다.</p>
              </details>
            </div>
            <div className="import-fta-choices" role="group" aria-label="FTA 적용 여부">
              <button
                type="button"
                className={`btn import-fta-choice${ftaChoice === 'FTA 적용 안 함' ? ' is-selected' : ''}`}
                disabled={readOnly}
                onClick={() => (ftaChoice === 'FTA 적용 안 함' ? clearRiskValue(FTA_CHOICE_KEY) : chooseRiskValue(FTA_CHOICE_KEY, 'FTA 적용 안 함'))}
              >
                기본세율로 계산
              </button>
              <button
                type="button"
                className={`btn import-fta-choice${ftaReviewing ? ' is-selected' : ''}`}
                disabled={readOnly}
                onClick={() => (ftaReviewing ? clearRiskValue(FTA_CHOICE_KEY) : chooseRiskValue(FTA_CHOICE_KEY, FTA_REVIEW_CHOICE))}
              >
                FTA 적용 가능성 확인
              </button>
            </div>

            {ftaReviewing && (
              <div className="import-fta-review">
                {ftaEligibility ? (
                  <>
                    <div className={`import-fta-status import-fta-status--${ftaEligibility.status}`} role="status">
                      {ftaEligibility.label}
                    </div>
                    <ul className="import-fta-checks import-fta-checks--result">
                      {ftaEligibility.checks.map((check) => (
                        <li key={check.label} className={check.ok === true ? 'is-ok' : check.ok === false ? 'is-missing' : 'is-unknown'}>
                          <span>{check.label}</span> {check.value}
                        </li>
                      ))}
                      {state.duty?.fta?.notes.map((note) => <li key={note} className="is-unknown">{note}</li>)}
                    </ul>
                  </>
                ) : (
                  <p className="import-card-note">예상세액을 계산하면 협정과 협정세율을 함께 확인합니다.</p>
                )}
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
                  ? '기본 관세율로 계산합니다. 원산지증명서는 제출하지 않아도 됩니다.'
                  : 'PortAI는 협정 유무·HSK별 협정세율·원산지증명서 첨부 여부로 적용 가능성만 안내합니다. 최종 적용 여부는 원산지 결정기준과 증빙을 확인한 뒤 관세사와 확정하세요.'}
            </p>
          </section>
          <DutySummary
            duty={state.duty}
            error={state.dutyError}
            busy={dutyBusy}
            ftaReviewing={ftaReviewing}
            ftaEligibility={ftaEligibility}
            readOnly={readOnly}
            onRetry={() => {
              // 남아 있던 실패 사유를 지워야 자동 재계산 조건에도 다시 걸린다.
              setState((current) => ({ ...current, dutyError: '' }));
              void recalculateDuty();
            }}
          />
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
          <ImportHandoffReadyCard
            documentTypes={state.documents.map((document) => document.type)}
            fields={state.analysis.extracted}
            confirmedHsCodes={state.analysis.extracted.items.map((item) => item.confirmedHSCode)}
          />
          <section className="form-card import-card">
            <div className="import-card-heading"><div><h2>수입신고 의뢰서</h2></div></div>
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

          {readOnly && onClose ? <DocumentManagerReadOnlyAction
            onClose={onClose}
            className="import-actions"
            navigationAction={{
              label: '3단계 FTA·세액 확인 보기',
              onClick: () => moveToReadOnlyResultStep(3),
            }}
          /> : (
            <>
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
