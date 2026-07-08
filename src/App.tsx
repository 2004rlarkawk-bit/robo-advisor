import { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Download,
  Eye,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  RotateCcw,
  Settings,
  Terminal,
  Wand2,
} from 'lucide-react';
import AuthPage from './components/AuthPage';
import DataAnalysisPanel from './components/DataAnalysisPanel';
import DocumentManagerPanel from './components/DocumentManagerPanel';
import SettingsPanel from './components/SettingsPanel';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import type { AgentLog } from './agents/types';
import type { DocumentStatus, SavedTrade, TradeProfile, TradeStatus, ValidationIssue } from './types';
import {
  AuthSessionUser,
  getCurrentAuthUser,
  onAuthStateChange,
  signOutUser,
} from './services/authService';
import { fetchSavedTradeById, markTradeAsSubmitted, saveTrade } from './services/storageService';
import { clearDraftCache, loadDraftCache, saveDraftCache } from './services/draftCacheService';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const emptyProfile: TradeProfile = {
  tradeType: 'export',
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
  partnerName: '',
  currency: 'KRW',
  invoiceAmount: '',
  businessRegistrationNo: '',
  documentNo: '',
  invoiceNo: '',
  invoiceDate: '',
  referenceNo: '',
  blNo: '',
  issuePlace: '',
  issueDate: '',
  countryOfOrigin: '',
  unit: 'EA',
  unitPrice: '',
  totalAmount: '',
  packageCount: '',
  packageType: '',
  netWeight: '',
  grossWeight: '',
  measurement: '',
  shippingMarks: '',
  vesselOrFlight: '',
  carrier: '',
  placeOfReceipt: '',
  placeOfDelivery: '',
  finalDestination: '',
  voyageNo: '',
  flag: '',
  containerNo: '',
  sealNo: '',
  paymentTerms: '',
  reasonForExport: '',
  freightTerms: '',
  freightCharges: '',
  freightPrepaidAt: '',
  freightPayableAt: '',
  companyAddress: '',
  companyCountry: '',
  taxNo: '',
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
  signerPosition: '',
};

type MenuKey = 'dashboard' | 'docs' | 'analysis' | 'settings';
type DashboardMode = 'new' | 'view' | 'copy';

const COUNTRY_OPTIONS = [
  '대한민국',
  '미국',
  '중국',
  '일본',
  '베트남',
  '독일',
  '영국',
  '프랑스',
  '인도',
  '인도네시아',
  '태국',
  '말레이시아',
  '싱가포르',
  '호주',
];

// [EDIT: Trade Persistence] 캐시에서 복원한 메뉴 값이 실제 메뉴인지 확인합니다.
const isMenuKey = (value: string | undefined): value is MenuKey =>
  value === 'dashboard' || value === 'docs' || value === 'analysis' || value === 'settings';

// [EDIT: Document Management] 캐시에서 복원한 대시보드 모드가 실제 허용 모드인지 확인합니다.
const isDashboardMode = (value: string | undefined): value is DashboardMode =>
  value === 'new' || value === 'view' || value === 'copy';

export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard');
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<TradeProfile>(emptyProfile);
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTradeId, setCurrentTradeId] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [tradeStatus, setTradeStatus] = useState<TradeStatus>('draft');
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>('new');
  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [htmlTemplates, setHtmlTemplates] = useState<Record<string, string>>({});
  const [mobileWeight, setMobileWeight] = useState('');
  const [mobileHSCode, setMobileHSCode] = useState('');
  const [mobileOrigin, setMobileOrigin] = useState('');
  const [isSolvingOrigin, setIsSolvingOrigin] = useState(false);
  const [hsCandidates, setHsCandidates] = useState<
    { code: string; description: string; confidence: string; reasoning: string }[]
  >([]);
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const hasRestoredDraftRef = useRef(false);
  const skipNextAutoSaveRef = useRef(false);

  // [EDIT: Supabase Auth] 앱 시작 시 Supabase 세션을 확인해서 새로고침 후에도 로그인 상태를 유지합니다.
  useEffect(() => {
    let mounted = true;

    getCurrentAuthUser()
      .then((authUser) => {
        if (mounted) setUser(authUser);
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    const { data } = onAuthStateChange((authUser) => {
      setUser(authUser);
      if (!authUser) {
        setActiveMenu('dashboard');
        setCurrentTradeId(null);
        hasRestoredDraftRef.current = false;
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // [EDIT: Trade Persistence] 로그인한 사용자별 작업 캐시를 앱 시작/로그인 직후 한 번 복원합니다.
  useEffect(() => {
    if (!user?.id || authLoading || hasRestoredDraftRef.current) return;

    const restoreDraft = async () => {
      try {
        const cached = loadDraftCache(user.id);
        if (!cached) {
          hasRestoredDraftRef.current = true;
          return;
        }

        let restoredTradeId = cached.currentTradeId ?? null;
        if (restoredTradeId) {
          const existingTrade = await fetchSavedTradeById(restoredTradeId);
          if (!existingTrade) {
            restoredTradeId = null;
          }
        }

        setProfile({ ...emptyProfile, ...cached.profile });
        setCurrentTradeId(restoredTradeId);
        setDocuments(cached.documents ?? []);
        setIssues(cached.issues ?? []);
        setHtmlTemplates(cached.htmlTemplates ?? {});
        setAiFeedback(cached.aiFeedback ?? '');
        setHsCandidates(cached.hsCandidates ?? []);
        setHasGenerated(Boolean(cached.hasGenerated));
        setTradeStatus(cached.tradeStatus ?? 'draft');
        setDashboardMode(isDashboardMode(cached.dashboardMode) && cached.dashboardMode !== 'view' ? cached.dashboardMode : 'new');
        setActiveMenu(isMenuKey(cached.activeMenu) ? cached.activeMenu : 'dashboard');
      } catch (error) {
        console.warn('[EDIT: Trade Persistence] 작업 캐시 복원 실패:', error);
        clearDraftCache(user.id);
      } finally {
        hasRestoredDraftRef.current = true;
      }
    };

    restoreDraft();
  }, [authLoading, user?.id]);

  // [EDIT: Trade Persistence] 입력/생성/검증 상태가 바뀌면 현재 사용자 전용 캐시에 500ms debounce로 자동 저장합니다.
  useEffect(() => {
    if (!user?.id || authLoading || !hasRestoredDraftRef.current || dashboardMode === 'view') return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      saveDraftCache(user.id, {
        profile,
        currentTradeId,
        hasGenerated,
        documents,
        issues,
        htmlTemplates,
        aiFeedback,
        hsCandidates,
        activeMenu,
        dashboardMode,
        tradeStatus,
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    activeMenu,
    aiFeedback,
    authLoading,
    currentTradeId,
    documents,
    dashboardMode,
    hasGenerated,
    hsCandidates,
    htmlTemplates,
    issues,
    profile,
    tradeStatus,
    user?.id,
  ]);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isProcessing]);

  useEffect(() => {
    if (!issues.some((issue) => issue.field === 'weight')) {
      setMobileWeight('');
    }
    if (!issues.some((issue) => issue.field === 'hsCode')) {
      setMobileHSCode('');
    }
    if (!issues.some((issue) => issue.docType === 'co' || issue.field === 'countryOfOrigin')) {
      setMobileOrigin('');
    }
  }, [issues]);

  const handleInputChange = (field: keyof TradeProfile, value: string | number) => {
    // [EDIT: Document Management] 조회 모드에서는 입력값을 수정하지 않습니다.
    if (dashboardMode === 'view') return;
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleQuickFill = (type: 'export_error' | 'import_valid') => {
    // [EDIT: Document Management] 조회 모드에서는 테스트 시나리오도 입력값을 바꾸지 않습니다.
    if (dashboardMode === 'view') return;

    if (type === 'export_error') {
      setProfile({
        ...emptyProfile,
        tradeType: 'export',
        documentNo: 'DOC-20260701-001',
        invoiceNo: 'INV-20260701-001',
        invoiceDate: '2026-07-01',
        referenceNo: 'REF-INCHON-001',
        blNo: 'BL-20260701-001',
        issuePlace: 'Seoul, Korea',
        issueDate: '2026-07-01',
        itemName: 'Industrial metal parts',
        hsCode: 'ABC-12',
        countryOfOrigin: 'Republic of Korea',
        quantity: 1500,
        unit: 'EA',
        currency: 'USD',
        unitPrice: 12,
        totalAmount: 18000,
        invoiceAmount: 18000,
        packageCount: 30,
        packageType: 'Carton',
        netWeight: 2200,
        grossWeight: '',
        weight: '',
        measurement: '3.5 CBM',
        shippingMarks: 'INCHON TECH / SHANGHAI / C/T NO. 1-30',
        loadPort: 'Busan',
        dischargePort: 'Shanghai',
        departureDate: '2026-07-01',
        arrivalDate: '2026-07-05',
        vesselOrFlight: 'KMTC BUSAN V.2501',
        carrier: 'KMTC',
        placeOfReceipt: 'Busan, Korea',
        placeOfDelivery: 'Shanghai, China',
        finalDestination: 'Shanghai, China',
        voyageNo: '2501E',
        flag: 'Korea',
        containerNo: 'TCLU1234567',
        sealNo: 'SEAL987654',
        incoterms: 'FOB',
        paymentTerms: 'T/T in advance',
        reasonForExport: 'Sale of goods',
        freightTerms: 'Prepaid',
        freightCharges: 'Prepaid',
        freightPrepaidAt: 'Busan, Korea',
        freightPayableAt: '',
        companyName: 'Incheon Tech',
        companyAddress: 'Yeonsu-gu, Incheon, Korea',
        companyCountry: 'Republic of Korea',
        contact: '010-1234-5678',
        taxNo: '123-45-67890',
        businessRegistrationNo: '123-45-67890',
        partnerName: 'Shanghai Import Co.',
        partnerAddress: 'Pudong New Area, Shanghai, China',
        partnerCountry: 'China',
        partnerContact: '+86-21-0000-0000',
        buyerName: 'Shanghai Import Co.',
        buyerAddress: 'Pudong New Area, Shanghai, China',
        buyerCountry: 'China',
        notifyPartyName: 'Shanghai Import Co.',
        notifyPartyAddress: 'Pudong New Area, Shanghai, China',
        notifyPartyContact: '+86-21-0000-0000',
        signedBy: 'Kim Jimin',
        signerName: 'Kim Jimin',
        signerPosition: 'Export Manager',
      });
      return;
    }

    setProfile({
      ...emptyProfile,
      tradeType: 'import',
      documentNo: 'DOC-20260715-001',
      invoiceNo: 'INV-20260715-001',
      invoiceDate: '2026-07-15',
      referenceNo: 'REF-GLOBAL-001',
      blNo: 'BL-20260715-001',
      issuePlace: 'Los Angeles, USA',
      issueDate: '2026-07-15',
      itemName: 'IT electronic parts',
      hsCode: '8517621010',
      countryOfOrigin: 'United States',
      quantity: 800,
      unit: 'EA',
      currency: 'USD',
      unitPrice: 150,
      totalAmount: 120000,
      invoiceAmount: 120000,
      packageCount: 20,
      packageType: 'Pallet',
      netWeight: 2200,
      grossWeight: 2400,
      weight: 2400,
      measurement: '5.2 CBM',
      shippingMarks: 'GLOBAL LOGISTICS / INCHEON / P/L NO. 1-20',
      loadPort: 'Los Angeles',
      dischargePort: 'Incheon',
      departureDate: '2026-07-15',
      arrivalDate: '2026-07-30',
      vesselOrFlight: 'MAERSK LA V.3302',
      carrier: 'Maersk',
      placeOfReceipt: 'Los Angeles, USA',
      placeOfDelivery: 'Incheon, Korea',
      finalDestination: 'Incheon, Korea',
      voyageNo: '3302W',
      flag: 'USA',
      containerNo: 'MSCU7654321',
      sealNo: 'SEAL123456',
      incoterms: 'CIF',
      paymentTerms: 'T/T 30 days',
      reasonForExport: 'Commercial transaction',
      freightTerms: 'Collect',
      freightCharges: 'Collect',
      freightPrepaidAt: '',
      freightPayableAt: 'Incheon, Korea',
      companyName: 'Global Logistics',
      companyAddress: 'Jung-gu, Seoul, Korea',
      companyCountry: 'Republic of Korea',
      contact: '02-123-4567',
      taxNo: '124-81-00998',
      businessRegistrationNo: '124-81-00998',
      partnerName: 'California Export Co.',
      partnerAddress: 'Los Angeles, CA, USA',
      partnerCountry: 'United States',
      partnerContact: '+1-213-000-0000',
      buyerName: 'Global Logistics',
      buyerAddress: 'Jung-gu, Seoul, Korea',
      buyerCountry: 'Republic of Korea',
      notifyPartyName: 'Global Logistics',
      notifyPartyAddress: 'Jung-gu, Seoul, Korea',
      notifyPartyContact: '02-123-4567',
      signedBy: 'Hong Gil Dong',
      signerName: 'Hong Gil Dong',
      signerPosition: 'Import Manager',
    });
  };

  // [EDIT: Trade Persistence] 화면 state 초기화와 사용자별 캐시 삭제 여부를 분리합니다.
  const resetWorkspace = (options: { clearCache: boolean }) => {
    if (options.clearCache && user?.id) {
      clearDraftCache(user.id);
      skipNextAutoSaveRef.current = true;
    }
    setProfile(emptyProfile);
    setDocuments([]);
    setIssues([]);
    setLogs([]);
    setAiFeedback('');
    setCurrentTradeId(null);
    setPreviewDocId(null);
    setHtmlTemplates({});
    setMobileWeight('');
    setMobileHSCode('');
    setMobileOrigin('');
    setHsCandidates([]);
    setHasGenerated(false);
    setTradeStatus('draft');
    setDashboardMode('new');
    setShowConsole(false);
    hasRestoredDraftRef.current = Boolean(user?.id);
  };

  const handleReset = () => {
    resetWorkspace({ clearCache: true });
  };

  // [EDIT: Supabase Auth] 로그인 성공 시 회원 전용 메인 화면으로 이동합니다.
  const handleAuthSuccess = (authUser: AuthSessionUser) => {
    setUser(authUser);
    setActiveMenu('dashboard');
  };

  // [EDIT: Supabase Auth] Supabase 세션을 종료하고 메인 데이터를 초기화합니다.
  const handleLogout = async () => {
    // [EDIT: Trade Persistence] 로그아웃 직전 최신 작업 상태를 현재 사용자 캐시에 남겨 다음 로그인 때 복원합니다.
    if (user?.id && dashboardMode !== 'view') {
      saveDraftCache(user.id, {
        profile,
        currentTradeId,
        hasGenerated,
        documents,
        issues,
        htmlTemplates,
        aiFeedback,
        hsCandidates,
        activeMenu,
        dashboardMode,
        tradeStatus,
      });
    }

    await signOutUser();
    setUser(null);
    resetWorkspace({ clearCache: false });
    hasRestoredDraftRef.current = false;
  };

  const handleGenerateDocuments = async () => {
    if (dashboardMode === 'view') {
      alert('조회 모드에서는 필요서류를 생성할 수 없습니다.');
      return;
    }

    setIsProcessing(true);
    setTradeStatus('generating');
    setShowConsole(true);
    setLogs([]);

    try {
      const orchestrator = new OrchestratorAgent();
      const result = await orchestrator.run({ profile, useLLM: true });

      for (const log of result.logs || []) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        setLogs((prev) => [...prev, log]);
      }

      const nextProfile = {
        ...profile,
        hsCode: profile.hsCode || result.hs?.topCode || '',
      };

      setProfile(nextProfile);
      setDocuments(result.documents?.documents || []);
      setHtmlTemplates(result.documents?.htmlTemplates || {});
      setIssues(result.issues?.issues || []);
      setAiFeedback(result.feedback?.message || '');
      setHsCandidates(result.hs?.candidates || []);

      // [EDIT: Trade Persistence] currentTradeId가 있으면 새 row가 아니라 같은 거래 row를 업데이트합니다.
      const saved = await saveTrade(
        nextProfile,
        result.documents?.documents || [],
        result.issues?.issues || [],
        { htmlTemplates: result.documents?.htmlTemplates || {} },
        { tradeId: currentTradeId, status: 'generated' }
      );
      setCurrentTradeId(saved.id);
      setHasGenerated(true);
      setTradeStatus('generated');
    } catch (err) {
      console.error(err);
      setTradeStatus('failed');
      alert(err instanceof Error ? err.message : '문서 생성 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleViewSubmittedTrade = (trade: SavedTrade) => {
    // [EDIT: Document Management] 조회는 최종 전송 거래를 읽기 전용으로 보여주며 DB insert/update를 실행하지 않습니다.
    setProfile(trade.profile);
    setDocuments(trade.documents);
    setIssues(trade.issues);
    setHtmlTemplates((trade.generatedDocs?.htmlTemplates as Record<string, string>) || {});
    setAiFeedback('');
    setHsCandidates([]);
    setCurrentTradeId(trade.id);
    setHasGenerated(trade.documents.length > 0);
    setTradeStatus(trade.status ?? 'generated');
    setDashboardMode('view');
    setActiveMenu('dashboard');
  };

  const handleCopySubmittedTrade = (trade: SavedTrade) => {
    // [EDIT: Document Management] 신규 거래 복사는 원본 거래 ID와 제출 상태를 복사하지 않습니다.
    setProfile({ ...emptyProfile, ...trade.profile });
    setDocuments([]);
    setIssues([]);
    setHtmlTemplates({});
    setAiFeedback('');
    setHsCandidates([]);
    setCurrentTradeId(null);
    setHasGenerated(false);
    setTradeStatus('draft');
    setDashboardMode('copy');
    setActiveMenu('dashboard');
  };

  const rerunAgents = async (updatedProfile: TradeProfile) => {
    try {
      const orchestrator = new OrchestratorAgent();
      const result = await orchestrator.run({ profile: updatedProfile, useLLM: true });

      if (result.error) {
        console.error('Agent rerun failed:', result.error.message);
        return;
      }

      setDocuments(result.documents?.documents || []);
      setHtmlTemplates(result.documents?.htmlTemplates || {});
      setIssues(result.issues?.issues || []);
      setAiFeedback(result.feedback?.message || '');
      setHsCandidates(result.hs?.candidates || []);
      setLogs(result.logs || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSolveWeight = async () => {
    if (isReadOnlyDashboard) return;
    if (!mobileWeight || Number.isNaN(Number(mobileWeight))) return;
    const updatedProfile = { ...profile, weight: Number(mobileWeight) };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const handleSolveHSCode = async () => {
    if (isReadOnlyDashboard) return;
    if (!mobileHSCode.trim()) return;
    const updatedProfile = { ...profile, hsCode: mobileHSCode.trim() };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const handleSolveOrigin = async () => {
    if (isReadOnlyDashboard) return;
    const selectedOrigin = mobileOrigin.trim();
    if (!selectedOrigin) {
      alert('원산지 국가를 선택해 주세요.');
      return;
    }

    setIsSolvingOrigin(true);
    try {
      const updatedProfile: TradeProfile = {
        ...profile,
        countryOfOrigin: selectedOrigin,
      };
      setProfile(updatedProfile);
      await rerunAgents(updatedProfile);
    } catch (error) {
      console.error('원산지 정보 반영 실패:', error);
      alert('원산지 정보를 반영하는 중 오류가 발생했습니다.');
    } finally {
      setIsSolvingOrigin(false);
    }
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
      alert('문서 양식이 아직 생성되지 않았습니다.');
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
        useCORS: true,
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      pdf.save(getDocFileName(docId));
    } catch (error) {
      console.error('PDF Generation Error:', error);
      alert('PDF 다운로드 중 오류가 발생했습니다.');
    } finally {
      document.body.removeChild(container);
      setIsProcessing(false);
    }
  };

  const blockingIssuesCount = issues.filter((issue) => issue.severity === 'error').length;
  const isReadOnlyDashboard = dashboardMode === 'view';

  const canSubmitAll =
    Boolean(user?.id) &&
    hasGenerated &&
    Boolean(currentTradeId) &&
    documents.length > 0 &&
    blockingIssuesCount === 0 &&
    !isReadOnlyDashboard &&
    !isSubmitting &&
    tradeStatus !== 'submitted';

  const handleSubmitAll = async () => {
    // [EDIT: Trade Persistence] 전체 문서 전송은 새 거래를 만들지 않고 현재 거래 row의 status/submitted_at만 갱신합니다.
    if (isReadOnlyDashboard) {
      alert('조회 모드에서는 전체 문서 전송을 실행할 수 없습니다.');
      return;
    }
    if (!user?.id) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (!currentTradeId || !hasGenerated || documents.length === 0) {
      alert('먼저 필요 서류를 생성해 주세요.');
      return;
    }
    if (blockingIssuesCount > 0) {
      alert('검증 오류를 먼저 해결해 주세요.');
      return;
    }
    if (tradeStatus === 'submitted') {
      alert('이미 전송 완료된 거래입니다.');
      return;
    }

    setIsSubmitting(true);
    setTradeStatus('submitting');
    try {
      const submitted = await markTradeAsSubmitted(currentTradeId, {
        profile,
        documents,
        issues,
        generatedDocs: { htmlTemplates },
      });
      setCurrentTradeId(submitted.id);
      setTradeStatus('submitted');
      alert('전체 문서 전송 상태가 저장되었습니다.');
    } catch (error) {
      console.error('전체 문서 전송 실패:', error);
      setTradeStatus('generated');
      alert('전체 문서 전송 처리 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="login-logo">P</div>
            <div className="login-brand">PortAI</div>
            <div className="login-subtitle">로그인 상태를 확인하고 있습니다.</div>
          </div>
        </div>
      </div>
    );
  }

  // [EDIT: Supabase Auth] 비회원은 메인 서비스를 볼 수 없고 AuthPage만 볼 수 있습니다.
  if (!user) {
    return <AuthPage onAuthenticated={handleAuthSuccess} />;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-section">
          <div className="logo-icon">P</div>
          <div>
            <div className="logo-text">PortAI</div>
            <div className="logo-sub">회원 전용 서비스</div>
          </div>
        </div>

        <ul className="menu-list">
          <li>
            <button className={`menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveMenu('dashboard')}>
              <LayoutDashboard size={18} />
              대시보드
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeMenu === 'docs' ? 'active' : ''}`} onClick={() => setActiveMenu('docs')}>
              <FolderKanban size={18} />
              문서 관리
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeMenu === 'analysis' ? 'active' : ''}`} onClick={() => setActiveMenu('analysis')}>
              <BarChart3 size={18} />
              데이터 분석
            </button>
          </li>
          <li>
            <button className={`menu-item ${activeMenu === 'settings' ? 'active' : ''}`} onClick={() => setActiveMenu('settings')}>
              <Settings size={18} />
              설정
            </button>
          </li>
        </ul>
      </aside>

      <div className="main-wrapper">
        <header className="header">
          <div className="header-title-sec">
            <span className="platform-badge">Mentoring Project 2026</span>
          </div>

          <div className="user-info-section">
            <div className="user-profile">
              {/* [EDIT: Supabase Auth] 로그인한 Supabase 사용자의 email/id를 이후 trade 연결에 사용할 수 있습니다. */}
              <div className="user-avatar">M</div>
              <span>{user.email}</span>
              <span className="auth-badge member">회원</span>
            </div>
            <button className="btn-logout" onClick={handleLogout}>
              <LogOut size={14} />
              로그아웃
            </button>
          </div>
        </header>

        <main className="content-body">
          {activeMenu === 'settings' && <SettingsPanel />}
          {activeMenu === 'analysis' && <DataAnalysisPanel />}
          {activeMenu === 'docs' && (
            // [EDIT: Document Management] 조회와 신규 거래 복사를 서로 다른 동작으로 분리합니다.
            <DocumentManagerPanel
              onView={handleViewSubmittedTrade}
              onCopyAsNew={handleCopySubmittedTrade}
            />
          )}
          {activeMenu === 'dashboard' && (
            <div className="workspace-area">
              <div className="form-card">
                <div className="card-header-icon-title">
                  <FileText size={20} className="text-primary" />
                  <h1 className="card-title">무역 문서 자동 생성</h1>
                </div>

                {isReadOnlyDashboard && (
                  <div className="ai-warning-list">
                    <div className="warning-item info">
                      <div className="warning-body">
                        <span className="warning-title">최종 전송이 완료된 거래입니다. 조회만 가능하며 수정할 수 없습니다.</span>
                      </div>
                    </div>
                  </div>
                )}

                {dashboardMode === 'copy' && (
                  <div className="ai-warning-list">
                    <div className="warning-item info">
                      <div className="warning-body">
                        <span className="warning-title">기존 거래 조건을 복사했습니다. 수정 후 필요서류 자동생성을 누르면 새 거래로 저장됩니다.</span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="quick-fill-container">
                  <button className="btn-pill" onClick={() => handleQuickFill('export_error')} disabled={isReadOnlyDashboard}>
                    테스트 A: 수출 - 중량 누락 및 HS CODE 오류
                  </button>
                  <button className="btn-pill" onClick={() => handleQuickFill('import_valid')} disabled={isReadOnlyDashboard}>
                    테스트 B: 수입 - 정상 입력
                  </button>
                </div>

                <fieldset className="form-grid" disabled={isReadOnlyDashboard} style={{ border: 0, padding: 0, margin: 0 }}>
                  <div className="form-group">
                    <label className="form-label">수출입 구분</label>
                    <select
                      className="form-input"
                      value={profile.tradeType}
                      onChange={(e) => handleInputChange('tradeType', e.target.value)}
                    >
                      <option value="export">수출</option>
                      <option value="import">수입</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">품목명</label>
                    <input className="form-input" value={profile.itemName} onChange={(e) => handleInputChange('itemName', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">HS CODE</label>
                    <input className="form-input" value={profile.hsCode} onChange={(e) => handleInputChange('hsCode', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">회사명</label>
                    <input className="form-input" value={profile.companyName} onChange={(e) => handleInputChange('companyName', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">거래처명</label>
                    <input className="form-input" value={profile.partnerName || ''} onChange={(e) => handleInputChange('partnerName', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Incoterms</label>
                    <select className="form-input" value={profile.incoterms} onChange={(e) => handleInputChange('incoterms', e.target.value)}>
                      <option value="">선택</option>
                      <option value="FOB">FOB</option>
                      <option value="CIF">CIF</option>
                      <option value="EXW">EXW</option>
                      <option value="DDP">DDP</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">원산지 국가</label>
                    <select className="form-input" value={profile.countryOfOrigin || ''} onChange={(e) => handleInputChange('countryOfOrigin', e.target.value)}>
                      <option value="">선택</option>
                      {COUNTRY_OPTIONS.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">선적항</label>
                    <input className="form-input" value={profile.loadPort} onChange={(e) => handleInputChange('loadPort', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">도착항</label>
                    <input className="form-input" value={profile.dischargePort} onChange={(e) => handleInputChange('dischargePort', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">수량</label>
                    <input
                      className="form-input"
                      type="number"
                      value={profile.quantity}
                      onChange={(e) => handleInputChange('quantity', e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">중량(kg)</label>
                    <input
                      className="form-input"
                      type="number"
                      value={profile.weight}
                      onChange={(e) => handleInputChange('weight', e.target.value ? Number(e.target.value) : '')}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">출발일</label>
                    <input className="form-input" type="date" value={profile.departureDate} onChange={(e) => handleInputChange('departureDate', e.target.value)} />
                  </div>

                  <div className="form-group">
                    <label className="form-label">도착예정일</label>
                    <input className="form-input" type="date" value={profile.arrivalDate} onChange={(e) => handleInputChange('arrivalDate', e.target.value)} />
                  </div>
                </fieldset>

                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={handleReset}>
                    <RotateCcw size={16} />
                    초기화
                  </button>
                  <button className="btn btn-secondary" onClick={() => setShowConsole(true)} disabled={logs.length === 0 && !isProcessing}>
                    <Terminal size={16} />
                    에이전트 실행 로그
                  </button>
                  <button className="btn btn-primary" onClick={handleGenerateDocuments} disabled={isProcessing || isSubmitting || isReadOnlyDashboard}>
                    <Wand2 size={16} />
                    {isProcessing ? '생성 중...' : '필요 서류 자동 생성'}
                  </button>
                </div>
              </div>

              <div className="form-card">
                <h2 className="card-title">생성 결과</h2>
                {documents.length === 0 ? (
                  <p className="page-subtitle">아직 생성된 문서가 없습니다.</p>
                ) : (
                  <div className="doc-item-list">
                    {documents.map((doc) => (
                      <div className="doc-item-card" key={doc.id}>
                        <div className="doc-item-left">
                          <FileText size={16} />
                          {doc.name}
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span className={`status-badge status-${doc.status}`}>{doc.statusText}</span>
                          <button className="action-btn-circle" title="미리보기" onClick={() => setPreviewDocId(doc.id)} disabled={!htmlTemplates[doc.id]}>
                            <Eye size={14} />
                          </button>
                          <button className="action-btn-circle" title="PDF 다운로드" onClick={() => handleDownloadDoc(doc.id)} disabled={!htmlTemplates[doc.id]}>
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {hsCandidates.length > 0 && (
                  <div className="form-card" style={{ marginTop: 12 }}>
                    <h3 className="card-title">추천 HS CODE 후보</h3>
                    <div className="doc-item-list">
                      {hsCandidates.map((candidate) => (
                        <button
                          className="doc-item-card"
                          key={candidate.code}
                          onClick={() => {
                            setMobileHSCode(candidate.code);
                            handleInputChange('hsCode', candidate.code);
                          }}
                          style={{ textAlign: 'left' }}
                        >
                          <div className="doc-item-left">
                            <strong>{candidate.code}</strong>
                            <span>{candidate.description}</span>
                          </div>
                          <span className="status-badge status-review_required">{candidate.confidence}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {issues.length > 0 && (
                  <div className="ai-warning-list">
                    {issues.map((issue) => (
                      <div className={`warning-item ${issue.severity}`} key={issue.id}>
                        <div className="warning-body">
                          <span className="warning-title">{issue.message}</span>
                          {issue.field === 'weight' && !isReadOnlyDashboard && (
                            <div className="mobile-input-group">
                              <input
                                type="number"
                                className="mobile-input"
                                placeholder="중량 kg"
                                value={mobileWeight}
                                onChange={(e) => setMobileWeight(e.target.value)}
                              />
                              <button type="button" className="mobile-btn mobile-btn-primary" onClick={handleSolveWeight}>
                                중량 반영
                              </button>
                            </div>
                          )}
                          {issue.field === 'hsCode' && !isReadOnlyDashboard && (
                            <div className="mobile-input-group">
                              <input
                                type="text"
                                className="mobile-input"
                                placeholder="HS CODE"
                                value={mobileHSCode}
                                onChange={(e) => setMobileHSCode(e.target.value)}
                              />
                              <button type="button" className="mobile-btn mobile-btn-primary" onClick={handleSolveHSCode}>
                                HS CODE 반영
                              </button>
                            </div>
                          )}
                          {(issue.docType === 'co' || issue.field === 'countryOfOrigin') && !isReadOnlyDashboard && (
                            <div className="mobile-input-group">
                              <select
                                className="mobile-input"
                                value={mobileOrigin}
                                onChange={(e) => setMobileOrigin(e.target.value)}
                              >
                                <option value="">원산지 국가 선택</option>
                                {COUNTRY_OPTIONS.map((country) => (
                                  <option key={country} value={country}>
                                    {country}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="mobile-btn mobile-btn-primary"
                                onClick={handleSolveOrigin}
                                disabled={isSolvingOrigin}
                              >
                                {isSolvingOrigin ? '반영 중...' : '원산지 정보 반영'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {aiFeedback && <p className="page-subtitle">{aiFeedback}</p>}

                <div className="form-actions">
                  <button className="btn btn-primary" onClick={handleSubmitAll} disabled={!canSubmitAll}>
                    {isSubmitting ? '전송 처리 중...' : tradeStatus === 'submitted' ? '전송 완료' : '전체 문서 전송'}
                  </button>
                </div>

                {logs.length > 0 && (
                  <details>
                    <summary>에이전트 실행 로그</summary>
                    <pre>{logs.map((log) => `[${log.timestamp}] ${log.agentName}: ${log.message}`).join('\n')}</pre>
                  </details>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

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
              {logs.map((log, index) => (
                <div className="log-row" key={`${log.timestamp}-${index}`}>
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className="log-agent">{log.agentName}:</span>
                  <span className={`log-text-content ${log.level}`}>{log.message}</span>
                </div>
              ))}
              {isProcessing && (
                <div className="log-row">
                  <span className="log-time">...</span>
                  <span className="log-agent" style={{ color: '#fb7185' }}>
                    Pipeline:
                  </span>
                  <span className="log-text-content" style={{ color: '#fb7185', fontStyle: 'italic' }}>
                    에이전트 처리 중...
                  </span>
                </div>
              )}
              <div ref={consoleEndRef} />
            </div>

            <div className="console-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowConsole(false)} disabled={isProcessing}>
                콘솔 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {previewDocId && (
        <div className="preview-modal-overlay">
          <div className="preview-modal-container">
            <div className="preview-modal-header">
              <h3>{previewDocId} 미리보기</h3>
              <button onClick={() => setPreviewDocId(null)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer' }}>
                &times;
              </button>
            </div>
            <div className="preview-modal-body">
              <div
                style={{ transform: 'scale(1)', transformOrigin: 'top center', width: '100%' }}
                dangerouslySetInnerHTML={{
                  __html: htmlTemplates[previewDocId] || '<p>문서 양식이 아직 생성되지 않았습니다.</p>',
                }}
              />
            </div>
            <div className="preview-modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewDocId(null)}>
                닫기
              </button>
              <button className="btn btn-primary" onClick={() => handleDownloadDoc(previewDocId)}>
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
