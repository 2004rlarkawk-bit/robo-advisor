import { useState, useEffect, useRef } from 'react';
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
  Edit3,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  Anchor,
  BookOpen
} from 'lucide-react';
import { TradeProfile, DocumentStatus, ValidationIssue, SavedTrade, TradeStatus, type ShipperItem } from './types';
import SettingsPanel from './components/SettingsPanel';
import DataAnalysisPanel from './components/DataAnalysisPanel';
import DocumentManagerPanel from './components/DocumentManagerPanel';
import AuthPage from './components/AuthPage';
import OnboardingPage from './components/OnboardingPage';
import ProfileSettingsPage from './components/ProfileSettingsPage';
import ForwarderWorkspaceForm from './components/ForwarderWorkspaceForm';
import ShipperWorkspaceForm from './components/ShipperWorkspaceForm';
import AboutPanel from './components/AboutPanel';
import GuidePanel from './components/GuidePanel';
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
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
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
  primaryShipperItemToTradeProfile,
  tradeProfileToPrimaryShipperItem,
  type ShipperSupplementalState,
} from './utils/shipperForm';
import { createEmptyForwarderFormState, type ForwarderFormState } from './utils/forwarderForm';

const IS_DEV_TEST_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_SUBMISSION === 'true';

export default function App() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
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

  blNo: '',
  issuePlace: '',
  issueDate: '',

  itemName: '',
  hsCode: '',
  countryOfOrigin: '',
  quantity: '',
  unit: 'EA',

  currency: 'KRW',
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
  const [additionalShipperItems, setAdditionalShipperItems] = useState<ShipperItem[]>([]);
  const [shipperSupplemental, setShipperSupplemental] = useState<ShipperSupplementalState>(EMPTY_SHIPPER_SUPPLEMENTAL_STATE);
  const [forwarderForm, setForwarderForm] = useState<ForwarderFormState>(() => createEmptyForwarderFormState());
  const hydratedProfileUserRef = useRef<string | null>(null);

  // 로그인 직후에만 회사 프로필을 거래 입력 기본값으로 옮긴다.
  // 이후 거래 화면에서 사용자가 수정한 값은 프로필 재조회로 덮어쓰지 않는다.
  useEffect(() => {
    if (!user) {
      hydratedProfileUserRef.current = null;
      return;
    }
    if (!userProfile || needsOnboarding || user.onboardingPending || hydratedProfileUserRef.current === user.id) return;
    setProfile((current) => ({ ...current, ...userProfileToTradeDefaults(userProfile) }));
    hydratedProfileUserRef.current = user.id;
  }, [needsOnboarding, user, userProfile]);

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
  const [aiFeedback, setAiFeedback] = useState<string>('');
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [htmlTemplates, setHtmlTemplates] = useState<Record<string, string>>({});

  // Mobile simulator inputs
  const [mobileWeight, setMobileWeight] = useState('');
  const [mobileHSCode, setMobileHSCode] = useState('');
  const [mobileOrigin, setMobileOrigin] = useState('');
  const [hsCandidates, setHsCandidates] = useState<{ code: string; description: string; confidence: string; reasoning: string; }[]>([]);

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
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const shipperItems = [tradeProfileToPrimaryShipperItem(profile), ...additionalShipperItems];
  const handleShipperItemsChange = (items: ShipperItem[]) => {
    if (items.length === 0) return;
    const [primaryItem, ...additionalItems] = items;
    setProfile((current) => ({ ...current, ...primaryShipperItemToTradeProfile(primaryItem) }));
    setAdditionalShipperItems(additionalItems);
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
  setAdditionalShipperItems([]);
  setShipperSupplemental(EMPTY_SHIPPER_SUPPLEMENTAL_STATE);
  setForwarderForm(createEmptyForwarderFormState());
  setHasGenerated(false);
  setDocuments([]);
  setIssues([]);
  setConsoleLogs([]);
  setHtmlTemplates({});
  setHsCandidates([]);
  currentTradeIdRef.current = null;
  setCurrentTradeStatus(null);
  isSubmittingTradeRef.current = false;
  hasSubmittedTradeRef.current = false;
  setAiFeedback('');
  setMobileWeight('');
  setMobileHSCode('');
  setMobileOrigin('');
};

  // Run the multi-agent pipeline simulator
  const handleGenerateDocuments = async () => {
    if (isProcessing) return;
    const writeMode = decideGeneratedTradeWrite(currentTradeIdRef.current, currentTradeStatus);
    if (hasSubmittedTradeRef.current || writeMode === 'blocked_submitted') {
      alert('이미 최종 제출된 거래입니다. 수정하려면 신규 거래 복사를 이용해주세요.');
      return;
    }
    setIsProcessing(true);
    setShowConsole(true);
    setConsoleLogs([]);

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
      setHtmlTemplates(result.documents?.htmlTemplates || {});
      setIssues(result.issues?.issues || []);
      setAiFeedback(result.feedback?.message || '');
      setHsCandidates(result.hs?.candidates || []);
      setHasGenerated(true);

      // 생성 이력 자동 저장 → [문서 관리] 메뉴에서 조회/복원
      try {
        const generatedTradeData = {
          profile: { ...generationProfile, hsCode: generationProfile.hsCode || result.hs?.topCode || '' },
          tradeDirection: 'export' as const,
          tradeRole: workspaceRole,
          documents: result.documents?.documents || [],
          issues: result.issues?.issues || [],
          generatedDocs: { htmlTemplates: result.documents?.htmlTemplates || {} },
        };
        if (writeMode === 'insert') {
          const createdTrade = await createGeneratedTrade(generatedTradeData);
          currentTradeIdRef.current = createdTrade.id;
          alert('필요 서류가 생성되고 새로운 거래가 저장되었습니다.');
        } else {
          const currentTradeId = currentTradeIdRef.current;
          if (!currentTradeId) throw new Error('현재 거래 ID가 없습니다.');
          const updatedTrade = await updateGeneratedTrade(currentTradeId, generatedTradeData);
          if (updatedTrade.id !== currentTradeId) throw new Error('재생성된 거래 ID가 현재 거래와 일치하지 않습니다.');
          alert('수정된 내용으로 필요 서류가 다시 생성되었으며 기존 거래가 업데이트되었습니다.');
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
    setAdditionalShipperItems([]);
    setShipperSupplemental(EMPTY_SHIPPER_SUPPLEMENTAL_STATE);
    setDocuments(t.documents);
    setIssues(t.issues);
    setHtmlTemplates((t.generatedDocs?.htmlTemplates as Record<string, string>) || {});
    setAiFeedback('');
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
    setAdditionalShipperItems([]);
    setShipperSupplemental(EMPTY_SHIPPER_SUPPLEMENTAL_STATE);
    setDocuments([]);
    setIssues([]);
    setHtmlTemplates({});
    setAiFeedback('');
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
      setIssues(result.issues?.issues || []);
      setAiFeedback(result.feedback?.message || '');
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

  const handleDownloadDoc = async (docId: string) => {
    const htmlContent = htmlTemplates[docId];
    if (!htmlContent) {
      alert('문서 양식 템플릿이 생성되지 않았습니다.');
      return;
    }

    setIsProcessing(true);
    
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '800px';
    container.style.backgroundColor = '#ffffff';
    container.innerHTML = htmlContent;
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true
      });
      const imgData = canvas.toDataURL('image/png');
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 297; // A4 세로 (mm)
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // A4 한 장을 넘는 문서는 페이지를 나눠 이어 붙인다 (하단 잘림 방지)
      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = getDocFileName(docId);
      pdf.save(fileName);
    } catch (error) {
      console.error('PDF Generation Error:', error);
      alert('PDF 다운로드 처리 중 오류가 발생했습니다.');
    } finally {
      document.body.removeChild(container);
      setIsProcessing(false);
    }
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

    const hasBlockingErrors = issues.some((issue) => issue.severity !== 'info');
    const canBypassValidation = IS_DEV_TEST_ENABLED && devTestMode !== null;
    if (hasBlockingErrors && !canBypassValidation) return;

    isSubmittingTradeRef.current = true;

    try {
      const validationErrorCount = issues.filter((issue) => issue.severity === 'error').length;
      const generatedDocs = devTestMode && canBypassValidation
        ? { htmlTemplates, _testMeta: createTestSubmissionMeta(devTestMode, validationErrorCount) }
        : { htmlTemplates };
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
  // 결과 상단 통계 바 — 생성 대상인데 자동 생성 양식이 아직 없는 서류(= '양식 준비 중' 카드) 개수
  const pendingTemplateCount = documents.filter(
    d => d.status !== 'not_needed' && d.status !== 'not_started' && !htmlTemplates[d.id]
  ).length;
  const blockingIssuesCount = issues.filter(i => i.severity !== 'info').length;
  const reviewDocsCount = blockingIssuesCount;
  // 실제 제출 전 준비도(%) — 서류가 몇 % 완료됐는지와 다음에 채워야 할 항목을 안내
  const readiness = calculateReadiness(documents);

  // AI 피드백에서 이슈 상세 라인(📦🔢🌍⚓⚠️ 접두)은 아래 보완 카드와 중복되므로
  // 요약 문단만 표시한다. 전부 이슈 라인이면(필터 결과가 비면) 원문 유지.
  const feedbackParagraphs = (() => {
    const lines = aiFeedback.split('\n').map(l => l.trim()).filter(Boolean);
    const summary = lines.filter(l => !/^(📦|🔢|🌍|⚓|⚠️)/.test(l));
    return summary.length > 0 ? summary : lines;
  })();

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
            <div className="menu-item disabled" title="준비 중인 기능입니다">
              <Layers size={18} />
              거래 관리
              <span className="badge-soon">준비중</span>
            </div>
          </li>
          <li>
            <div className="menu-item disabled" title="준비 중인 기능입니다">
              <FileCheck2 size={18} />
              통관 내역
              <span className="badge-soon">준비중</span>
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
            <button className="icon-btn" type="button" onClick={() => setActiveMenu('guide')} title="사용 안내" aria-label="사용 안내 페이지로 이동">
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
            {activeMenu === 'profile' ? <ProfileSettingsPage profile={userProfile} isSaving={isProfileSaving} onSave={async (values) => { await saveUserProfile(values); }} onDeleteAccount={handleDeleteAccount} />
            : activeMenu === 'settings' ? <SettingsPanel />
            : activeMenu === 'about' ? <AboutPanel onStart={() => setActiveMenu('dashboard')} />
            : activeMenu === 'guide' ? <GuidePanel />
            : activeMenu === 'analysis' ? <DataAnalysisPanel />
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
                : <ImportShipperFlow userId={user.id} onComplete={handleImportComplete} />
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
                  onProfilePatch={(patch) => setProfile((current) => ({ ...current, ...patch }))}
                  onItemsChange={handleShipperItemsChange}
                  onSupplementalChange={setShipperSupplemental}
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

                    <div className="form-group" data-docs="invoice packing_list co">
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

                    <div className="form-group" data-docs="invoice bl">
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

                    <div className="form-group" data-docs="invoice bl">
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

                    <div className="form-group" data-docs="invoice bl insurance">
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

                    <div className="form-group" data-docs="invoice packing_list co">
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

                    <div className="form-group" data-docs="packing_list">
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

                    <div className="form-group" data-docs="bl">
                      <label className="form-label">출발일</label>
                      <input
                        type="date"
                        className="form-input"
                        value={profile.departureDate}
                        onChange={(e) => handleInputChange('departureDate', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="bl">
                      <label className="form-label">도착예정일</label>
                      <input
                        type="date"
                        className="form-input"
                        value={profile.arrivalDate}
                        onChange={(e) => handleInputChange('arrivalDate', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="invoice packing_list co">
                      <label className="form-label">업체명</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="업체명을 입력하세요"
                        value={profile.companyName}
                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                      />
                    </div>

                    <div className="form-group" data-docs="invoice packing_list co">
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

                      <div className="form-group" data-docs="invoice">
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

                      <div className="form-group" data-docs="invoice">
                        <label className="form-label">단가</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="예: 12"
                          value={profile.unitPrice}
                          onChange={(e) => handleInputChange('unitPrice', e.target.value ? Number(e.target.value) : '')}
                        />
                      </div>

                      <div className="form-group" data-docs="invoice">
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

                      <div className="form-group" data-docs="invoice customs_dec">
                        <label className="form-label">결제 통화</label>
                        <select
                          className="form-input"
                          value={profile.currency || 'KRW'}
                          onChange={(e) => handleInputChange('currency', e.target.value)}
                        >
                          <option value="KRW">KRW (원화)</option>
                          <option value="USD">USD (미국 달러)</option>
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
                          <span className="suffix-text">{profile.currency || 'KRW'}</span>
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

                {/* Right Guide Card */}
                <div className="info-card">
                  <div className="info-visual">
                    <span className="visual-ship">🚢</span>
                    <div className="visual-dots">
                      <span>•</span>
                      <span>•</span>
                      <span>✓</span>
                    </div>
                  </div>
                  <div className="info-text-section">
                    <h3 className="info-title">안내</h3>
                    <p className="info-desc">입력된 정보를 바탕으로 통관 및 선적 관련 필수 문서를 자동으로 생성하고 검증 규칙을 돌려 오류를 잡아냅니다.</p>
                  </div>
                </div>
              </div>
            ) : (
              /* --- 결과 리포트 대시보드 모드 --- */
              <div className="workspace-area">
                <div className="result-header-summary">
                  <div className="summary-badge-list">
                    <div className="summary-badge">
                      <span className="summary-badge-icon">🏷️</span>
                      수출입 구분: {profile.tradeType === 'export' ? '수출' : '수입'}
                    </div>
                    {profile.itemName && (
                      <div className="summary-badge">
                        <span className="summary-badge-icon">📦</span>
                        품목명: {profile.itemName}
                      </div>
                    )}
                    {profile.loadPort && (
                      <div className="summary-badge">
                        <span className="summary-badge-icon">⚓</span>
                        선적항: {profile.loadPort}
                      </div>
                    )}
                    {profile.dischargePort && (
                      <div className="summary-badge">
                        <span className="summary-badge-icon">🏁</span>
                        도착항: {profile.dischargePort}
                      </div>
                    )}
                    {profile.incoterms && (
                      <div className="summary-badge">
                        <span className="summary-badge-icon">📄</span>
                        거래조건: {profile.incoterms}
                      </div>
                    )}
                  </div>

                  <button className="btn btn-secondary btn-sm" onClick={() => setShowConsole(true)}>
                    <Terminal size={14} />
                    에이전트 실행 로그 확인
                  </button>
                </div>

                {/* 실제 제출 전 준비도 바 */}
                <div className="readiness-card">
                  <div className="readiness-card-header">
                    <span className="readiness-card-title">수출 준비도</span>
                    <span className="readiness-card-percent">{readiness.percent}%</span>
                  </div>
                  <div className="readiness-bar-track">
                    <div className="readiness-bar-fill" style={{ width: `${readiness.percent}%` }} />
                  </div>
                  {readiness.nextStepLabel && (
                    <p className="readiness-next-step">다음 단계: {readiness.nextStepLabel}</p>
                  )}
                </div>

                {/* 결과 요약 통계 바 */}
                <div className="result-stats-grid">
                  <div className="result-stat-card">
                    <span className="result-stat-label">필요 서류</span>
                    <span className="result-stat-value">{documents.length}</span>
                  </div>
                  <div className="result-stat-card">
                    <span className="result-stat-label">생성 완료</span>
                    <span className="result-stat-value">{completedDocsCount}</span>
                  </div>
                  <div className="result-stat-card">
                    <span className="result-stat-label">양식 준비 중</span>
                    <span className="result-stat-value">{pendingTemplateCount}</span>
                  </div>
                  <div className="result-stat-card">
                    <span className="result-stat-label">보완 필요</span>
                    <span className="result-stat-value">{reviewDocsCount}</span>
                  </div>
                </div>

                <div className="result-columns-layout">
                  {/* Column 1: 필요 서류 목록 */}
                  <div className="result-column">
                    <div className="col-header">
                      <div className="col-number">1</div>
                      <h3 className="col-title">필요 서류 목록</h3>
                    </div>

                    <div className="doc-item-list">
                      {documents.map((doc) => {
                        let badgeClass = 'status-not-started';
                        if (doc.status === 'completed') badgeClass = 'status-completed';
                        else if (doc.status === 'review_required') badgeClass = 'status-review-required';
                        else if (doc.status === 'not_needed') badgeClass = 'status-not-needed';

                        return (
                          <div className="doc-item-card" key={doc.id}>
                            <div className="doc-item-left">
                              <FileText size={16} className="text-light" />
                              {doc.name}
                            </div>
                            <span className={`status-badge ${badgeClass}`}>
                              {doc.statusText}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Column 2: 문서 생성 결과 프리뷰 */}
                  <div className="result-column">
                    <div className="col-header">
                      <div className="col-number">2</div>
                      <h3 className="col-title">문서 생성 결과</h3>
                    </div>

                    <div className="doc-preview-list">
                      {documents
                        .filter(d => d.status !== 'not_needed' && d.status !== 'not_started')
                        .map((doc) => (
                          <div 
                            className={`preview-card ${doc.status === 'completed' ? 'success-border' : 'warning-border'}`}
                            key={doc.id}
                          >
                            <div className="preview-header">
                              <div className="preview-title-sec">
                                <div className={`doc-icon-box doc-icon-${doc.id}`}>
                                  {doc.id === 'invoice' ? 'INV' : doc.id === 'packing_list' ? 'PKL' : doc.id === 'bl' ? 'B/L' : 'DOC'}
                                </div>
                                <div className="preview-details">
                                  <span className="preview-name">{doc.name}</span>
                                  {doc.lastReviewed && (
                                    <span className="preview-time">마지막 검토: {doc.lastReviewed}</span>
                                  )}
                                </div>
                              </div>
                              
                              <div className="preview-actions">
                                {htmlTemplates[doc.id] ? (
                                  <>
                                    <button
                                      className="action-btn-circle"
                                      title="미리보기"
                                      onClick={() => setPreviewDocId(doc.id)}
                                    >
                                      <Eye size={14} />
                                    </button>
                                    <button
                                      className="action-btn-circle"
                                      title="다운로드"
                                      onClick={() => handleDownloadDoc(doc.id)}
                                    >
                                      <Download size={14} />
                                    </button>
                                    <button className="action-btn-circle" title="편집">
                                      <Edit3 size={14} />
                                    </button>
                                  </>
                                ) : (
                                  <span
                                    title="이 서류의 자동 생성 양식은 준비 중입니다"
                                    style={{ fontSize: '11px', color: 'var(--text-light)', padding: '4px 8px', border: '1px dashed var(--border-color)', borderRadius: '10px' }}
                                  >
                                    양식 준비 중
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      
                      {documents.filter(d => d.status !== 'not_needed' && d.status !== 'not_started').length === 0 && (
                        <div className="mobile-empty-state">
                          <span className="mobile-empty-icon">📁</span>
                          <span className="mobile-empty-text">생성된 문서 없음</span>
                          <span className="mobile-empty-sub">아래 검토 안내에 따라 입력을 보완해 주세요.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Section 3: AI 검토 및 보완 워크스페이스 — 스크롤 하단 전체 폭 */}
                <div className="result-column result-review-full">
                    <div className="col-header">
                      <div className="col-number">3</div>
                      <h3 className="col-title">검토 및 입력 보완 안내</h3>
                    </div>

                    <div className="review-summary-line">
                      <span className="review-summary-item">
                        <CheckCircle2 size={14} className="text-success" />
                        검토 완료 <strong>{completedDocsCount}</strong>건
                      </span>
                      <span className="review-summary-item">
                        <AlertTriangle size={14} className="text-warning" />
                        보완 필요 <strong>{reviewDocsCount}</strong>건
                      </span>
                    </div>

                    <div className="ai-report-box">
                      <div className="ai-header">
                        <CheckCircle2 size={16} className="text-success" />
                        AI 분석 결과
                      </div>

                      {aiFeedback && (
                        <div className="ai-feedback-narrative">
                          {feedbackParagraphs.map((line, idx) => (
                            <p key={idx}>{line}</p>
                          ))}
                        </div>
                      )}

                      <div className="mobile-fix-list">
                        {issues.map((issue) => (
                          <div className="mobile-fix-card" key={issue.id}>
                            <div className="mobile-fix-header">
                              <div className="mobile-fix-info">
                                <span className="mobile-fix-name">
                                  {issue.docType === 'invoice' ? '상업송장' :
                                   issue.docType === 'packing_list' ? '패킹리스트' :
                                   issue.docType === 'bl' ? '선하증권(B/L)' :
                                   issue.docType === 'customs_dec' ? '통관신고서' :
                                   issue.docType === 'co' ? '원산지증명서' :
                                   issue.docType === 'insurance' ? '적하보험증권' : '기타 서류'}
                                </span>
                                <span className="mobile-fix-msg">{issue.message}</span>
                              </div>
                              <span className={`mobile-fix-badge ${
                                issue.severity === 'error' ? 'status-error' :
                                issue.severity === 'info' ? 'status-info' : 'status-review-required'
                              }`}>
                                {issue.severity === 'error' ? '오류' :
                                 issue.severity === 'info' ? '안내' : '보완 필요'}
                              </span>
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

                            {/* 전용 보완 입력이 없는 이슈는 입력 화면으로 돌아가 수정 */}
                            {issue.severity !== 'info' &&
                              issue.field !== 'weight' &&
                              issue.field !== 'hsCode' &&
                              issue.docType !== 'co' &&
                              issue.id !== 'insurance-missing' && (
                              <button className="mobile-btn mobile-btn-secondary" onClick={() => setHasGenerated(false)}>
                                입력 화면에서 수정
                              </button>
                            )}
                          </div>
                        ))}

                        {issues.length === 0 && (
                          <div className="warning-item info">
                            <span className="warning-icon">✅</span>
                            <div className="warning-body">
                              <span className="warning-title">문서 검증 통과</span>
                              <span className="warning-text">수출입 통관 및 해상 운송에 필요한 모든 서류 규격이 완벽히 충족되었습니다.</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

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
              <div 
                style={{ transform: 'scale(1)', transformOrigin: 'top center', width: '100%' }}
                dangerouslySetInnerHTML={{ __html: htmlTemplates[previewDocId] || '<p>문서 양식이 생성되지 않았습니다.</p>' }}
              />
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
                PDF 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
