import { useState, useEffect, useRef, Fragment } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  FolderKanban, 
  Layers,
  FileCheck2,
  BarChart3, 
  Settings, 
  PhoneCall, 
  Bell, 
  HelpCircle,
  RotateCcw,
  FileSignature,
  AlertTriangle,
  CheckCircle2,
  Terminal,
  Download,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Anchor,
  BookOpen,
  Pencil,
  ArrowRight,
  Calculator
} from 'lucide-react';
import {
  TradeProfile,
  DocumentStatus,
  ValidationIssue,
  SavedTrade,
  TradeStatus,
  InvoiceData,
  PackingListData,
  type ShipperItem,
  type ShipperSupplementalState,
  type FeedbackReport,
} from './types';
import './styles/feedbackReport.css';
import { buildInvoiceDocx, renderInvoiceDocxPreview } from './services/invoiceDocxService';
import { buildPackingListDocx, renderPackingListDocxPreview } from './services/packingListDocxService';
import SettingsPanel from './components/SettingsPanel';
import GuidePanel from './components/GuidePanel';
import AboutPanel from './components/AboutPanel';
import DataAnalysisPanel from './components/DataAnalysisPanel';
import DocumentManagerPanel from './components/DocumentManagerPanel';
import TradeManagerPanel from './components/TradeManagerPanel';
import CustomsHistoryPanel from './components/CustomsHistoryPanel';
import AuthPage from './components/AuthPage';
import OnboardingPage from './components/OnboardingPage';
import ProfileSettingsPage from './components/ProfileSettingsPage';
import ForwarderWorkspaceForm from './components/ForwarderWorkspaceForm';
import ShipperWorkspaceForm from './components/ShipperWorkspaceForm';
import OnboardingTour from './components/OnboardingTour';
import TradeDirectionSelector from './components/trade/TradeDirectionSelector';
import TradeRoleSelector from './components/trade/TradeRoleSelector';
import ImportShipperFlow from './components/import/ImportShipperFlow';
import ImportForwarderFlow from './components/import/ImportForwarderFlow';
import type { ImportTradeSnapshot, TradeDirection } from './types/importTrade';
import { deleteCurrentAccount, getCurrentAuthUser, markOnboardingCompleted, onAuthStateChange, signOutUser, type AuthSessionUser } from './services/authService';
import { useUserProfile } from './hooks/useUserProfile';
import { useTradeDraft } from './hooks/useTradeDraft';
import { removeDraftFromLocal } from './services/draftCacheService';
import { userProfileToTradeDefaults } from './services/profileService';
import {
  createPerfectTestProfile,
  createProfileForNewTrade,
  createNormalDocumentIdentifiers,
  createRevisionTestProfile,
  createTestSubmissionMeta,
  removeDevOnlyFields,
  type DevTestMode,
} from './services/devTestDataService';
import { DISCHARGE_PORT_OPTIONS, LOAD_PORT_OPTIONS } from './constants/ports';
import CountrySelect from './components/CountrySelect';
import { calculateReadiness } from './harness/rulesEngine';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import { AgentLog } from './agents/types';
import {
  createGeneratedTrade,
  createCompletedImportTrade,
  markTradeAsSubmitted,
  updateGeneratedTrade,
  getSettings
} from './services/storageService';
import { decideGeneratedTradeWrite } from './services/tradePersistencePolicy';
import { resolveWorkspaceRole, type WorkspaceRole } from './utils/workspaceRole';
import {
  EMPTY_SHIPPER_SUPPLEMENTAL_STATE,
  getGoodsDescriptionValidationMessage,
  primaryShipperItemToTradeProfile,
  tradeProfileToPrimaryShipperItem,
} from './utils/shipperForm';
import { createEmptyForwarderFormState, type ForwarderFormState } from './utils/forwarderForm';

const IS_DEV_TEST_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_SUBMISSION === 'true';

export default function App() {
  const [activeMenu, setActiveMenu] = useState('about');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [integratedWorkspaceRole, setIntegratedWorkspaceRole] = useState<WorkspaceRole>('shipper');
  const [tradeDirection, setTradeDirection] = useState<TradeDirection>('export');
  
 // Auth states
const [user, setUser] = useState<AuthSessionUser | null>(null);

  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const {
    profile: userProfile,
    isLoading: isProfileLoading,
    isSaving: isProfileSaving,
    error: profileError,
    needsOnboarding,
    reload: reloadUserProfile,
    saveProfile: saveUserProfile,
  } = useUserProfile(user?.id ?? null);

  useEffect(() => {
    if (userProfile?.service_role === 'integrated') setIntegratedWorkspaceRole('shipper');
  }, [user?.id, userProfile?.service_role]);

  const workspaceRole = resolveWorkspaceRole(userProfile?.service_role, integratedWorkspaceRole);

  const handleTradeDirectionChange = (direction: TradeDirection) => {
    setTradeDirection(direction);
    setProfile((current) => ({ ...current, tradeType: direction }));
  };

  const handleImportComplete = async (snapshot: ImportTradeSnapshot) => {
    await createCompletedImportTrade(snapshot);
    setActiveMenu('docs');
  };
/*
  // 첫 로그인 온보딩 (사용 목적·회사·업종) — 저장되면 다음 로그인부터 건너뜀
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [obPurpose, setObPurpose] = useState<'export' | 'import' | 'both' | ''>('');
  const [obCompany, setObCompany] = useState('');
  */
 /*
  const [obRole, setObRole] = useState('');

  // Mount logic: restore session
  useEffect(() => {
    const storedUser = localStorage.getItem('portai_user_session');
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        if (parsed.type === 'member') {
          setProfile(prev => ({
  ...prev,
  companyName: prev.companyName || '인천테크',
  companyAddress: prev.companyAddress || '인천광역시 연수구 송도동',
  companyCountry: prev.companyCountry || '대한민국',
  contact: prev.contact || '010-1234-5678',
  taxNo: prev.taxNo || '123-45-67890',
  businessRegistrationNo: prev.businessRegistrationNo || '123-45-67890',
  signedBy: prev.signedBy || '김지민',
  signerName: prev.signerName || 'Kim Jimin',
  signerPosition: prev.signerPosition || 'Export Manager'
}));
        }
      } catch (e) {
        localStorage.removeItem('portai_user_session');
        
      }
    }
  }, []);
  */

  useEffect(() => {
    let isMounted = true;

    getCurrentAuthUser()
      .then((currentUser) => {
        if (isMounted) setUser(currentUser);
      })
      .catch((error) => {
        console.error('[Supabase Auth] Failed to restore session:', error);
        if (isMounted) setUser(null);
      })
      .finally(() => {
        if (isMounted) setIsAuthLoading(false);
      });

    const { data: authListener } = onAuthStateChange((authUser) => {
      setUser(authUser);
      setIsAuthLoading(false);

      if (!authUser) {
        localStorage.removeItem('portai_user_session');
        handleReset();
      }
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);
  
  // 온보딩 정보를 반영해 실제 로그인 처리 (회사명 → 프로필·표시명, 사용 목적 → 수출입 기본값)
  /*
  const loginWithOnboarding = (ob: { purpose?: string; company?: string; role?: string }) => {
    const companyName = ob.company?.trim() || '인천테크';
    const memberUser = { name: companyName, type: 'member' as const };
    setUser(memberUser);
    localStorage.setItem('portai_user_session', JSON.stringify(memberUser));
    setProfile(prev => ({
      ...prev,
      tradeType: ob.purpose === 'import' ? 'import' : prev.tradeType,
      companyName,
      companyAddress: '인천광역시 연수구 송도동',
      companyCountry: '대한민국',
      contact: '010-1234-5678',
      taxNo: '123-45-67890',
      businessRegistrationNo: '123-45-67890',
      signedBy: '김지민',
      signerName: 'Kim Jimin',
      signerPosition: 'Export Manager'
    }));
    setShowOnboarding(false);
  };

  const handleMemberLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loginId || !loginPw) {
      alert('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    // 로그인 후 항상 맞춤 설정(온보딩) 단계를 거친다 — 조건부 스킵 없음
    setShowOnboarding(true);
  };

  const handleOnboardingComplete = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!obPurpose) {
      alert('사용 목적을 선택해주세요.');
      return;
    }
    loginWithOnboarding({ purpose: obPurpose, company: obCompany.trim(), role: obRole });
  };
*/
  const handleLogout = async () => {
    try {
      await flushTradeDraft();
    } catch (error) {
      // localStorage 초안은 이미 유지되므로 DB 실패가 로그아웃을 막지는 않습니다.
      console.warn('[Trade Draft] 로그아웃 전 마지막 저장 실패:', error);
    }

    try {
      await signOutUser();
    } catch (error) {
      console.error('[Supabase Auth] Logout failed:', error);
      alert('로그아웃 중 오류가 발생했습니다.');
    }
  };
  
  // Trade profile state
const emptyProfile: TradeProfile = {
  tradeType: 'export',
  documentNo: '',
  invoiceNo: '',
  invoiceDate: '',
  referenceNo: '',
  otherReferences: '',

  blNo: '',
  issuePlace: '',
  issueDate: '',

  itemName: '',
  hsCode: '',
  countryOfOrigin: '',
  quantity: '',
  unit: 'EA',

  currency: 'USD',
  unitPrice: '',
  totalAmount: '',
  invoiceAmount: '',

  packageCount: '',
  packageType: '',
  netWeight: '',
  grossWeight: '',
  weight: '',
  measurement: '',
  shippingMarks: '',

  loadPort: '',
  dischargePort: '',
  departureDate: '',
  arrivalDate: '',
  vesselOrFlight: '',
  carrier: '',

  placeOfReceipt: '',
  placeOfDelivery: '',
  finalDestination: '',
  voyageNo: '',
  flag: '',

  containerNo: '',
  sealNo: '',

  incoterms: '',
  paymentTerms: '',
  reasonForExport: '',
  freightTerms: '',
  freightCharges: '',
  freightPrepaidAt: '',
  freightPayableAt: '',

  companyName: '',
  companyAddress: '',
  companyCountry: '',
  contact: '',
  taxNo: '',
  businessRegistrationNo: '',

  partnerName: '',
  partnerAddress: '',
  partnerCountry: '',
  partnerContact: '',

  buyerName: '',
  buyerAddress: '',
  buyerCountry: '',

  notifyPartyName: '',
  notifyPartyAddress: '',
  notifyPartyContact: '',

  signedBy: '',
  signerName: '',
  signerPosition: ''
};

const [profile, setProfile] = useState<TradeProfile>(emptyProfile);
  const [forwarderForm, setForwarderForm] = useState<ForwarderFormState>(() => createEmptyForwarderFormState());

  const tradeDraftDefaultProfile: TradeProfile = {
    ...emptyProfile,
    ...(userProfile ? userProfileToTradeDefaults(userProfile) : {}),
  };
  const {
    saveStatus: draftSaveStatus,
    lastSavedAt: draftLastSavedAt,
    flushDraft: flushTradeDraft,
    completeDraft,
    startNewDraft,
    pauseDraftSaving,
  } = useTradeDraft({
    userId: user?.id ?? null,
    enabled: tradeDirection === 'export' && Boolean(user && userProfile && !needsOnboarding && !user.onboardingPending),
    tradeDirection,
    tradeRole: workspaceRole,
    profile,
    defaultProfile: tradeDraftDefaultProfile,
    setProfile,
  });
  // Harness & Agent Pipeline State
  const [isProcessing, setIsProcessing] = useState(false);
  const [devTestMode, setDevTestMode] = useState<DevTestMode | null>(null);
  const [devTestMessage, setDevTestMessage] = useState('');
  const [showConsole, setShowConsole] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<AgentLog[]>([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  // 정책 연결: error만 차단(overridable면 사유 입력 시 우회), warning은 배지.
  const [overrides, setOverrides] = useState<Record<string, string>>({}); // issueKey → 사유
  const [overrideTarget, setOverrideTarget] = useState<ValidationIssue | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const blockedGenRef = useRef<{ result: any; generationProfile: TradeProfile; writeMode: ReturnType<typeof decideGeneratedTradeWrite> } | null>(null);
  const issueKey = (i: ValidationIssue) => `${i.id}::${String(i.field)}`;
  // 미해결 차단 이슈 = error 중 (overridable+사유입력)으로 우회되지 않은 것
  const unresolvedBlockers = (list: ValidationIssue[], ov: Record<string, string>) =>
    list.filter(i => i.severity === 'error' && !(i.overridable && ov[issueKey(i)]));
  const [, setAiFeedback] = useState<string>('');
  const [feedbackReport, setFeedbackReport] = useState<FeedbackReport | null>(null);
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [htmlTemplates, setHtmlTemplates] = useState<Record<string, string>>({});
  // 상업송장은 고정 docx 템플릿에서 생성한다. 구조 데이터를 보관하고, 생성된 Blob을 캐시해
  // 미리보기와 다운로드가 "동일 바이너리"를 쓰게 한다.
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const invoiceDocxCacheRef = useRef<{ sig: string; blob: Blob } | null>(null);
  const docxPreviewRef = useRef<HTMLDivElement | null>(null);

  // 패킹리스트도 고정 docx 템플릿에서 생성 — 미리보기/다운로드가 동일 바이너리(같은 Blob).
  const [packingListData, setPackingListData] = useState<PackingListData | null>(null);
  const packingXlsxCacheRef = useRef<{ sig: string; blob: Blob } | null>(null);
  const packingDocxPreviewRef = useRef<HTMLDivElement | null>(null);

  // 같은 InvoiceData면 같은 Blob 반환(캐시) → 화면 미리보기와 다운로드 파일이 동일 바이너리.
  const getInvoiceBlob = async (): Promise<Blob | null> => {
    if (!invoiceData) return null;
    const sig = JSON.stringify(invoiceData);
    if (invoiceDocxCacheRef.current?.sig === sig) return invoiceDocxCacheRef.current.blob;
    const blob = await buildInvoiceDocx(invoiceData);
    invoiceDocxCacheRef.current = { sig, blob };
    return blob;
  };

  // 같은 PackingListData면 같은 docx Blob 반환(캐시) → 미리보기와 다운로드가 동일 바이너리.
  const getPackingListBlob = async (): Promise<Blob | null> => {
    if (!packingListData) return null;
    const sig = JSON.stringify(packingListData);
    if (packingXlsxCacheRef.current?.sig === sig) return packingXlsxCacheRef.current.blob;
    const blob = await buildPackingListDocx(packingListData);
    packingXlsxCacheRef.current = { sig, blob };
    return blob;
  };

  // 문서 생성 여부: 상업송장=invoiceData, 패킹리스트=packingListData, 나머지=htmlTemplates로 판정
  const hasDoc = (id: string) =>
    id === 'invoice' ? !!invoiceData : id === 'packing_list' ? !!packingListData : !!htmlTemplates[id];

  // 미리보기 모달에서 상업송장은 생성된 docx를 그대로 렌더(다운로드와 동일 소스)
  useEffect(() => {
    if (previewDocId !== 'invoice' || !invoiceData) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await getInvoiceBlob();
        const host = docxPreviewRef.current;
        if (!blob || cancelled || !host) return;
        await renderInvoiceDocxPreview(blob, host);
      } catch {
        const host = docxPreviewRef.current;
        if (host) host.innerHTML = '<p style="padding:16px;color:#b91c1c;">상업송장 미리보기 생성에 실패했습니다.</p>';
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDocId, invoiceData]);

  // 패킹리스트도 생성된 docx를 그대로 렌더(다운로드와 동일 소스)
  useEffect(() => {
    if (previewDocId !== 'packing_list' || !packingListData) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await getPackingListBlob();
        const host = packingDocxPreviewRef.current;
        if (!blob || cancelled || !host) return;
        await renderPackingListDocxPreview(blob, host);
      } catch {
        const host = packingDocxPreviewRef.current;
        if (host) host.innerHTML = '<p style="padding:16px;color:#b91c1c;">패킹리스트 미리보기 생성에 실패했습니다.</p>';
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewDocId, packingListData]);

  // Mobile simulator inputs
  const [mobileWeight, setMobileWeight] = useState('');
  const [mobileHSCode, setMobileHSCode] = useState('');
  const [mobileOrigin, setMobileOrigin] = useState('');
  const [hsCandidates, setHsCandidates] = useState<{ code: string; description: string; confidence: string; reasoning: string; }[]>([]);

  // "입력 화면에서 수정" — 이슈가 가리키는 입력 필드로 이동해 강조 + 무엇을 고칠지 안내
  const [highlightField, setHighlightField] = useState<string | null>(null);
  const [highlightHint, setHighlightHint] = useState<string>('');
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이슈 → 입력 폼 data-field 키. 전용 필드명이 다른 경우만 보정.
  const issueToFieldKey = (issue: ValidationIssue): string => {
    const f = String(issue.field);
    if (f === 'invoiceAmount') return 'totalAmount';
    return f;
  };

  const clearFieldHighlight = () => {
    if (highlightTimerRef.current) { clearTimeout(highlightTimerRef.current); highlightTimerRef.current = null; }
    document.querySelectorAll('.field-focus').forEach((e) => e.classList.remove('field-focus'));
    setHighlightField(null);
    setHighlightHint('');
  };

  const goToFieldFix = (issue: ValidationIssue) => {
    setHighlightHint(issue.message);
    setHighlightField(issueToFieldKey(issue));
    setHasGenerated(false);
  };

  // 입력 화면으로 전환되면 해당 필드로 스크롤 + 강조 표시. (5초 후 자동 해제)
  useEffect(() => {
    if (hasGenerated || !highlightField) return;
    const raf = requestAnimationFrame(() => {
      document.querySelectorAll('.field-focus').forEach((e) => e.classList.remove('field-focus'));
      const el = document.querySelector<HTMLElement>(`[data-field="${highlightField}"]`);
      if (!el) return;
      // 접힌 상세(details) 안이면 펼쳐서 보이게 한다
      let p: HTMLElement | null = el.parentElement;
      while (p) { if (p.tagName === 'DETAILS') (p as HTMLDetailsElement).open = true; p = p.parentElement; }
      el.classList.add('field-focus');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el.querySelector<HTMLElement>('input, select, textarea');
      if (input) setTimeout(() => input.focus({ preventScroll: true }), 320);
    });
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      document.querySelectorAll('.field-focus').forEach((e) => e.classList.remove('field-focus'));
      setHighlightField(null);
      setHighlightHint('');
    }, 5000);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightField, hasGenerated]);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const currentTradeIdRef = useRef<string | null>(null);
  const [currentTradeStatus, setCurrentTradeStatus] = useState<TradeStatus | null>(null);
  const isSubmittingTradeRef = useRef(false);
  const hasSubmittedTradeRef = useRef(false);

  // 재검증(rerunAgents) 동시 실행 제어 — 마지막 요청의 결과만 반영한다
  const rerunSeqRef = useRef(0);
  const [isRevalidating, setIsRevalidating] = useState(false);

  // Auto-scroll console logs
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Synchronize mobile states when issues change
  useEffect(() => {
    const weightIssue = issues.find(i => i.field === 'weight');
    if (!weightIssue) {
      setMobileWeight('');
    }
    const hsIssue = issues.find(i => i.field === 'hsCode');
    if (!hsIssue) {
      setMobileHSCode('');
    }
    const coIssue = issues.find(i => i.docType === 'co');
    if (!coIssue) {
      setMobileOrigin('');
    }
  }, [issues]);

  const handleInputChange = (field: keyof TradeProfile, value: string | number) => {
    setProfile(prev => {
      // 수출↔수입 전환 시 선적항·도착항 방향도 자연스럽게 뒤집는다
      // (예: 수출 부산 → 상하이를 수입으로 바꾸면 상하이 → 부산).
      if (field === 'tradeType' && value !== prev.tradeType && prev.loadPort && prev.dischargePort) {
        const swappable =
          LOAD_PORT_OPTIONS.some(p => p.value === prev.dischargePort) &&
          DISCHARGE_PORT_OPTIONS.some(p => p.value === prev.loadPort);
        if (swappable) {
          return { ...prev, tradeType: value as TradeProfile['tradeType'], loadPort: prev.dischargePort, dischargePort: prev.loadPort };
        }
      }
      return { ...prev, [field]: value };
    });
  };

  const shipperItems = profile.shipperItems?.length
    ? profile.shipperItems
    : [tradeProfileToPrimaryShipperItem(profile)];
  const shipperSupplemental: ShipperSupplementalState = {
    ...EMPTY_SHIPPER_SUPPLEMENTAL_STATE,
    ...profile.shipperSupplemental,
  };
  const handleShipperItemsChange = (items: ShipperItem[]) => {
    if (items.length === 0) return;
    const [primaryItem] = items;
    setProfile((current) => ({
      ...current,
      ...primaryShipperItemToTradeProfile(primaryItem),
      shipperItems: items,
    }));
  };

  const handleFillPerfectTestData = () => {
    if (!IS_DEV_TEST_ENABLED || isProcessing) return;
    setProfile((current) => createPerfectTestProfile(current));
    setDevTestMode('perfect');
    setDevTestMessage('완성형 테스트 데이터가 입력되었습니다. 내용을 확인한 뒤 필요 서류 자동생성을 직접 눌러주세요.');
  };

  const handleFillRevisionTestData = () => {
    if (!IS_DEV_TEST_ENABLED || isProcessing) return;
    setProfile((current) => createRevisionTestProfile(current));
    setDevTestMode('needs_revision');
    setDevTestMessage('수정이 필요한 테스트 데이터가 입력되었습니다. 내용을 수정한 뒤 필요 서류 자동생성을 직접 눌러주세요.');
  };

  const handleDisableDevTestMode = () => {
    setDevTestMode(null);
    setProfile((current) => removeDevOnlyFields(current));
    setDevTestMessage('테스트 모드가 해제되었습니다. 거래 입력값은 유지되며 테스트 전용 표시가 제거되고 일반 검증 규칙이 적용됩니다.');
  };

  const handleReset = () => {
  startNewDraft();
  setDevTestMode(null);
  setDevTestMessage('');
 setProfile({
   ...emptyProfile,
   ...(userProfile ? userProfileToTradeDefaults(userProfile) : {}),
 });
  setForwarderForm(createEmptyForwarderFormState());
  setHasGenerated(false);
  setDocuments([]);
  setIssues([]);
  setConsoleLogs([]);
  setHtmlTemplates({});
  setInvoiceData(null);
  invoiceDocxCacheRef.current = null;
  setPackingListData(null);
  packingXlsxCacheRef.current = null;
  setHsCandidates([]);
  currentTradeIdRef.current = null;
  setCurrentTradeStatus(null);
  isSubmittingTradeRef.current = false;
  hasSubmittedTradeRef.current = false;
  setAiFeedback('');
  setFeedbackReport(null);
  setMobileWeight('');
  setMobileHSCode('');
  setMobileOrigin('');
};

  // Run the multi-agent pipeline simulator
  // 차단 없음(또는 override 완료) 시 문서 공개 + 저장. override 사유를 결과에 기록.
  const finalizeGeneration = async (
    result: any,
    generationProfile: TradeProfile,
    writeMode: ReturnType<typeof decideGeneratedTradeWrite>,
    ov: Record<string, string>
  ) => {
    setHtmlTemplates(result.documents?.htmlTemplates || {});
    setInvoiceData(result.documents?.generatedDocs?.invoice || null);
    invoiceDocxCacheRef.current = null;
    setPackingListData(result.documents?.generatedDocs?.packingList || null);
    packingXlsxCacheRef.current = null;
    setHasGenerated(true);
    blockedGenRef.current = null;

    const issuesList: ValidationIssue[] = result.issues?.issues || [];
    const overrideRecords = issuesList
      .filter(i => i.severity === 'error' && i.overridable && ov[issueKey(i)])
      .map(i => ({ id: i.id, field: String(i.field), reason: ov[issueKey(i)] }));

    try {
      const generatedTradeData = {
        profile: { ...generationProfile, hsCode: generationProfile.hsCode || result.hs?.topCode || '' },
        tradeDirection: 'export' as const,
        tradeRole: workspaceRole,
        documents: result.documents?.documents || [],
        issues: issuesList,
        generatedDocs: {
          htmlTemplates: result.documents?.htmlTemplates || {},
          invoice: result.documents?.generatedDocs?.invoice,
          packingList: result.documents?.generatedDocs?.packingList,
          overrides: ov,
          overrideRecords,
        },
      };
      if (writeMode === 'insert') {
        const createdTrade = await createGeneratedTrade(generatedTradeData);
        currentTradeIdRef.current = createdTrade.id;
        alert(overrideRecords.length > 0
          ? `필요 서류가 생성·저장되었습니다. (경고 ${overrideRecords.length}건이 사유 기록 후 무시 처리됨)`
          : '필요 서류가 생성되고 새로운 거래가 저장되었습니다.');
      } else {
        const currentTradeId = currentTradeIdRef.current;
        if (!currentTradeId) throw new Error('현재 거래 ID가 없습니다.');
        const updatedTrade = await updateGeneratedTrade(currentTradeId, generatedTradeData);
        if (updatedTrade.id !== currentTradeId) throw new Error('재생성된 거래 ID가 현재 거래와 일치하지 않습니다.');
        alert(overrideRecords.length > 0
          ? `필요 서류가 다시 생성되었습니다. (경고 ${overrideRecords.length}건이 사유 기록 후 무시 처리됨)`
          : '수정된 내용으로 필요 서류가 다시 생성되었으며 기존 거래가 업데이트되었습니다.');
      }
      setCurrentTradeStatus('generated');
      hasSubmittedTradeRef.current = false;
      await completeDraft().catch((error) => {
        console.warn('[Trade Draft] 거래 저장 후 초안 정리 실패:', error);
      });
    } catch (err) {
      console.error('[Trade Generation] generated trade persistence failed:', err);
      alert(writeMode === 'update'
        ? '필요 서류는 생성되었지만 기존 거래 업데이트에 실패했습니다. 다시 시도해주세요.'
        : '필요 서류는 생성되었지만 새로운 거래 저장에 실패했습니다. 다시 시도해주세요.');
    }
  };

  // override 사유 확정 → 기록. 생성이 차단 상태였고 남은 차단이 없으면 자동으로 생성 확정.
  const confirmOverride = () => {
    if (!overrideTarget) return;
    const reason = overrideReason.trim();
    if (!reason) { alert('사유를 입력하세요.'); return; }
    const nextOv = { ...overrides, [issueKey(overrideTarget)]: reason };
    setOverrides(nextOv);
    setOverrideTarget(null);
    setOverrideReason('');
    const blocked = blockedGenRef.current;
    if (blocked) {
      const remaining = unresolvedBlockers(blocked.result.issues?.issues || [], nextOv);
      if (remaining.length === 0) {
        void finalizeGeneration(blocked.result, blocked.generationProfile, blocked.writeMode, nextOv);
      }
    }
  };

  const handleGenerateDocuments = async () => {
    if (isProcessing) return;
    const goodsDescriptionError = getGoodsDescriptionValidationMessage(shipperItems);
    if (goodsDescriptionError) {
      alert(goodsDescriptionError);
      return;
    }
    const writeMode = decideGeneratedTradeWrite(currentTradeIdRef.current, currentTradeStatus);
    if (hasSubmittedTradeRef.current || writeMode === 'blocked_submitted') {
      alert('이미 최종 제출된 거래입니다. 수정하려면 신규 거래 복사를 이용해주세요.');
      return;
    }
    setIsProcessing(true);
    setShowConsole(true);
    setConsoleLogs([]);
    setOverrides({});           // 재생성 = 새 검증. 이전 override 초기화.
    blockedGenRef.current = null;

    try {
      // 테스트/일반 입력 모두 같은 문서번호 규칙을 사용하며 레거시 DEV/TEST 식별자는 저장하지 않습니다.
      const generationProfile = createNormalDocumentIdentifiers(profile);
      setProfile(generationProfile);
      const orchestrator = new OrchestratorAgent();
      const result = await orchestrator.run({ profile: generationProfile, useLLM: getSettings().useLLM });

      // Simulate terminal printing for all logs chronologically
      for (let i = 0; i < result.logs.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        setConsoleLogs(prev => [...prev, result.logs[i]]);
      }

      if (result.error) {
        alert(`에이전트 파이프라인 처리 중 오류가 발생했습니다: ${result.error.message}`);
        return;
      }

      setProfile(prev => ({
        ...prev,
        hsCode: prev.hsCode || result.hs?.topCode || ''
      }));
      setDocuments(result.documents?.documents || []);
      setIssues(result.issues?.issues || []);
      setAiFeedback(result.feedback?.message || '');
      setFeedbackReport(result.feedback?.report || null);
      setHsCandidates(result.hs?.candidates || []);

      // 정책: error(미해결)만 생성 차단. warning은 통과(배지). 사유 override된 error는 우회.
      const issuesList: ValidationIssue[] = result.issues?.issues || [];
      const canBypass = IS_DEV_TEST_ENABLED && devTestMode !== null;
      const blockers = unresolvedBlockers(issuesList, overrides);
      if (blockers.length > 0 && !canBypass) {
        // 차단이라도 파이프라인이 조립한 초안 문서는 볼 수 있게 공개한다(미리보기·다운로드).
        // 단, 최종 제출·거래 저장은 막는다: blockedGenRef 유지 + "전체 문서 전송"은 blockingIssuesCount로 비활성.
        setHtmlTemplates(result.documents?.htmlTemplates || {});
        setInvoiceData(result.documents?.generatedDocs?.invoice || null);
        invoiceDocxCacheRef.current = null;
        setPackingListData(result.documents?.generatedDocs?.packingList || null);
        packingXlsxCacheRef.current = null;
        setHasGenerated(true);
        blockedGenRef.current = { result, generationProfile, writeMode };
        const overridable = blockers.filter((blocker) => blocker.overridable).length;
        alert(
          `초안이 생성되었습니다. 제출 전 해결해야 할 오류 ${blockers.length}건이 있어요 — 미리보기·다운로드는 가능하지만 최종 제출은 보류됩니다.` +
          (overridable > 0
            ? `\n(그중 ${overridable}건은 아래 검증 결과에서 "경고 무시하고 생성"으로 진행 가능)`
            : '')
        );
        return;
      }

      await finalizeGeneration(result, generationProfile, writeMode, overrides);
    } catch (error) {
      console.error(error);
      alert('에이전트 파이프라인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // [문서 관리]에서 저장 이력 복원
  const handleLoadSavedTrade = (t: SavedTrade) => {
    const importSnapshot = t.generatedDocs?.importTrade as ImportTradeSnapshot | undefined;
    if ((t.tradeDirection ?? t.profile.tradeType) === 'import' && importSnapshot && user) {
      setTradeDirection('import');
      setIntegratedWorkspaceRole(importSnapshot.role);
      localStorage.setItem(`portai_import_draft:${user.id}:${importSnapshot.role}`, JSON.stringify({
        step: 3,
        documents: importSnapshot.documents,
        analysis: importSnapshot.analysis,
        suggestions: importSnapshot.selectedHSCode ? [importSnapshot.selectedHSCode] : [],
        selectedCode: importSnapshot.selectedHSCode?.code ?? '',
        duty: importSnapshot.duty ?? null,
        risks: importSnapshot.risks,
        cargo: importSnapshot.cargo ?? null,
        arrivalNotice: (t.arrivalNotice as import('./types/importTrade').ArrivalNoticeMeta | null) ?? importSnapshot.arrivalNotice ?? null,
        generatedAt: importSnapshot.generatedAt ?? t.generatedAt ?? null,
        tradeId: t.id,
        existingStatus: t.status,
      }));
      setActiveMenu('dashboard');
      return;
    }
    setTradeDirection('export');
    pauseDraftSaving();
    setDevTestMode(null);
    setDevTestMessage('');
    currentTradeIdRef.current = t.id;
    setCurrentTradeStatus('submitted');
    hasSubmittedTradeRef.current = true;
    setProfile(t.profile);
    setDocuments(t.documents);
    setIssues(t.issues);
    setHtmlTemplates((t.generatedDocs?.htmlTemplates as Record<string, string>) || {});
    setInvoiceData((t.generatedDocs?.invoice as InvoiceData) || null);
    invoiceDocxCacheRef.current = null;
    setPackingListData((t.generatedDocs?.packingList as PackingListData) || null);
    packingXlsxCacheRef.current = null;
    setOverrides((t.generatedDocs?.overrides as Record<string, string>) || {});
    blockedGenRef.current = null;
    setAiFeedback('');
    setFeedbackReport(null);
    setHsCandidates([]);
    setHasGenerated(true);
    setActiveMenu('dashboard');
  };

  const handleCopySavedTrade = (t: SavedTrade) => {
    const importSnapshot = t.generatedDocs?.importTrade as ImportTradeSnapshot | undefined;
    if ((t.tradeDirection ?? t.profile.tradeType) === 'import' && importSnapshot && user) {
      const role = importSnapshot.role;
      setTradeDirection('import');
      setIntegratedWorkspaceRole(role);
      localStorage.setItem(`portai_import_draft:${user.id}:${role}`, JSON.stringify({
        step: 1,
        documents: importSnapshot.documents,
        analysis: null,
        suggestions: [],
        selectedCode: '',
        duty: null,
        risks: [],
        cargo: null,
        arrivalNotice: null,
        generatedAt: null,
      }));
      setActiveMenu('dashboard');
      return;
    }
    setTradeDirection('export');
    startNewDraft();
    setProfile(createProfileForNewTrade(t.profile));
    setDocuments([]);
    setIssues([]);
    setHtmlTemplates({});
    setInvoiceData(null);
    invoiceDocxCacheRef.current = null;
    setPackingListData(null);
    packingXlsxCacheRef.current = null;
    setAiFeedback('');
    setFeedbackReport(null);
    setHsCandidates([]);
    setHasGenerated(false);
    setDevTestMode(null);
    setDevTestMessage('');
    currentTradeIdRef.current = null;
    setCurrentTradeStatus(null);
    isSubmittingTradeRef.current = false;
    hasSubmittedTradeRef.current = false;
    setActiveMenu('dashboard');
  };

  // Re-run validation helper (e.g. after fixing something in mobile view)
  // 실행 순번(seq)으로 동시 실행을 제어 — 늦게 도착한 낡은 결과가 최신 결과를 덮어쓰지 않는다.
  const rerunAgents = async (updatedProfile: TradeProfile) => {
    const seq = ++rerunSeqRef.current;
    setIsRevalidating(true);
    try {
      const orchestrator = new OrchestratorAgent();
      const result = await orchestrator.run({ profile: updatedProfile, useLLM: getSettings().useLLM });

      if (seq !== rerunSeqRef.current) return; // 더 최신 재검증이 시작됨 — 이 결과는 폐기

      if (result.error) {
        console.error('에이전트 재실행 중 오류:', result.error.message);
        alert(`재검증 중 오류가 발생했습니다: ${result.error.message}\n입력값은 반영되어 있으니 잠시 후 다시 시도해 주세요.`);
        return;
      }

      setDocuments(result.documents?.documents || []);
      setHtmlTemplates(result.documents?.htmlTemplates || {});
      setInvoiceData(result.documents?.generatedDocs?.invoice || null);
      invoiceDocxCacheRef.current = null;
      setPackingListData(result.documents?.generatedDocs?.packingList || null);
      packingXlsxCacheRef.current = null;
      setIssues(result.issues?.issues || []);
      setAiFeedback(result.feedback?.message || '');
      setFeedbackReport(result.feedback?.report || null);
      setHsCandidates(result.hs?.candidates || []);
    } catch (error) {
      if (seq === rerunSeqRef.current) {
        console.error(error);
        alert('재검증 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      if (seq === rerunSeqRef.current) {
        setIsRevalidating(false);
      }
    }
  };

  // Mobile quick fix solvers
  const handleSolveWeight = async () => {
    if (!mobileWeight || isNaN(Number(mobileWeight))) return;
    
    const updatedProfile = {
      ...profile,
      weight: Number(mobileWeight)
    };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const handleSolveHSCode = async () => {
    if (!mobileHSCode) return;

    const updatedProfile = {
      ...profile,
      hsCode: mobileHSCode
    };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const handleSolveOrigin = async () => {
    if (!mobileOrigin) return;

    const updatedProfile = {
      ...profile,
      countryOfOrigin: mobileOrigin,
      coIssuanceConfirmed: true
    };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const handleSolveInsurance = async () => {
    const updatedProfile = {
      ...profile,
      insuranceConfirmed: true
    };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const getDocFileName = (docId: string) => {
    const labels: Record<string, string> = {
      invoice: 'Invoice',
      packing_list: 'PackingList',
      co: 'CO',
      bl: 'BL',
      customs_dec: 'CustomsDeclaration',
      insurance: 'InsurancePolicy',
    };
    const docTypeLabel = labels[docId] ?? docId;
    const company = profile.companyName || 'ExportCo';
    const dateStr = (profile.departureDate || new Date().toISOString().split('T')[0]).replace(/[-]/g, '');
    return `${docTypeLabel}_${company}_${dateStr}.pdf`;
  };

  // 상업송장 docx Blob을 브라우저 인쇄로 PDF 저장 — 미리보기와 같은 docx-preview 렌더를 인쇄 iframe에 그려
  // 벡터(텍스트 선택·추출 가능) PDF로 뽑는다. (정적 호스팅이라 서버 soffice 변환은 불가 → 클라이언트 인쇄 사용.)
  const printInvoiceAsPdf = async (blob: Blob) => {
    const title = getDocFileName('invoice').replace(/\.pdf$/i, '').replace(/[<>"'&]/g, '');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
    document.body.appendChild(iframe);

    const idoc = iframe.contentWindow?.document;
    if (!idoc) {
      document.body.removeChild(iframe);
      alert('PDF 인쇄 창 생성에 실패했습니다. 다시 시도해 주세요.');
      return;
    }
    // docx는 자체 여백을 가지므로 @page 여백은 0으로 두고 docx-preview 렌더의 여백을 그대로 살린다.
    idoc.open();
    idoc.write(
      '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>@page { size: A4; margin: 0; } html, body { margin: 0; padding: 0; background: #fff; }' +
      '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head>' +
      '<body><div id="pdf-host"></div></body></html>'
    );
    idoc.close();

    const host = idoc.getElementById('pdf-host') as HTMLElement | null;
    if (!host) { document.body.removeChild(iframe); return; }
    // 같은 docx Blob을 인쇄 iframe 문서에 렌더(스타일도 그 문서에 주입됨).
    await renderInvoiceDocxPreview(blob, host);

    const win = iframe.contentWindow!;
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; if (iframe.parentNode) document.body.removeChild(iframe); };
    win.onafterprint = cleanup;
    win.focus();
    win.print();
    setTimeout(cleanup, 60000); // onafterprint 미발화 브라우저 대비
  };

  const handleDownloadDoc = async (docId: string) => {
    // 상업송장: 고정 docx 템플릿에서 생성한 Blob을 docx로 저장 + 같은 Blob을 인쇄해 PDF로도 저장.
    if (docId === 'invoice') {
      const blob = await getInvoiceBlob();
      if (!blob) {
        alert('상업송장 데이터가 없습니다. 먼저 필요 서류를 생성해 주세요.');
        return;
      }
      // 1) DOCX 저장
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getDocFileName('invoice').replace(/\.pdf$/i, '.docx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      // 2) PDF 저장(브라우저 인쇄) — 같은 docx를 렌더해서 벡터 PDF로.
      alert(
        '상업송장 DOCX가 저장되었습니다. 이어서 PDF 저장 창이 열립니다.\n\n' +
        '· 대상(프린터): "PDF로 저장" 선택\n' +
        '· URL/날짜가 찍히지 않게 하려면 → "옵션 더보기 → 머리글 및 바닥글" 체크 해제'
      );
      await printInvoiceAsPdf(blob);
      return;
    }

    // 패킹리스트: 고정 docx 템플릿에서 생성한 Blob을 그대로 다운로드(미리보기와 동일 바이너리).
    if (docId === 'packing_list') {
      let blob: Blob | null = null;
      try {
        blob = await getPackingListBlob();
      } catch (e) {
        alert(e instanceof Error ? e.message : '패킹리스트 생성에 실패했습니다.');
        return;
      }
      if (!blob) {
        alert('패킹리스트 데이터가 없습니다. 먼저 필요 서류를 생성해 주세요.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = getDocFileName('packing_list').replace(/\.pdf$/i, '.docx');
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    const htmlContent = htmlTemplates[docId];
    if (!htmlContent) {
      alert('문서 양식 템플릿이 생성되지 않았습니다.');
      return;
    }

    // 그 외 문서: 벡터(텍스트 레이어 유지) PDF 출력 — 브라우저 네이티브 인쇄("PDF로 저장").
    // html2canvas 래스터와 달리 텍스트 선택·추출 가능 + 한글 폰트 벡터 임베딩 + 기존 HTML 그대로.
    // 저장 전 안내: 브라우저 기본 머리글/바닥글(URL·날짜)은 코드로 강제 제거할 수 없어(사용자 인쇄 설정),
    // 인쇄 대화상자에서 직접 해제하도록 안내한다.
    alert(
      'PDF 저장 창이 열립니다.\n\n' +
      '· 대상(프린터): "PDF로 저장" 선택\n' +
      '· 문서에 URL/날짜가 찍히지 않게 하려면 → "옵션 더보기 → 머리글 및 바닥글" 체크 해제'
    );

    const title = getDocFileName(docId).replace(/\.pdf$/i, '').replace(/[<>"'&]/g, '');

    // 새 창(window.open) 대신 숨김 iframe — 팝업 차단을 회피한다.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
    document.body.appendChild(iframe);

    const idoc = iframe.contentWindow?.document;
    if (!idoc) {
      document.body.removeChild(iframe);
      alert('인쇄 창 생성에 실패했습니다. 다시 시도해 주세요.');
      return;
    }

    // htmlContent는 템플릿에서 이미 escapeHtml 처리된 안전한 문자열이다.
    idoc.open();
    idoc.write(
      '<!doctype html><html lang="ko"><head><meta charset="utf-8">' +
      '<title>' + title + '</title><style>' +
      '@page { size: A4; margin: 10mm; }' +
      'html, body { margin: 0; padding: 0; background: #fff; }' +
      '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }' +
      // 미리보기 820px 고정폭 → A4 인쇄영역(210 − 좌우 10mm = 190mm) mm 고정폭으로 안정화(% 확장 대신).
      'body > div { width: 190mm !important; max-width: 190mm !important; margin: 0 !important; }' +
      '</style></head><body>' + htmlContent + '</body></html>'
    );
    idoc.close();

    const win = iframe.contentWindow!;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (iframe.parentNode) document.body.removeChild(iframe);
    };
    const doPrint = () => {
      win.onafterprint = cleanup;
      win.focus();
      win.print();
      // onafterprint 미발화 브라우저 대비 — 인쇄 대화상자 동안 iframe이 살아있게 넉넉히 지연 후 정리
      setTimeout(cleanup, 60000);
    };
    // 폰트·레이아웃 렌더 후 인쇄
    setTimeout(doPrint, 350);
  };

  const handleSubmitAll = async () => {
    if (isSubmittingTradeRef.current) return;

    if (hasSubmittedTradeRef.current) {
      alert('이미 전송이 완료된 거래입니다.');
      return;
    }

    const tradeId = currentTradeIdRef.current;
    if (!tradeId) {
      alert('먼저 필요 서류 자동생성을 실행해 거래를 생성해주세요.');
      return;
    }

    // 정책: 제출 차단도 error(미해결)만. warning은 통과.
    const hasBlockingErrors = unresolvedBlockers(issues, overrides).length > 0;
    const canBypassValidation = IS_DEV_TEST_ENABLED && devTestMode !== null;
    if (hasBlockingErrors && !canBypassValidation) return;

    isSubmittingTradeRef.current = true;

    try {
      const validationErrorCount = issues.filter((issue) => issue.severity === 'error').length;
      const generatedDocs = devTestMode && canBypassValidation
        ? { htmlTemplates, invoice: invoiceData ?? undefined, packingList: packingListData ?? undefined, overrides, _testMeta: createTestSubmissionMeta(devTestMode, validationErrorCount) }
        : { htmlTemplates, invoice: invoiceData ?? undefined, packingList: packingListData ?? undefined, overrides };
      await markTradeAsSubmitted(tradeId, {
        profile,
        documents,
        issues,
        generatedDocs,
      });
      setCurrentTradeStatus('submitted');
      hasSubmittedTradeRef.current = true;
      if (devTestMode === 'needs_revision' && hasBlockingErrors) {
        alert('검증 오류를 포함한 테스트 문서가 제출되었습니다.');
      } else if (devTestMode) {
        alert('테스트 문서가 정상적으로 제출되었습니다.');
      } else {
        alert('모든 통관 문서 정보 보완이 완료되었습니다. 관세청 통관 시스템으로 제출합니다.');
      }
      setDevTestMode(null);
      setDevTestMessage('');
    } catch (error) {
      console.error('[Trade Submission] Failed to submit generated trade:', error);
      alert('전체 문서 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      isSubmittingTradeRef.current = false;
    }
      };
  /* db연결로 할 부분이라 일단 지움 const handleSubmitAll = () => {
    if (readiness.percent < 100) {
      const proceed = window.confirm(
        `아직 준비되지 않은 서류가 있습니다 (준비도 ${readiness.percent}%).\n${readiness.nextStepLabel ?? ''}\n\n그래도 제출하시겠습니까?`
      );
      if (!proceed) return;
    }
    alert('모든 통관 문서 정보 보완이 완료되었습니다. 관세청 통관 시스템으로 제출합니다.');
  }; */

  // Calculate statistics — info 수준 이슈는 안내일 뿐 제출을 막지 않음
  const completedDocsCount = documents.filter(d => d.status === 'completed').length;
  // 차단(제출/생성 게이트) = 미해결 error만.
  const blockingIssuesCount = unresolvedBlockers(issues, overrides).length;
  // 실제 제출 전 준비도(%) — 서류가 몇 % 완료됐는지와 다음에 채워야 할 항목을 안내
  const readiness = calculateReadiness(documents);

  // 화주(내가) 직접 생성하는 서류 = 외부 발행(external_pending)·해당없음(not_needed) 제외.
  // rulesEngine 상태는 입력값만 보고 'completed'로 표시하지만, 차단(error)이면 실제 파일은
  // 생성되지 않는다(handleGenerateDocuments가 invoiceData/packingListData=null). 따라서
  // "정말 만들어졌는지"는 hasDoc(실제 파일 유무)로 판단한다.
  const ownDocs = documents.filter(d => d.status !== 'external_pending' && d.status !== 'not_needed');
  const ownReadyCount = ownDocs.filter(d => hasDoc(d.id)).length;
  const externalPendingCount = documents.filter(d => d.status === 'external_pending').length;
  const isGenerationBlocked = blockingIssuesCount > 0;
  const isSubmitReady = !isGenerationBlocked && ownDocs.length > 0 && ownReadyCount === ownDocs.length;

  const draftSaveLabel = (() => {
    if (draftSaveStatus === 'local') return '로컬에 저장됨';
    if (draftSaveStatus === 'saving') return '초안 저장 중...';
    if (draftSaveStatus === 'error') return '초안 저장 실패';
    if (draftSaveStatus === 'saved') {
      const savedTime = draftLastSavedAt
        ? new Date(draftLastSavedAt).toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' })
        : '';
      return savedTime ? `${savedTime} 초안 저장 완료` : '초안 저장 완료';
    }
    return '';
  })();

  const handleDeleteAccount = async () => {
    if (!user) throw new Error('missing_user');
    const deletedUserId = await deleteCurrentAccount();
    removeDraftFromLocal(deletedUserId);
    localStorage.removeItem('portai_user_session');
    localStorage.removeItem('portai_saved_trades');
    pauseDraftSaving();
    currentTradeIdRef.current = null;
    setUser(null);
    handleReset();
  };

  if (isAuthLoading) {
    return (
      <div className="login-wrapper">
        <div className="login-bg-decoration login-bg-decor1"></div>
        <div className="login-bg-decoration login-bg-decor2"></div>
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">P</div>
            <div className="login-brand">PortAI</div>
            <div className="login-subtitle">세션을 확인하는 중입니다</div>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onAuthenticated={setUser} />;
  }

  if (isProfileLoading || (!userProfile && !profileError)) {
    return (
      <div className="login-wrapper">
        <div className="login-bg-decoration login-bg-decor1"></div>
        <div className="login-bg-decoration login-bg-decor2"></div>
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">🚢</div>
            <div className="login-brand">PortAI</div>
            <div className="login-subtitle">회사 프로필을 불러오는 중입니다</div>
          </div>
        </div>
      </div>
    );
  }

  if (profileError || !userProfile) {
    return (
      <div className="login-wrapper">
        <div className="login-card profile-error-card">
          <div className="login-header">
            <div className="login-logo">⚠️</div>
            <div className="login-brand">프로필을 확인해 주세요</div>
            <div className="login-subtitle">{profileError ?? '프로필 정보를 찾을 수 없습니다.'}</div>
          </div>
          <button type="button" className="login-btn-primary" onClick={() => void reloadUserProfile()}>다시 시도</button>
          <button type="button" className="login-btn-switch" onClick={() => void handleLogout()}>로그아웃</button>
        </div>
      </div>
    );
  }

  if (needsOnboarding || user.onboardingPending) {
    return (
      <OnboardingPage
        profile={userProfile}
        isSaving={isProfileSaving}
        onComplete={async (values) => {
          await saveUserProfile(values);
          const completedUser = await markOnboardingCompleted();
          setActiveMenu('dashboard');
          setUser(completedUser);
        }}
      />
    );
  }

/*
  if (!user) {
    return (
      <div className="login-wrapper">
        <div className="login-bg-decoration login-bg-decor1"></div>
        <div className="login-bg-decoration login-bg-decor2"></div>

        <div className="login-stage">
        <div className={`login-card ${showOnboarding ? 'stage-dimmed' : ''}`}>
          <div className="login-header">
            <div className="login-logo">🚢</div>
            <div className="login-brand">PortAI</div>
            <div className="login-subtitle">스마트 물류 & 통관 자동화 플랫폼</div>
          </div>
          
          <form className="login-form" onSubmit={handleMemberLogin}>
            <div className="login-input-group">
              <label className="login-label">사용자 아이디 (이메일)</label>
              <input 
                type="text" 
                className="login-input" 
                placeholder="demo@portai.com" 
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </div>
            
            <div className="login-input-group">
              <label className="login-label">비밀번호</label>
              <input 
                type="password" 
                className="login-input" 
                placeholder="••••••••" 
                value={loginPw}
                onChange={(e) => setLoginPw(e.target.value)}
              />
            </div>
            
            <button type="submit" className="login-btn-primary" style={{ marginTop: '8px' }}>
              로그인
            </button>
          </form>

          <div className="login-demo-helper">
            <span className="login-demo-helper-title">💡 데모 계정으로 자동완성</span>
            <div className="login-demo-actions">
              <button 
                className="login-demo-pill" 
                type="button"
                onClick={() => {
                  setLoginId('incheon_tech');
                  setLoginPw('password123');
                }}
              >
                인천테크 (회원)
              </button>
            </div>
          </div>

        </div>
*/
        /* 첫 로그인 맞춤 설정 패널 — 로그인 카드 오른쪽에서 슬라이드 인 */
        /*<div className={`onboarding-panel ${showOnboarding ? 'open' : ''}`}>
          <div className="onboarding-inner">
            <div className="onboarding-heading">
              <div className="onboarding-title">👋 거의 다 됐어요</div>
              <div className="onboarding-subtitle">맞춤 서비스를 위해 몇 가지만 알려주세요.</div>
            </div>

            <form className="login-form" onSubmit={handleOnboardingComplete}>
              <div className="login-input-group">
                <label className="login-label">사용 목적</label>
                <div className="ob-pill-group">
                  {([
                    { value: 'export', label: '수출' },
                    { value: 'import', label: '수입' },
                    { value: 'both', label: '둘 다' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`ob-pill ${obPurpose === opt.value ? 'selected' : ''}`}
                      onClick={() => setObPurpose(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">회사명</label>
                <input
                  type="text"
                  className="login-input"
                  placeholder="예: 인천테크"
                  value={obCompany}
                  onChange={(e) => setObCompany(e.target.value)}
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">업종 / 담당 업무</label>
                <select
                  className="login-input"
                  value={obRole}
                  onChange={(e) => setObRole(e.target.value)}
                >
                  <option value="">선택하세요 (선택 사항)</option>
                  <option value="manufacturing">제조업</option>
                  <option value="trading">무역 / 유통</option>
                  <option value="logistics">물류 / 포워딩</option>
                  <option value="ecommerce">전자상거래</option>
                  <option value="etc">기타</option>
                </select>
              </div>

              <button type="submit" className="login-btn-primary" style={{ marginTop: '8px' }}>
                시작하기
              </button>
            </form>
          </div>
        </div>
        </div>
      </div>
    );
  }
*/
  return (
    <div className="app-container">
      <OnboardingTour />
      {/* 1. Left Navigation Sidebar */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="logo-section">
          <div className="logo-icon">🚢</div>
          <div>
            <div className="logo-text">PortAI</div>
            <div className="logo-sub">스마트 물류 & 통관 자동화 플랫폼</div>
          </div>
        </div>

        <ul className="menu-list">
          <li>
            <div
              className={`menu-item ${activeMenu === 'about' ? 'active' : ''}`}
              onClick={() => setActiveMenu('about')}
            >
              <Anchor size={18} />
              서비스 소개
            </div>
          </li>
          <li>
            <div
              className={`menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveMenu('dashboard')}
            >
              <LayoutDashboard size={18} />
              통관 작업실
            </div>
          </li>
          <li>
            <div
              className={`menu-item ${activeMenu === 'docs' ? 'active' : ''}`}
              onClick={() => setActiveMenu('docs')}
            >
              <FolderKanban size={18} />
              문서 관리
            </div>
          </li>
          {/* 미구현 메뉴 — 구현 완료 시 onClick 연결 후 disabled/배지 제거 */}
                    <li>
            <div
              className={`menu-item ${activeMenu === 'trades' ? 'active' : ''}`}
              onClick={() => setActiveMenu('trades')}
            >
              <Layers size={18} />
              거래 관리
            </div>
          </li>
          <li>
            <div
  className={`menu-item ${activeMenu === 'customs_history' ? 'active' : ''}`}
  onClick={() => setActiveMenu('customs_history')}
>
  <FileCheck2 size={18} />
  통관 내역
</div>
          </li>
          <li>
            <div
              className={`menu-item ${activeMenu === 'analysis' ? 'active' : ''}`}
              onClick={() => setActiveMenu('analysis')}
            >
              <BarChart3 size={18} />
              데이터 분석
            </div>
          </li>
          <li>
            <div
              className={`menu-item ${activeMenu === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveMenu('profile')}
            >
              <UserRound size={18} />
              프로필 관리
            </div>
          </li>
          <li>
            <div
              className={`menu-item ${activeMenu === 'guide' ? 'active' : ''}`}
              onClick={() => setActiveMenu('guide')}
            >
              <BookOpen size={18} />
              사용 안내
            </div>
          </li>
          <li>
            <div
              className={`menu-item ${activeMenu === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveMenu('settings')}
            >
              <Settings size={18} />
              설정
            </div>
          </li>
        </ul>

        <div className="support-card">
          <div className="support-title">
            <PhoneCall size={14} />
            고객지원센터
          </div>
          <div className="support-phone">02-1234-5678</div>
          <div className="support-time">평일 09:00 - 18:00</div>
        </div>
      </aside>

      {/* 2. Main Portal Contents */}
      <div className="main-wrapper">
        <header className="header">
          <div className="header-title-sec">
            <button
              className="icon-btn sidebar-toggle"
              onClick={() => setSidebarCollapsed(prev => !prev)}
              title={sidebarCollapsed ? '메뉴 펼치기' : '메뉴 접기'}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <span className="platform-badge">Mentoring Project 2026</span>
          </div>

          <div className="header-actions">
            <button className="icon-btn">
              <Bell size={20} />
              <span className="badge-dot"></span>
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setActiveMenu('guide')}
              title="사용 안내"
              aria-label="사용 안내 페이지로 이동"
            >
              <HelpCircle size={20} />
            </button>
            <div className="user-info-section">
              <button type="button" className="user-profile" onClick={() => setActiveMenu('profile')} title="프로필 관리" aria-label="프로필 관리 페이지로 이동">
                <div className="user-avatar">{user.type === 'member' ? '회' : '비'}</div>
                <span>{userProfile.company_name || userProfile.contact_name || user.email} 님</span>
                <span className={`auth-badge ${user.type}`}>
                  {user.type === 'member' ? '회원' : '비회원'}
                </span>
              </button>
              <button className="btn-logout" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </div>
        </header>

        <main className="content-body">
          <div className="workspace-area">
            {activeMenu === 'about' ? <AboutPanel onStart={() => setActiveMenu('dashboard')} />
            : activeMenu === 'profile' ? <ProfileSettingsPage profile={userProfile} isSaving={isProfileSaving} onSave={async (values) => { await saveUserProfile(values); }} onDeleteAccount={handleDeleteAccount} />
            : activeMenu === 'guide' ? <GuidePanel onNavigate={setActiveMenu} />
            : activeMenu === 'settings' ? <SettingsPanel />
            : activeMenu === 'analysis' ? <DataAnalysisPanel />
            : activeMenu === 'customs_history' ? <CustomsHistoryPanel onLoad={handleLoadSavedTrade} />
            : activeMenu === 'trades' ? <TradeManagerPanel onLoad={handleLoadSavedTrade} />   
            : activeMenu === 'docs' ? <DocumentManagerPanel onLoad={handleLoadSavedTrade} onCopy={handleCopySavedTrade} />
            : <>
            {/* Page Title & Subtitle */}
            <div className="page-heading">
              <h1 className="page-title">항만 수출입 문서 자동화 서비스</h1>
              <p className="page-subtitle">AI 기반 로보 어드바이저가 통관 및 선적에 필요한 문서를 자동으로 생성해 드립니다.</p>
            </div>

            <div className="trade-selector-panel">
              <TradeDirectionSelector value={tradeDirection} onChange={handleTradeDirectionChange} />
              <TradeRoleSelector
                value={workspaceRole}
                allowedRoles={userProfile.service_role === 'integrated' ? ['shipper', 'forwarder'] : [workspaceRole]}
                onChange={setIntegratedWorkspaceRole}
              />
            </div>

            {tradeDirection === 'import' ? (
              workspaceRole === 'forwarder'
                ? <ImportForwarderFlow userId={user.id} onComplete={handleImportComplete} />
                : <ImportShipperFlow userId={user.id} importerCompanyName={userProfile.company_name ?? ''} onComplete={handleImportComplete} />
            ) : workspaceRole === 'forwarder' ? (
              <ForwarderWorkspaceForm state={forwarderForm} onChange={setForwarderForm} />
            ) : !hasGenerated ? (
              /* --- 거래 정보 입력 모드 --- */
              <div className="dashboard-grid">
                <ShipperWorkspaceForm
                  profile={profile}
                  items={shipperItems}
                  supplemental={shipperSupplemental}
                  isProcessing={isProcessing}
                  profileSignerDefault={userProfile.contact_name?.trim() || ''}
                  onProfilePatch={(patch) => setProfile((current) => ({ ...current, ...patch }))}
                  onItemsChange={handleShipperItemsChange}
                  onSupplementalChange={(state) => setProfile((current) => ({ ...current, shipperSupplemental: state }))}
                  onReset={handleReset}
                  onGenerate={() => void handleGenerateDocuments()}
                  toolbar={IS_DEV_TEST_ENABLED ? (
                    <div className="dev-test-actions">
                      <span className="dev-badge">DEV</span>
                      <button type="button" className="dev-test-button dev-test-button-perfect" onClick={handleFillPerfectTestData} disabled={isProcessing}>완벽 테스트</button>
                      <button type="button" className="dev-test-button dev-test-button-revision" onClick={handleFillRevisionTestData} disabled={isProcessing}>수정 필요 테스트</button>
                      {devTestMode && <button type="button" className="dev-test-disable" onClick={handleDisableDevTestMode}>테스트 모드 해제</button>}
                    </div>
                  ) : undefined}
                  statusContent={(
                    <>
                      {devTestMode && <div className="dev-test-mode-label" role="status">DEV · {devTestMode === 'perfect' ? '완벽 테스트 모드' : '수정 필요 테스트 모드'}</div>}
                      {devTestMessage && <div className="form-message info" role="status">{devTestMessage}</div>}
                      {draftSaveLabel && (
                        <div className={`draft-save-status ${draftSaveStatus}`} role="status" aria-live="polite">
                          <span className="draft-save-dot" />
                          {draftSaveLabel}
                        </div>
                      )}
                    </>
                  )}
                />
                {false && (
                <div className="form-card">
                  <div className="trade-section-header">
                    <div className="trade-section-title">
                      <FileSignature size={20} className="text-primary" />
                      <h2 className="card-title">거래 정보 입력</h2>
                    </div>
                    {IS_DEV_TEST_ENABLED && (
                      <div className="dev-test-actions">
                        <span className="dev-badge">DEV</span>
                        <button type="button" className="dev-test-button dev-test-button-perfect" onClick={handleFillPerfectTestData} disabled={isProcessing}>완벽 테스트</button>
                        <button type="button" className="dev-test-button dev-test-button-revision" onClick={handleFillRevisionTestData} disabled={isProcessing}>수정 필요 테스트</button>
                        {devTestMode && <button type="button" className="dev-test-disable" onClick={handleDisableDevTestMode}>테스트 모드 해제</button>}
                      </div>
                    )}
                  </div>
                  {devTestMode && <div className="dev-test-mode-label" role="status">DEV · {devTestMode === 'perfect' ? '완벽 테스트 모드' : '수정 필요 테스트 모드'}</div>}
                  {devTestMessage && <div className="form-message info" role="status">{devTestMessage}</div>}
                  {draftSaveLabel && (
                    <div className={`draft-save-status ${draftSaveStatus}`} role="status" aria-live="polite">
                      <span className="draft-save-dot" />
                      {draftSaveLabel}
                    </div>
                  )}

                  <div className="form-grid">
                    <div className="form-group" data-docs="invoice customs_dec co">
                      <label className="form-label">수출입 구분</label>
                      <select
                        className="form-input"
                        value={profile.tradeType}
                        onChange={(e) => handleInputChange('tradeType', e.target.value as 'export' | 'import')}
                      >
                        <option value="export">수출</option>
                        <option value="import">수입</option>
                      </select>
                    </div>

                    <div className="form-group" data-docs="invoice packing_list co" data-field="itemName">
                      <label className="form-label">품목명</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="품목명을 입력하세요"
                        value={profile.itemName}
                        onChange={(e) => handleInputChange('itemName', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="invoice customs_dec co">
                      <label className="form-label">HS CODE</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="모르면 비워두세요 — AI가 자동 추천"
                        value={profile.hsCode}
                        onChange={(e) => handleInputChange('hsCode', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="invoice bl" data-field="loadPort">
                      <label className="form-label">선적항</label>
                      <select
                        className="form-input"
                        value={profile.loadPort}
                        onChange={(e) => handleInputChange('loadPort', e.target.value)}
                      >
                        <option value="">선적항을 선택하세요</option>
                        {LOAD_PORT_OPTIONS.map((port) => (
                          <option key={port.value} value={port.value}>{port.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" data-docs="invoice bl" data-field="dischargePort">
                      <label className="form-label">도착항</label>
                      <select
                        className="form-input"
                        value={profile.dischargePort}
                        onChange={(e) => handleInputChange('dischargePort', e.target.value)}
                      >
                        <option value="">도착항을 선택하세요</option>
                        {DISCHARGE_PORT_OPTIONS.map((port) => (
                          <option key={port.value} value={port.value}>{port.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" data-docs="invoice bl insurance" data-field="incoterms">
                      <label className="form-label">거래조건 (Incoterms)</label>
                      <select
                        className="form-input"
                        value={profile.incoterms}
                        onChange={(e) => handleInputChange('incoterms', e.target.value as any)}
                      >
                        <option value="">거래조건을 선택하세요</option>
                        <option value="FOB">FOB</option>
                        <option value="CIF">CIF</option>
                        <option value="EXW">EXW</option>
                        <option value="DDP">DDP</option>
                      </select>
                    </div>

                    <div className="form-group" data-docs="invoice packing_list co" data-field="quantity">
                      <label className="form-label">화물 수량</label>
                      <div className="input-suffix">
                        <input
                          type="number"
                          className="form-input"
                          placeholder="숫자만 입력하세요"
                          value={profile.quantity}
                          onChange={(e) => handleInputChange('quantity', e.target.value ? Number(e.target.value) : '')}
                        />
                        <span className="suffix-text">개</span>
                      </div>
                    </div>

                    <div className="form-group" data-docs="packing_list" data-field="weight">
                      <label className="form-label">중량(kg)</label>
                      <div className="input-suffix">
                        <input
                          type="number"
                          className="form-input"
                          placeholder="숫자만 입력하세요"
                          value={profile.weight}
                          onChange={(e) => handleInputChange('weight', e.target.value ? Number(e.target.value) : '')}
                        />
                        <span className="suffix-text">kg</span>
                      </div>
                    </div>

                    <div className="form-group" data-docs="bl" data-field="departureDate">
                      <label className="form-label">출발일</label>
                      <input
                        type="date"
                        className="form-input"
                        value={profile.departureDate}
                        onChange={(e) => handleInputChange('departureDate', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="bl" data-field="arrivalDate">
                      <label className="form-label">도착예정일</label>
                      <input
                        type="date"
                        className="form-input"
                        value={profile.arrivalDate}
                        onChange={(e) => handleInputChange('arrivalDate', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="invoice packing_list co" data-field="companyName">
                      <label className="form-label">업체명</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="업체명을 입력하세요"
                        value={profile.companyName}
                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="invoice packing_list co" data-field="contact">
                      <label className="form-label">담당자 연락처</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="010-0000-0000"
                        value={profile.contact}
                        onChange={(e) => handleInputChange('contact', e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="form-optional-note">
                    아래 상세 항목은 모두 선택 입력입니다 — 비워두면 AI 에이전트가 자동 생성하거나 기본값을 사용합니다.
                  </p>

                  <details className="form-section">
                    <summary className="form-section-summary">
                      📄 송장·문서 상세
                      <span className="form-section-hint">비워두면 자동 생성 — 채우면 상업송장이 실제 서류와 정확히 일치해요</span>
                    </summary>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">문서번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: DOC-20260701-001"
                          value={profile.documentNo}
                          onChange={(e) => handleInputChange('documentNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice">
                        <label className="form-label">송장번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: INV-20260701-001"
                          value={profile.invoiceNo}
                          onChange={(e) => handleInputChange('invoiceNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice" data-field="invoiceDate">
                        <label className="form-label">송장 작성일</label>
                        <input
                          type="date"
                          className="form-input"
                          value={profile.invoiceDate}
                          onChange={(e) => handleInputChange('invoiceDate', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">참조번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: REF-INCHON-001"
                          value={profile.referenceNo}
                          onChange={(e) => handleInputChange('referenceNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice co">
                        <label className="form-label">원산지</label>
                        <select
                          className="form-input"
                          value={profile.countryOfOrigin}
                          onChange={(e) => handleInputChange('countryOfOrigin', e.target.value)}
                        >
                          <option value="">원산지를 선택하세요</option>
                          <option value="대한민국">대한민국 (KR)</option>
                          <option value="미국">미국 (US)</option>
                          <option value="중국">중국 (CN)</option>
                          <option value="일본">일본 (JP)</option>
                          <option value="베트남">베트남 (VN)</option>
                          <option value="독일">독일 (DE)</option>
                        </select>
                      </div>

                      <div className="form-group" data-docs="invoice">
                        <label className="form-label">수량 단위</label>
                        <select
                          className="form-input"
                          value={profile.unit}
                          onChange={(e) => handleInputChange('unit', e.target.value)}
                        >
                          <option value="EA">EA</option>
                          <option value="PCS">PCS</option>
                          <option value="BOX">BOX</option>
                          <option value="SET">SET</option>
                          <option value="KG">KG</option>
                          <option value="CNTR">CNTR</option>
                        </select>
                      </div>

                      <div className="form-group" data-docs="invoice" data-field="unitPrice">
                        <label className="form-label">단가</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="예: 12"
                          value={profile.unitPrice}
                          onChange={(e) => handleInputChange('unitPrice', e.target.value ? Number(e.target.value) : '')}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice" data-field="totalAmount">
                        <label className="form-label">총 금액</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="예: 18000"
                          value={profile.totalAmount}
                          onChange={(e) => handleInputChange('totalAmount', e.target.value ? Number(e.target.value) : '')}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">결제조건</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: T/T in advance"
                          value={profile.paymentTerms}
                          onChange={(e) => handleInputChange('paymentTerms', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">수출 사유</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Sale of goods"
                          value={profile.reasonForExport}
                          onChange={(e) => handleInputChange('reasonForExport', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice customs_dec" data-field="currency">
                        <label className="form-label">결제 통화</label>
                        <select
                          className="form-input"
                          value={profile.currency || 'USD'}
                          onChange={(e) => handleInputChange('currency', e.target.value)}
                        >
                          <option value="USD">USD (미국 달러)</option>
                          <option value="KRW">KRW (원화)</option>
                          <option value="EUR">EUR (유로)</option>
                          <option value="JPY">JPY (일본 엔)</option>
                          <option value="CNY">CNY (중국 위안)</option>
                        </select>
                      </div>

                      <div className="form-group" data-docs="customs_dec">
                        <label className="form-label">인보이스 총액</label>
                        <div className="input-suffix">
                          <input
                            type="number"
                            className="form-input"
                            placeholder="외화 입력 시 과세가격 자동 환산"
                            value={profile.invoiceAmount ?? ''}
                            onChange={(e) => handleInputChange('invoiceAmount', e.target.value ? Number(e.target.value) : '')}
                          />
                          <span className="suffix-text">{profile.currency || 'USD'}</span>
                        </div>
                      </div>
                    </div>
                  </details>

                  <details className="form-section">
                    <summary className="form-section-summary">
                      🚢 선적·운송 상세
                      <span className="form-section-hint">채우면 선하증권(B/L) 준비 완료로 표시돼요</span>
                    </summary>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">B/L 번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: BL-20260701-001"
                          value={profile.blNo}
                          onChange={(e) => handleInputChange('blNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">발행 장소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Seoul, Korea"
                          value={profile.issuePlace}
                          onChange={(e) => handleInputChange('issuePlace', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">발행일</label>
                        <input
                          type="date"
                          className="form-input"
                          value={profile.issueDate}
                          onChange={(e) => handleInputChange('issueDate', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">운임 조건</label>
                        <select
                          className="form-input"
                          value={profile.freightTerms}
                          onChange={(e) => handleInputChange('freightTerms', e.target.value)}
                        >
                          <option value="">운임 조건을 선택하세요</option>
                          <option value="Prepaid">Prepaid</option>
                          <option value="Collect">Collect</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">운임 및 비용</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Freight Prepaid"
                          value={profile.freightCharges}
                          onChange={(e) => handleInputChange('freightCharges', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">운임 선불 장소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Busan, Korea"
                          value={profile.freightPrepaidAt}
                          onChange={(e) => handleInputChange('freightPrepaidAt', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">운임 지급 장소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Incheon, Korea"
                          value={profile.freightPayableAt}
                          onChange={(e) => handleInputChange('freightPayableAt', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="packing_list">
                        <label className="form-label">포장 개수</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="예: 30"
                          value={profile.packageCount}
                          onChange={(e) => handleInputChange('packageCount', e.target.value ? Number(e.target.value) : '')}
                        />
                      </div>

                      <div className="form-group" data-docs="packing_list">
                        <label className="form-label">포장 종류</label>
                        <select
                          className="form-input"
                          value={profile.packageType}
                          onChange={(e) => handleInputChange('packageType', e.target.value)}
                        >
                          <option value="">포장 종류를 선택하세요</option>
                          <option value="Carton">Carton</option>
                          <option value="Box">Box</option>
                          <option value="Pallet">Pallet</option>
                          <option value="Container">Container</option>
                          <option value="Wooden Case">Wooden Case</option>
                          <option value="Bag">Bag</option>
                        </select>
                      </div>

                      <div className="form-group" data-docs="packing_list">
                        <label className="form-label">순중량(kg)</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="예: 2200"
                          value={profile.netWeight}
                          onChange={(e) => handleInputChange('netWeight', e.target.value ? Number(e.target.value) : '')}
                        />
                      </div>

                      <div className="form-group" data-docs="packing_list">
                        <label className="form-label">총중량(kg)</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="예: 2400"
                          value={profile.grossWeight}
                          onChange={(e) => handleInputChange('grossWeight', e.target.value ? Number(e.target.value) : '')}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Measurement / 부피</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 3.5 CBM"
                          value={profile.measurement}
                          onChange={(e) => handleInputChange('measurement', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="packing_list">
                        <label className="form-label">Shipping Marks</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: INCHON TECH / SHANGHAI / C/T NO. 1-30"
                          value={profile.shippingMarks}
                          onChange={(e) => handleInputChange('shippingMarks', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">선박명 / 항공편명</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: KMTC BUSAN V.2501"
                          value={profile.vesselOrFlight}
                          onChange={(e) => handleInputChange('vesselOrFlight', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">항차번호 / Voyage No.</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 2501E"
                          value={profile.voyageNo}
                          onChange={(e) => handleInputChange('voyageNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">운송사 / Carrier</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: KMTC, Maersk, DHL"
                          value={profile.carrier}
                          onChange={(e) => handleInputChange('carrier', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">수령지 / Place of Receipt</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Busan, Korea"
                          value={profile.placeOfReceipt}
                          onChange={(e) => handleInputChange('placeOfReceipt', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">인도지 / Place of Delivery</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Shanghai, China"
                          value={profile.placeOfDelivery}
                          onChange={(e) => handleInputChange('placeOfDelivery', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">최종 목적지</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Shanghai, China"
                          value={profile.finalDestination}
                          onChange={(e) => handleInputChange('finalDestination', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">선박 국적 / Flag</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Korea"
                          value={profile.flag}
                          onChange={(e) => handleInputChange('flag', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">컨테이너 번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: TCLU1234567"
                          value={profile.containerNo}
                          onChange={(e) => handleInputChange('containerNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Seal 번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: SEAL987654"
                          value={profile.sealNo}
                          onChange={(e) => handleInputChange('sealNo', e.target.value)}
                        />
                      </div>
                    </div>
                  </details>

                  <details className="form-section">
                    <summary className="form-section-summary">
                      🤝 상대방·구매자 정보
                      <span className="form-section-hint">채우면 인보이스의 수입자 정보가 정확해져요</span>
                    </summary>
                    <div className="form-grid">
                      <div className="form-group" data-docs="invoice packing_list co">
                        <label className="form-label">거래처명 (Consignee)</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="상대방 업체명을 입력하세요"
                          value={profile.partnerName || ''}
                          onChange={(e) => handleInputChange('partnerName', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice packing_list co">
                        <label className="form-label">수입자 주소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Pudong New Area, Shanghai, China"
                          value={profile.partnerAddress}
                          onChange={(e) => handleInputChange('partnerAddress', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">수입자 국가</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 중국"
                          value={profile.partnerCountry}
                          onChange={(e) => handleInputChange('partnerCountry', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice packing_list co">
                        <label className="form-label">수입자 연락처</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: +86-21-0000-0000"
                          value={profile.partnerContact}
                          onChange={(e) => handleInputChange('partnerContact', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">구매자명 / Buyer</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="거래처와 같으면 같은 이름 입력"
                          value={profile.buyerName}
                          onChange={(e) => handleInputChange('buyerName', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">구매자 주소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="구매자 주소를 입력하세요"
                          value={profile.buyerAddress}
                          onChange={(e) => handleInputChange('buyerAddress', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">구매자 국가</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 중국"
                          value={profile.buyerCountry}
                          onChange={(e) => handleInputChange('buyerCountry', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Notify Party명</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Shanghai Import Co."
                          value={profile.notifyPartyName}
                          onChange={(e) => handleInputChange('notifyPartyName', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Notify Party 주소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Pudong New Area, Shanghai, China"
                          value={profile.notifyPartyAddress}
                          onChange={(e) => handleInputChange('notifyPartyAddress', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Notify Party 연락처</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: +86-21-0000-0000"
                          value={profile.notifyPartyContact}
                          onChange={(e) => handleInputChange('notifyPartyContact', e.target.value)}
                        />
                      </div>
                    </div>
                  </details>

                  <details className="form-section">
                    <summary className="form-section-summary">
                      🏢 회사·서명 정보
                      <span className="form-section-hint">한 번 입력하면 거의 고정 — 원산지증명서(C/O) 발급에 필요해요</span>
                    </summary>
                    <div className="form-grid">
                      <div className="form-group" data-docs="invoice packing_list co">
                        <label className="form-label">수출자 주소</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 인천광역시 연수구 송도동"
                          value={profile.companyAddress}
                          onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">수출자 국가</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 대한민국"
                          value={profile.companyCountry}
                          onChange={(e) => handleInputChange('companyCountry', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Tax No.</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 123-45-67890"
                          value={profile.taxNo}
                          onChange={(e) => handleInputChange('taxNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="customs_dec">
                        <label className="form-label">사업자등록번호</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="000-00-00000 (입력 시 국세청 상태 검증)"
                          value={profile.businessRegistrationNo || ''}
                          onChange={(e) => handleInputChange('businessRegistrationNo', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice packing_list">
                        <label className="form-label">서명자</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 김지민"
                          value={profile.signedBy}
                          onChange={(e) => handleInputChange('signedBy', e.target.value)}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice">
                        <label className="form-label">서명자 영문명</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Kim Jimin"
                          value={profile.signerName}
                          onChange={(e) => handleInputChange('signerName', e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">직책</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: Export Manager"
                          value={profile.signerPosition}
                          onChange={(e) => handleInputChange('signerPosition', e.target.value)}
                        />
                      </div>
                    </div>
                  </details>

                  <div className="form-actions">
                    <button className="btn btn-secondary" onClick={handleReset}>
                      <RotateCcw size={16} />
                      초기화
                    </button>
                    <button className="btn btn-primary" onClick={handleGenerateDocuments} disabled={isProcessing}>
                      <FileText size={16} />
                      {isProcessing ? '생성 중...' : '필요 서류 자동 생성'}
                    </button>
                  </div>
                </div>
                )}

                {/* Right Guide Card — 입력 대기 / 진행 / 완료 3-상태 */}
                <div className="info-card">
                  {isProcessing ? (
                    (() => {
                      // 마지막 에이전트 로그로 현재 단계 추정: 검증(HS·규정) → 생성(문서·피드백)
                      const last = consoleLogs[consoleLogs.length - 1];
                      const step = !last ? 1
                        : /Document|Feedback/i.test(last.agentName) ? 2
                        : 1;
                      return (
                        <div className="info-progress">
                          <div className="info-steps">
                            {['입력', '검증', '생성'].map((label, i) => (
                              <div key={label} className={`info-step ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}>
                                <span className="info-step-dot">{i < step ? '✓' : i + 1}</span>
                                <span className="info-step-label">{label}</span>
                              </div>
                            ))}
                          </div>
                          <p className="info-desc">AI 에이전트가 입력을 검증하고 문서를 생성하는 중입니다...</p>
                        </div>
                      );
                    })()
                  ) : documents.some(d => d.status !== 'not_started') ? (
                    <div className="info-result">
                      <h3 className="info-title">최근 생성 결과</h3>
                      <div className={`info-result-line ${blockingIssuesCount > 0 ? 'warn' : 'ok'}`}>
                        {blockingIssuesCount > 0 ? `⚠ 보완 필요 ${blockingIssuesCount}건` : '✓ 검증 통과'} · 생성 완료 {completedDocsCount}건
                      </div>
                      <ul className="info-doc-list">
                        {documents.filter(d => d.status !== 'not_started').map(d => {
                          let badgeClass = 'status-not-started';
                          if (d.status === 'completed') badgeClass = 'status-completed';
                          else if (d.status === 'review_required') badgeClass = 'status-review-required';
                          else if (d.status === 'not_needed') badgeClass = 'status-not-needed';
                          else if (d.status === 'external_pending') badgeClass = 'status-external-pending';
                          return (
                            <li key={d.id}>
                              <span className="info-doc-name">{d.name}</span>
                              <span className={`status-badge ${badgeClass}`}>{d.statusText}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <button className="btn btn-secondary btn-sm" onClick={() => setHasGenerated(true)}>
                        결과 화면 다시 보기
                      </button>
                    </div>
                  ) : (
                    <div className="info-idle">
                      <span className="visual-ship visual-ship-sm">🚢</span>
                      <p className="info-desc">왼쪽에 거래 정보를 입력하고 [필요 서류 자동 생성]을 누르면 여기에 검증 결과와 생성된 문서가 표시됩니다.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* --- 결과 리포트 대시보드 모드 --- */
              <div className="workspace-area result-view">
                {/* 1. 상단: 거래 요약 + 로그 */}
                <div className="rv-topline">
                  <div className="rv-summary">
                    <span className={`trade-type-badge ${profile.tradeType}`}>{profile.tradeType === 'export' ? '수출' : '수입'}</span>
                    <span className="rv-summary-text">
                      {profile.itemName || '(품목명 없음)'}
                      {(profile.loadPort || profile.dischargePort) && (
                        <span className="rv-dim"> · {profile.loadPort || '-'} → {profile.dischargePort || '-'}</span>
                      )}
                      {profile.incoterms && <span className="rv-dim"> · {profile.incoterms}</span>}
                    </span>
                  </div>
                  <button className="rv-log-btn" onClick={() => setShowConsole(true)}>
                    <Terminal size={14} /> 에이전트 실행 로그
                  </button>
                </div>

                {/* 2. 준비도 히어로 — 차단 중엔 100% 대신 해결 유도, 준비완료면 실제 % */}
                {isGenerationBlocked ? (
                  <div className="rv-hero rv-hero-blocked">
                    <span className="rv-hero-blocked-ic"><AlertTriangle size={22} /></span>
                    <div>
                      <div className="rv-hero-blocked-title">
                        제출 전 <b>{blockingIssuesCount}건</b>을 해결해야 최종 제출할 수 있어요
                      </div>
                      <p className="rv-hero-blocked-sub">
                        상업송장·패킹리스트 <b>초안은 아래에서 미리보기·다운로드</b>할 수 있어요. 다만 아래 “해결하면 제출” 목록의 항목을 수정해야 최종 제출이 가능합니다.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rv-hero">
                    <div className="rv-hero-lab">{profile.tradeType === 'import' ? '수입' : '수출'} 준비도</div>
                    <div className="rv-hero-pct">{readiness.percent}<small>%</small></div>
                    <div className="rv-track"><div className="rv-track-fill" style={{ width: `${readiness.percent}%` }} /></div>
                    <div className="rv-hero-msg">
                      화주 서류 <b>{ownReadyCount}/{ownDocs.length}</b> 생성 완료
                      {isSubmitReady
                        ? <> — 제출 준비가 끝났어요.</>
                        : readiness.nextStepLabel ? <> — {readiness.nextStepLabel}</> : null}
                    </div>
                    {externalPendingCount > 0 && (
                      <p className="rv-hero-ext">
                        선하증권·통관신고·원산지증명서 등 <b>{externalPendingCount}건</b>은 선사·관세사·상공회의소가 발행해요.
                      </p>
                    )}
                  </div>
                )}

                {/* 3. 서류 현황 — 한 줄 = 한 서류 (상태 + 완료 시 보기·다운로드) */}
                <div className="rv-panel">
                  <div className="rv-panel-head">서류 현황 · {documents.length}건</div>
                  {documents.map((doc) => {
                    // 정식 무역 서류 약어(C/I·P/L·B/L·E/D·C/O)로 표기 — 감사·심사위원에게 익숙한 표준 코드.
                    // 수입 거래는 신고를 I/D로 노출한다.
                    const abbr = doc.id === 'invoice' ? 'C/I'
                      : doc.id === 'packing_list' ? 'P/L'
                      : doc.id === 'bl' ? 'B/L'
                      : doc.id === 'customs_dec' ? (profile.tradeType === 'import' ? 'I/D' : 'E/D')
                      : doc.id === 'co' ? 'C/O'
                      : doc.id === 'insurance' ? 'I/P' : '서류';
                    const fileReady = hasDoc(doc.id);
                    const isOwnDoc = doc.id === 'invoice' || doc.id === 'packing_list';
                    // 표시 상태 규칙:
                    //  - 화주 서류 + 파일 있음 + 차단 중  → '초안' (볼 수 있지만 제출 전 검토 필요)
                    //  - 화주 서류 + completed + 파일 없음 → '생성 대기' (아직 미생성)
                    //  - 그 외 → rulesEngine 상태문구 그대로
                    let displayText = doc.statusText;
                    let sbClass = doc.status === 'completed' ? 'ok'
                      : doc.status === 'review_required' ? 'rev' : 'na';
                    if (isOwnDoc && fileReady && isGenerationBlocked) {
                      displayText = '초안'; sbClass = 'rev';
                    } else if (isOwnDoc && doc.status === 'completed' && !fileReady) {
                      displayText = '생성 대기'; sbClass = 'na';
                    }
                    return (
                      <div className="rv-row" key={doc.id}>
                        <span className={`rv-abbr ${fileReady ? '' : 'gray'}`}>{abbr}</span>
                        <span className="rv-nm">{doc.name}</span>
                        <span className={`rv-sb rv-sb-${sbClass}`}>{displayText}</span>
                        <div className="rv-act">
                          {fileReady && (
                            <>
                              <button className="rv-view" onClick={() => setPreviewDocId(doc.id)}>
                                <Eye size={15} /> 보기
                              </button>
                              <button
                                className="rv-ib"
                                title={doc.id === 'invoice' ? 'DOCX + PDF 저장' : doc.id === 'packing_list' ? 'DOCX 다운로드' : 'PDF 저장'}
                                onClick={() => handleDownloadDoc(doc.id)}
                              >
                                <Download size={17} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Section 4: 해결 워크스페이스 — 문제 문구는 크게, 액션은 컴팩트하게 */}
                <div className="result-column result-review-full">
                  {issues.length === 0 ? (
                    <div className="rv-done">
                      <span className="rv-done-ic"><CheckCircle2 size={26} /></span>
                      <div>
                        <div className="rv-done-title">제출 준비 완료</div>
                        <p className="rv-done-sub">필요한 모든 서류가 검증을 통과했어요. 아래에서 바로 전송할 수 있습니다.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                    <div className="rv-fixes-head">
                      <h3 className="rv-fixes-title">{blockingIssuesCount > 0 ? '해결하면 제출할 수 있어요' : '검토 참고 사항'}</h3>
                      <p className="rv-fixes-sub">
                        {blockingIssuesCount > 0
                          ? '문제 문구를 확인하고 해당 입력을 수정하면 준비도가 100%에 가까워집니다.'
                          : '제출을 막지는 않지만, 아래 내용을 확인하면 서류가 더 정확해져요.'}
                      </p>
                    </div>

                      {/* 사실 카드 — 과세가격 환산·예상 관세액 등. 값은 실 API/룰에서 결정론적으로 산출. */}
                      {feedbackReport && feedbackReport.facts.length > 0 && (
                        <div className="fact-card-list">
                          {feedbackReport.facts.map((f) => (
                            <div key={f.id} className="fact-card">
                              <div className="fact-card-head">
                                <span className="fact-card-title">
                                  <Calculator size={15} className="fact-card-icon" />
                                  {f.title}
                                </span>
                                {f.basis && (
                                  <span className="fact-card-basis">
                                    {f.basis.label}{f.basis.law ? ` · ${f.basis.law}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="fact-card-value">{f.value}</div>
                              {f.formula && <div className="fact-card-formula">{f.formula}</div>}
                              {f.meta && <div className="fact-card-meta">{f.meta}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mobile-fix-list">
                        {(() => {
                          // 심각도별로 묶어 표시 — 오류(제출 차단) → 보완 권장 → 참고 안내 순.
                          // 성격이 다른 이슈를 문서 순서로 섞지 않고 그룹 헤더로 구분한다.
                          const order: Record<string, number> = { error: 0, warning: 1, info: 2 };
                          // card를 가진 이슈(과세가격 환산 등)는 위 사실 카드로 렌더 → 목록에선 제외(중복 방지).
                          const sorted = [...issues].filter((i) => !i.card).sort(
                            (a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9)
                          );
                          const sevMeta: Record<string, { label: string; hint: string; cls: string }> = {
                            error: { label: '반드시 수정', hint: '제출 차단 · 먼저 해결', cls: 'sev-error' },
                            warning: { label: '보완 권장', hint: '해소 권장', cls: 'sev-warning' },
                            info: { label: '참고 안내', hint: '', cls: 'sev-info' },
                          };
                          let lastSev: string | null = null;
                          return sorted.map((issue) => {
                            const showHeader = issue.severity !== lastSev;
                            lastSev = issue.severity;
                            const meta = sevMeta[issue.severity] ?? sevMeta.warning;
                            const count = sorted.filter((i) => i.severity === issue.severity).length;
                            return (
                              <Fragment key={issue.id}>
                                {showHeader && (
                                  <div className={`sev-section-header ${meta.cls}`}>
                                    <span className="sev-section-label">{meta.label}</span>
                                    <span className="sev-section-count">{count}</span>
                                    {meta.hint && <span className="sev-section-hint">{meta.hint}</span>}
                                  </div>
                                )}
                          <div className={`mobile-fix-card sev-${issue.severity}`}>
                            <div className="mfc-head">
                              <span className="mfc-dot" />
                              <div className="mfc-text">
                                {(() => {
                                  // 메시지에서 근거 접미사와 마지막 (부연설명)을 분리해 3층으로 렌더한다.
                                  // - 헤드라인: 본문 (근거·부연 제거)
                                  // - 부연: 마지막 괄호 안 문장 — 한 줄 띄우고 흐리게 표시
                                  // - 근거: issue.basis 우선, 없으면 message 접미사에서 파싱 — 접이식으로 조문 요약 노출
                                  const rawMsg = issue.message || '';
                                  const basisMatch = rawMsg.match(/\s*\[근거:\s*([^\]]+)\]\s*$/);
                                  const withoutBasis = basisMatch ? rawMsg.slice(0, basisMatch.index).trimEnd() : rawMsg;
                                  const parenMatch = withoutBasis.match(/\s*\(([^()]+)\)\s*$/);
                                  const mainLine = parenMatch ? withoutBasis.slice(0, parenMatch.index).trimEnd() : withoutBasis;
                                  const detailLine = parenMatch ? parenMatch[1].trim() : '';
                                  const basisLaw = issue.basis?.law || (basisMatch ? basisMatch[1].trim() : '');
                                  const basisSummary = issue.basis?.summary || '';
                                  return (
                                    <>
                                      <div className="mfc-headline">{mainLine}</div>
                                      {detailLine && (
                                        <div className="mfc-detail" style={{ marginTop: 6, fontSize: 13, color: '#475569', lineHeight: 1.45 }}>
                                          ({detailLine})
                                        </div>
                                      )}
                                      {basisLaw && (
                                        <details className="mfc-basis" style={{ marginTop: 8 }}>
                                          <summary style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: '#eef2ff', color: '#4338ca', fontSize: 11, fontWeight: 600, cursor: 'pointer', listStyle: 'none' }}>
                                            [근거: {basisLaw}] {basisSummary ? '▸' : ''}
                                          </summary>
                                          {basisSummary && (
                                            <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
                                              {basisSummary}
                                            </div>
                                          )}
                                        </details>
                                      )}
                                    </>
                                  );
                                })()}
                                <div className="mfc-sub">
                                  {issue.docType === 'invoice' ? '상업송장' :
                                   issue.docType === 'packing_list' ? '패킹리스트' :
                                   issue.docType === 'bl' ? '선하증권(B/L)' :
                                   issue.docType === 'customs_dec' ? '통관신고서' :
                                   issue.docType === 'co' ? '원산지증명서' :
                                   issue.docType === 'insurance' ? '적하보험증권' : '기타 서류'}
                                </div>
                              </div>
                              {issue.severity !== 'info' &&
                                issue.field !== 'weight' &&
                                issue.field !== 'hsCode' &&
                                issue.docType !== 'co' &&
                                issue.id !== 'insurance-missing' && (
                                <button className="mfc-fix-btn" onClick={() => goToFieldFix(issue)}>
                                  입력 수정 <ArrowRight size={14} />
                                </button>
                              )}
                            </div>

                            {/* 이슈 유형별 즉시 보완 입력 */}
                            {issue.field === 'weight' && (
                              <div className="mobile-input-group">
                                <label className="mobile-input-label">화물 중량 입력 (kg)</label>
                                <input
                                  type="number"
                                  className="mobile-input"
                                  placeholder="예: 4500"
                                  value={mobileWeight}
                                  onChange={(e) => setMobileWeight(e.target.value)}
                                />
                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveWeight} disabled={isRevalidating}>
                                  {isRevalidating ? '재검증 중...' : '중량 입력 및 보완 완료'}
                                </button>
                              </div>
                            )}

                            {issue.field === 'hsCode' && (
                              <div className="mobile-input-group">
                                <label className="mobile-input-label">올바른 HS CODE 입력</label>
                                <input
                                  type="text"
                                  className="mobile-input"
                                  placeholder="예: 8479899090"
                                  value={mobileHSCode}
                                  onChange={(e) => setMobileHSCode(e.target.value)}
                                />

                                {hsCandidates && hsCandidates.length > 0 && (
                                  <div className="hs-candidates-container" style={{ marginTop: '8px', marginBottom: '8px' }}>
                                    <div className="hs-candidates-title" style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-light)', marginBottom: '4px' }}>
                                      추천 HS CODE 후보군 (클릭 시 자동 기입):
                                    </div>
                                    <div className="hs-candidates-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                                      {hsCandidates.map((cand, idx) => (
                                        <div
                                          key={idx}
                                          className="hs-candidate-card"
                                          onClick={() => setMobileHSCode(cand.code)}
                                          style={{
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '6px',
                                            padding: '8px',
                                            cursor: 'pointer',
                                            backgroundColor: 'rgba(0, 0, 0, 0.02)',
                                            transition: 'background-color 0.2s, border-color 0.2s',
                                          }}
                                        >
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                            <span style={{ fontWeight: 'bold', fontSize: '12px', color: 'var(--primary-color)' }}>{cand.code}</span>
                                            <span style={{
                                              fontSize: '10px',
                                              padding: '2px 6px',
                                              borderRadius: '4px',
                                              backgroundColor: cand.confidence.includes('낮음') ? 'rgba(220, 53, 69, 0.1)' : cand.confidence.includes('보통') ? 'rgba(255, 193, 7, 0.1)' : 'rgba(40, 167, 69, 0.1)',
                                              color: cand.confidence.includes('낮음') ? '#d32f2f' : cand.confidence.includes('보통') ? '#b78103' : '#2e7d32',
                                              fontWeight: 'bold'
                                            }}>
                                              {cand.confidence}
                                            </span>
                                          </div>
                                          <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-dark)', marginBottom: '2px' }}>{cand.description}</div>
                                          <div style={{ fontSize: '10px', color: 'var(--text-light)', lineHeight: '1.3' }}>{cand.reasoning}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveHSCode} disabled={isRevalidating}>
                                  {isRevalidating ? '재검증 중...' : 'HS CODE 수정 반영'}
                                </button>
                              </div>
                            )}

                            {issue.docType === 'co' && (
                              <div className="mobile-input-group">
                                <label className="mobile-input-label">원산지 정보 선택</label>
                                <CountrySelect
                                  className="mobile-input"
                                  value={mobileOrigin}
                                  onChange={setMobileOrigin}
                                  emptyLabel="Select a country"
                                />
                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveOrigin} disabled={isRevalidating}>
                                  {isRevalidating ? '재검증 중...' : '원산지증명서 발급 요청'}
                                </button>
                              </div>
                            )}

                            {issue.id === 'insurance-missing' && (
                              <div className="mobile-input-group">
                                <label className="mobile-input-label">CIF 조건 필수 서류 — 적하보험증권을 준비하셨나요?</label>
                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveInsurance} disabled={isRevalidating}>
                                  {isRevalidating ? '재검증 중...' : '적하보험증권 준비 완료로 표시'}
                                </button>
                              </div>
                            )}

                            {/* overridable error: 사유 입력 후 override(진행) / override됨 배지 */}
                            {issue.severity === 'error' && issue.overridable && (
                              overrides[issueKey(issue)] ? (
                                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(16,185,129,0.12)', color: '#065f46', fontSize: 12, fontWeight: 600 }}>
                                  ✅ 경고 무시 처리됨 — 사유: {overrides[issueKey(issue)]}
                                </div>
                              ) : (
                                <button className="mobile-btn mobile-btn-secondary" onClick={() => { setOverrideTarget(issue); setOverrideReason(''); }}>
                                  경고 무시하고 생성 (사유 필요)
                                </button>
                              )
                            )}

                          </div>
                              </Fragment>
                            );
                          });
                        })()}

                      </div>
                    </>
                  )}

                    <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
                      <button
                        className="btn btn-primary"
                        onClick={handleSubmitAll}
                        disabled={blockingIssuesCount > 0 && !(IS_DEV_TEST_ENABLED && devTestMode !== null)}
                        style={{ flex: 1, opacity: blockingIssuesCount > 0 && !(IS_DEV_TEST_ENABLED && devTestMode !== null) ? 0.6 : 1, cursor: blockingIssuesCount > 0 && !(IS_DEV_TEST_ENABLED && devTestMode !== null) ? 'not-allowed' : 'pointer' }}
                      >
                        전체 문서 전송
                      </button>
                      <button className="btn btn-secondary" onClick={() => setHasGenerated(false)} style={{ flex: 1 }}>
                        뒤로 가기 (입력 수정)
                      </button>
                    </div>
                </div>
              </div>
            )}
            </>}
          </div>
        </main>
      </div>

      {/* 입력 화면 수정 안내 배너 — "입력 수정" 클릭 시 해당 필드로 이동하며 무엇을 고칠지 표시 */}
      {highlightField && !hasGenerated && (
        <div className="field-fix-banner" role="status">
          <span className="ffb-ic"><Pencil size={16} /></span>
          <div className="ffb-text">
            <b>강조된 항목을 수정하세요</b>
            <span>{highlightHint}</span>
          </div>
          <button className="ffb-close" onClick={clearFieldHighlight} aria-label="안내 닫기">✕</button>
        </div>
      )}

      {/* 4. Agent Execution Terminal Terminal Overlay */}
      {showConsole && (
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
              {consoleLogs.map((log, index) => (
                <div className="log-row" key={index}>
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className="log-agent">{log.agentName}:</span>
                  <span className={`log-text-content ${log.level}`}>
                    {log.message}
                  </span>
                </div>
              ))}
              {isProcessing && (
                <div className="log-row">
                  <span className="log-time">⏳</span>
                  <span className="log-agent" style={{ color: '#fb7185' }}>Pipeline:</span>
                  <span className="log-text-content" style={{ color: '#fb7185', fontStyle: 'italic' }}>
                    에이전트 연계 연산 처리 중...
                  </span>
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>

            <div className="console-footer">
              <button 
                className="btn btn-secondary btn-sm" 
                onClick={() => setShowConsole(false)}
                disabled={isProcessing}
                style={{ opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
              >
                콘솔 닫기
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 5. Premium Document Preview Modal */}
      {previewDocId && (
        <div className="preview-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div className="preview-modal-container" style={{
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
            width: '100%',
            maxWidth: '850px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}>
            {/* Modal Header */}
            <div className="preview-modal-header" style={{
              padding: '16px 24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#ffffff'
            }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
                {(({
                  invoice: '상업송장(Commercial Invoice)',
                  packing_list: '패킹리스트(Packing List)',
                  co: '원산지증명서(Certificate of Origin)',
                  bl: '선하증권(B/L)',
                  customs_dec: '통관신고서',
                  insurance: '적하보험증권(Insurance Policy)',
                } as Record<string, string>)[previewDocId ?? ''] ?? '문서')} 미리보기
              </h3>
              <button 
                onClick={() => setPreviewDocId(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#64748b',
                  lineHeight: '1'
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Content - HTML container */}
            <div className="preview-modal-body" style={{
              padding: '24px',
              overflowY: 'auto',
              flex: 1,
              display: 'flex',
              justifyContent: 'center',
              backgroundColor: '#f1f5f9'
            }}>
              {previewDocId === 'invoice' ? (
                // 상업송장: 생성된 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
                <div ref={docxPreviewRef} style={{ width: '100%' }} />
              ) : previewDocId === 'packing_list' ? (
                // 패킹리스트: 생성된 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
                <div ref={packingDocxPreviewRef} style={{ width: '100%' }} />
              ) : (
                <div
                  style={{ transform: 'scale(1)', transformOrigin: 'top center', width: '100%' }}
                  dangerouslySetInnerHTML={{ __html: htmlTemplates[previewDocId] || '<p>문서 양식이 생성되지 않았습니다.</p>' }}
                />
              )}
            </div>

            {/* Modal Footer */}
            <div className="preview-modal-footer" style={{
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '12px',
              backgroundColor: '#ffffff'
            }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setPreviewDocId(null)}
              >
                닫기
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleDownloadDoc(previewDocId)}
              >
                <Download size={16} />
                {previewDocId === 'invoice' ? 'DOCX + PDF 저장' : previewDocId === 'packing_list' ? 'DOCX 다운로드' : 'PDF 저장 (텍스트)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* override 사유 입력 모달 */}
      {overrideTarget && (
        <div
          onClick={() => { setOverrideTarget(null); setOverrideReason(''); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 92vw)', background: '#fff', borderRadius: 14, padding: '22px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800 }}>경고 무시하고 생성 — 사유 입력</h3>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#64748b' }}>이 경고를 무시하고 문서를 생성합니다. 입력한 사유는 문서 이력에 기록되어 본인·관리자 사후 검토에 활용됩니다.</p>
            <div style={{ margin: '10px 0 12px', padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
              <strong>[{overrideTarget.id}]</strong> {overrideTarget.message}
            </div>
            <textarea
              autoFocus
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder={"예:\n· 관세사와 협의됨 — 현재 상태로 신고 진행\n· 보세운송 건으로 동일국가 항구가 정상\n· 사업자번호 확정 전 초안만 생성"}
              style={{ width: '100%', minHeight: 88, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button className="btn btn-secondary" onClick={() => { setOverrideTarget(null); setOverrideReason(''); }}>취소</button>
              <button className="btn btn-primary" onClick={confirmOverride}>사유 기록하고 생성</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
