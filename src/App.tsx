import { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  FolderKanban, 
  Layers, 
  Ship, 
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
  ArrowLeft,
  Smartphone
} from 'lucide-react';
import { TradeProfile, DocumentStatus, ValidationIssue } from './types';
import SettingsPanel from './components/SettingsPanel';
import { OrchestratorAgent } from './agents/OrchestratorAgent';
import { AgentLog } from './agents/types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';


export default function App() {
  const [activeMenu, setActiveMenu] = useState('dashboard');
  
  // Auth states
  const [user, setUser] = useState<{ name: string; type: 'member' | 'guest' } | null>(null);
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');

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
            contact: prev.contact || '010-1234-5678'
          }));
        }
      } catch (e) {
        localStorage.removeItem('portai_user_session');
      }
    }
  }, []);

  const handleMemberLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!loginId || !loginPw) {
      alert('아이디와 비밀번호를 입력해주세요.');
      return;
    }
    const memberUser = { name: '인천테크', type: 'member' as const };
    setUser(memberUser);
    localStorage.setItem('portai_user_session', JSON.stringify(memberUser));
    setProfile(prev => ({
      ...prev,
      companyName: '인천테크',
      contact: '010-1234-5678'
    }));
  };

  const handleGuestLogin = () => {
    const guestUser = { name: '게스트', type: 'guest' as const };
    setUser(guestUser);
    localStorage.setItem('portai_user_session', JSON.stringify(guestUser));
    setProfile(prev => ({
      ...prev,
      companyName: '',
      contact: ''
    }));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('portai_user_session');
    handleReset();
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
  // Harness & Agent Pipeline State
  const [isProcessing, setIsProcessing] = useState(false);
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
  }, [issues]);

  // Quick fill handlers
 // Quick fill handlers
const handleQuickFill = (type: 'export_error' | 'import_valid') => {
  if (type === 'export_error') {
    setProfile({
      ...emptyProfile,

      // 1. 기본 거래 / 문서 정보
      tradeType: 'export',
      documentNo: 'DOC-20260701-001',
      invoiceNo: 'INV-20260701-001',
      invoiceDate: '2026-07-01',
      referenceNo: 'REF-INCHON-001',

      // 선하증권 Bill of Lading 정보
      blNo: 'BL-20260701-001',
      issuePlace: 'Seoul, Korea',
      issueDate: '2026-07-01',

      // 2. 상품 정보
      itemName: '산업용 금속 부품',
      hsCode: 'ABC-12', // 일부러 오류 테스트용
      countryOfOrigin: '대한민국',
      quantity: 1500,
      unit: 'EA',

      // 3. 가격 / 금액 정보
      currency: 'USD',
      unitPrice: 12,
      totalAmount: 18000,
      invoiceAmount: 18000,

      // 4. 포장 / 중량 / 부피 정보
      packageCount: 30,
      packageType: 'Carton',
      netWeight: 2200,
      grossWeight: '',
      weight: '', // 일부러 중량 누락 테스트용
      measurement: '3.5 CBM',
      shippingMarks: 'INCHON TECH / SHANGHAI / C/T NO. 1-30',

      // 5. 운송 정보
      loadPort: '부산항',
      dischargePort: '상하이항',
      departureDate: '2026-07-01',
      arrivalDate: '2026-07-05',
      vesselOrFlight: 'KMTC BUSAN V.2501',
      carrier: 'KMTC',

      // 선하증권 운송 세부 정보
      placeOfReceipt: 'Busan, Korea',
      placeOfDelivery: 'Shanghai, China',
      finalDestination: 'Shanghai, China',
      voyageNo: '2501E',
      flag: 'Korea',

      // 6. 컨테이너 정보
      containerNo: 'TCLU1234567',
      sealNo: 'SEAL987654',

      // 7. 거래 조건 / 운임 정보
      incoterms: 'FOB',
      paymentTerms: 'T/T in advance',
      reasonForExport: 'Sale of goods',
      freightTerms: 'Prepaid',
      freightCharges: 'Prepaid',
      freightPrepaidAt: 'Busan, Korea',
      freightPayableAt: '',

      // 8. 수출자 / 판매자 / Shipper 정보
      companyName: '인천테크',
      companyAddress: '인천광역시 연수구 송도동',
      companyCountry: '대한민국',
      contact: '010-1234-5678',
      taxNo: '123-45-67890',
      businessRegistrationNo: '123-45-67890', // 일부러 검증 오류 테스트 가능

      // 9. 수입자 / 수하인 / Consignee 정보
      partnerName: '상하이 수입상사 (Shanghai Import Co.)',
      partnerAddress: 'Pudong New Area, Shanghai, China',
      partnerCountry: '중국',
      partnerContact: '+86-21-0000-0000',

      // 10. 구매자 / Bill To 정보
      buyerName: 'Shanghai Import Co.',
      buyerAddress: 'Pudong New Area, Shanghai, China',
      buyerCountry: '중국',

      // 11. Notify Party 정보
      notifyPartyName: 'Shanghai Import Co.',
      notifyPartyAddress: 'Pudong New Area, Shanghai, China',
      notifyPartyContact: '+86-21-0000-0000',

      // 12. 서명 정보
      signedBy: '김지민',
      signerName: 'Kim Jimin',
      signerPosition: 'Export Manager'
    });
  } else {
    setProfile({
      ...emptyProfile,

      // 1. 기본 거래 / 문서 정보
      tradeType: 'import',
      documentNo: 'DOC-20260715-001',
      invoiceNo: 'INV-20260715-001',
      invoiceDate: '2026-07-15',
      referenceNo: 'REF-GLOBAL-001',

      // 선하증권 Bill of Lading 정보
      blNo: 'BL-20260715-001',
      issuePlace: 'Los Angeles, USA',
      issueDate: '2026-07-15',

      // 2. 상품 정보
      itemName: 'IT 원자재',
      hsCode: '8517-62-1010',
      countryOfOrigin: '미국',
      quantity: 800,
      unit: 'EA',

      // 3. 가격 / 금액 정보
      currency: 'USD',
      unitPrice: 150,
      totalAmount: 120000,
      invoiceAmount: 120000,

      // 4. 포장 / 중량 / 부피 정보
      packageCount: 20,
      packageType: 'Pallet',
      netWeight: 2200,
      grossWeight: 2400,
      weight: 2400,
      measurement: '5.2 CBM',
      shippingMarks: 'GLOBAL LOGISTICS / INCHEON / P/L NO. 1-20',

      // 5. 운송 정보
      loadPort: '로스앤젤레스항',
      dischargePort: '인천항',
      departureDate: '2026-07-15',
      arrivalDate: '2026-07-30',
      vesselOrFlight: 'MAERSK LA V.3302',
      carrier: 'Maersk',

      // 선하증권 운송 세부 정보
      placeOfReceipt: 'Los Angeles, USA',
      placeOfDelivery: 'Incheon, Korea',
      finalDestination: 'Incheon, Korea',
      voyageNo: '3302W',
      flag: 'USA',

      // 6. 컨테이너 정보
      containerNo: 'MSCU7654321',
      sealNo: 'SEAL123456',

      // 7. 거래 조건 / 운임 정보
      incoterms: 'CIF',
      paymentTerms: 'T/T 30 days',
      reasonForExport: 'Commercial transaction',
      freightTerms: 'Collect',
      freightCharges: 'Collect',
      freightPrepaidAt: '',
      freightPayableAt: 'Incheon, Korea',

      // 8. 수출자 / 판매자 / Shipper 정보
      companyName: '글로벌 물류지원',
      companyAddress: '서울특별시 중구 세종대로',
      companyCountry: '대한민국',
      contact: '02-123-4567',
      taxNo: '124-81-00998',
      businessRegistrationNo: '124-81-00998',

      // 9. 수입자 / 수하인 / Consignee 정보
      partnerName: '캘리포니아 엑스포트 (California Export Co.)',
      partnerAddress: 'Los Angeles, CA, USA',
      partnerCountry: '미국',
      partnerContact: '+1-213-000-0000',

      // 10. 구매자 / Bill To 정보
      buyerName: '글로벌 물류지원',
      buyerAddress: '서울특별시 중구 세종대로',
      buyerCountry: '대한민국',

      // 11. Notify Party 정보
      notifyPartyName: '글로벌 물류지원',
      notifyPartyAddress: '서울특별시 중구 세종대로',
      notifyPartyContact: '02-123-4567',

      // 12. 서명 정보
      signedBy: '홍길동',
      signerName: 'Hong Gil Dong',
      signerPosition: 'Import Manager'
    });
  }
};

  const handleInputChange = (field: keyof TradeProfile, value: string | number) => {
    setProfile(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleReset = () => {
  setProfile(emptyProfile);
  setHasGenerated(false);
  setDocuments([]);
  setIssues([]);
  setConsoleLogs([]);
  setHtmlTemplates({});
  setHsCandidates([]);
};

  // Run the multi-agent pipeline simulator
  const handleGenerateDocuments = async () => {
    setIsProcessing(true);
    setShowConsole(true);
    setConsoleLogs([]);

    try {
      const orchestrator = new OrchestratorAgent();
      const result = await orchestrator.run({ profile, useLLM: true });

      // Simulate terminal printing for all logs chronologically
      for (let i = 0; i < result.logs.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 120));
        setConsoleLogs(prev => [...prev, result.logs[i]]);
      }

      setProfile(prev => ({
        ...prev,
        hsCode: prev.hsCode || result.hs.topCode
      }));
      setDocuments(result.documents.documents);
      setHtmlTemplates(result.documents.htmlTemplates || {});
      setIssues(result.issues.issues);
      setAiFeedback(result.feedback.message);
      setHsCandidates(result.hs.candidates || []);
      setHasGenerated(true);
    } catch (error) {
      console.error(error);
      alert('에이전트 파이프라인 처리 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-run validation helper (e.g. after fixing something in mobile view)
  const rerunAgents = async (updatedProfile: TradeProfile) => {
    try {
      const orchestrator = new OrchestratorAgent();
      const result = await orchestrator.run({ profile: updatedProfile, useLLM: true });
      
      setDocuments(result.documents.documents);
      setHtmlTemplates(result.documents.htmlTemplates || {});
      setIssues(result.issues.issues);
      setAiFeedback(result.feedback.message);
      setHsCandidates(result.hs.candidates || []);
    } catch (error) {
      console.error(error);
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
      companyName: `${profile.companyName} (${mobileOrigin}산)`
    };
    setProfile(updatedProfile);
    await rerunAgents(updatedProfile);
  };

  const getDocFileName = (docId: string) => {
    const docTypeLabel = docId === 'invoice' ? 'Invoice' : docId === 'packing_list' ? 'PackingList' : 'CO';
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
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
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

  const handleMobileSubmit = () => {
    alert('모든 통관 문서 정보 보완이 완료되었습니다. 관세청 통관 시스템으로 제출합니다.');
  };

  // Calculate statistics
  const completedDocsCount = documents.filter(d => d.status === 'completed').length;
  const reviewDocsCount = issues.length;

  if (!user) {
    return (
      <div className="login-wrapper">
        <div className="login-bg-decoration login-bg-decor1"></div>
        <div className="login-bg-decoration login-bg-decor2"></div>
        
        <div className="login-card">
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

          <div className="login-divider">또는</div>
          
          <button type="button" className="login-btn-guest" onClick={handleGuestLogin}>
            비회원으로 시작하기 (체험)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 1. Left Navigation Sidebar */}
      <aside className="sidebar">
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
              className={`menu-item ${activeMenu === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveMenu('dashboard')}
            >
              <LayoutDashboard size={18} />
              대시보드
            </div>
          </li>
          <li>
            <div 
              className={`menu-item ${activeMenu === 'generation' ? 'active' : ''}`}
              onClick={() => setActiveMenu('generation')}
            >
              <FileText size={18} />
              문서 자동 생성
            </div>
          </li>
          {/* 미구현 메뉴 — 구현 완료 시 onClick 연결 후 disabled/배지 제거 */}
          <li>
            <div className="menu-item disabled" title="준비 중인 기능입니다">
              <FolderKanban size={18} />
              문서 관리
              <span className="badge-soon">준비중</span>
            </div>
          </li>
          <li>
            <div className="menu-item disabled" title="준비 중인 기능입니다">
              <Layers size={18} />
              거래 관리
              <span className="badge-soon">준비중</span>
            </div>
          </li>
          <li>
            <div className="menu-item disabled" title="준비 중인 기능입니다">
              <Ship size={18} />
              선적 일정 관리
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
            <div className="menu-item disabled" title="준비 중인 기능입니다">
              <BarChart3 size={18} />
              데이터 분석
              <span className="badge-soon">준비중</span>
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
            <span className="platform-badge">Mentoring Project 2026</span>
          </div>

          <div className="header-actions">
            <button className="icon-btn">
              <Bell size={20} />
              <span className="badge-dot"></span>
            </button>
            <button className="icon-btn">
              <HelpCircle size={20} />
            </button>
            <div className="user-info-section">
              <div className="user-profile">
                <div className="user-avatar">{user.type === 'member' ? '회' : '비'}</div>
                <span>{user.name} 님</span>
                <span className={`auth-badge ${user.type}`}>
                  {user.type === 'member' ? '회원' : '비회원'}
                </span>
              </div>
              <button className="btn-logout" onClick={handleLogout}>
                로그아웃
              </button>
            </div>
          </div>
        </header>

        <main className="content-body">
          <div className="workspace-area">
            {activeMenu === 'settings' ? <SettingsPanel /> : <>
            {/* Page Title & Subtitle */}
            <div className="page-heading">
              <h1 className="page-title">항만 수출입 문서 자동화 서비스</h1>
              <p className="page-subtitle">AI 기반 로보 어드바이저가 통관 및 선적에 필요한 문서를 자동으로 생성해 드립니다.</p>
            </div>

            {/* Quick test scenario filler */}
            {!hasGenerated && (
              <div className="quick-fill-container">
                <button className="btn-pill" onClick={() => handleQuickFill('export_error')}>
                  ⚡ 테스트 시나리오 A 불러오기 (수출 - 중량 누락 & HS코드 오류)
                </button>
                <button className="btn-pill" onClick={() => handleQuickFill('import_valid')}>
                  ⚡ 테스트 시나리오 B 불러오기 (수입 - 모든 규정 정상 통과)
                </button>
              </div>
            )}

            {!hasGenerated ? (
              /* --- 거래 정보 입력 모드 --- */
              <div className="dashboard-grid">
                <div className="form-card">
                  <div className="card-header-icon-title">
                    <FileSignature size={20} className="text-primary" />
                    <h2 className="card-title">거래 정보 입력</h2>
                  </div>

                  <div className="form-grid">
                    <div className="form-group">
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

<div className="form-group">
  <label className="form-label">송장번호</label>
  <input
    type="text"
    className="form-input"
    placeholder="예: INV-20260701-001"
    value={profile.invoiceNo}
    onChange={(e) => handleInputChange('invoiceNo', e.target.value)}
  />
</div>

<div className="form-group">
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
                      <label className="form-label">품목명</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="품목명을 입력하세요" 
                        value={profile.itemName}
                        onChange={(e) => handleInputChange('itemName', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">HS CODE</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="HS CODE를 입력하세요" 
                        value={profile.hsCode}
                        onChange={(e) => handleInputChange('hsCode', e.target.value)}
                      />
                    </div>
<div className="form-group">
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

<div className="form-group">
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

<div className="form-group">
  <label className="form-label">단가</label>
  <input
    type="number"
    className="form-input"
    placeholder="예: 12"
    value={profile.unitPrice}
    onChange={(e) => handleInputChange('unitPrice', e.target.value ? Number(e.target.value) : '')}
  />
</div>

<div className="form-group">
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
                      <label className="form-label">선적항</label>
                      <select 
                        className="form-input"
                        value={profile.loadPort}
                        onChange={(e) => handleInputChange('loadPort', e.target.value)}
                      >
                        <option value="">선적항을 선택하세요</option>
                        <option value="부산항">부산항</option>
                        <option value="인천항">인천항</option>
                        <option value="광양항">광양항</option>
                        <option value="로스앤젤레스항">로스앤젤레스항 (미국)</option>
                        <option value="상하이항">상하이항 (중국)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">도착항</label>
                      <select 
                        className="form-input"
                        value={profile.dischargePort}
                        onChange={(e) => handleInputChange('dischargePort', e.target.value)}
                      >
                        <option value="">도착항을 선택하세요</option>
                        <option value="부산항">부산항</option>
                        <option value="인천항">인천항</option>
                        <option value="상하이항">상하이항 (중국)</option>
                        <option value="로스앤젤레스항">로스앤젤레스항 (미국)</option>
                        <option value="로테르담항">로테르담항 (네덜란드)</option>
                      </select>
                    </div>

                    <div className="form-group">
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
                    <div className="form-group">
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

                    <div className="form-group">
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
<div className="form-group">
  <label className="form-label">포장 개수</label>
  <input
    type="number"
    className="form-input"
    placeholder="예: 30"
    value={profile.packageCount}
    onChange={(e) => handleInputChange('packageCount', e.target.value ? Number(e.target.value) : '')}
  />
</div>

<div className="form-group">
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

<div className="form-group">
  <label className="form-label">순중량(kg)</label>
  <input
    type="number"
    className="form-input"
    placeholder="예: 2200"
    value={profile.netWeight}
    onChange={(e) => handleInputChange('netWeight', e.target.value ? Number(e.target.value) : '')}
  />
</div>

<div className="form-group">
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

<div className="form-group">
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
                      <label className="form-label">출발일</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={profile.departureDate}
                        onChange={(e) => handleInputChange('departureDate', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">도착예정일</label>
                      <input 
                        type="date" 
                        className="form-input" 
                        value={profile.arrivalDate}
                        onChange={(e) => handleInputChange('arrivalDate', e.target.value)}
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
                    <div className="form-group">
                      <label className="form-label">업체명</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="업체명을 입력하세요" 
                        value={profile.companyName}
                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                      />
                    </div>
<div className="form-group">
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
                    <div className="form-group">
                      <label className="form-label">거래처명 (Consignee)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        placeholder="상대방 업체명을 입력하세요" 
                        value={profile.partnerName || ''}
                        onChange={(e) => handleInputChange('partnerName', e.target.value)}
                      />
                    </div>
<div className="form-group">
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

<div className="form-group">
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
                    <div className="form-group">
                      <label className="form-label">담당자 연락처</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="010-0000-0000"
                        value={profile.contact}
                        onChange={(e) => handleInputChange('contact', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
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

                    <div className="form-group">
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

                    <div className="form-group">
                      <label className="form-label">사업자등록번호</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="000-00-00000 (입력 시 국세청 상태 검증)"
                        value={profile.businessRegistrationNo || ''}
                        onChange={(e) => handleInputChange('businessRegistrationNo', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
  <label className="form-label">서명자</label>
  <input
    type="text"
    className="form-input"
    placeholder="예: 김지민"
    value={profile.signedBy}
    onChange={(e) => handleInputChange('signedBy', e.target.value)}
  />
</div>

<div className="form-group">
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

                  <div className="form-actions">
                    <button className="btn btn-secondary" onClick={handleReset}>
                      <RotateCcw size={16} />
                      초기화
                    </button>
                    <button className="btn btn-primary" onClick={handleGenerateDocuments}>
                      <FileText size={16} />
                      필요 서류 자동 생성
                    </button>
                  </div>
                </div>

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
                              </div>
                            </div>
                          </div>
                        ))}
                      
                      {documents.filter(d => d.status !== 'not_needed' && d.status !== 'not_started').length === 0 && (
                        <div className="mobile-empty-state">
                          <span className="mobile-empty-icon">📁</span>
                          <span className="mobile-empty-text">생성된 문서 없음</span>
                          <span className="mobile-empty-sub">정보를 정상적으로 채우거나 모바일에서 보완해 주세요.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 3: AI 검토 및 경고 안내 */}
                  <div className="result-column">
                    <div className="col-header">
                      <div className="col-number">3</div>
                      <h3 className="col-title">검토 및 누락 항목 안내</h3>
                    </div>

                    <div className="ai-report-box">
                      <div className="ai-header">
                        <CheckCircle2 size={16} className="text-success" />
                        AI 분석 결과
                      </div>
                      
                      {aiFeedback && (
                        <div className="ai-feedback-narrative" style={{ 
                          fontSize: '13px', 
                          lineHeight: '1.6', 
                          color: '#1e293b', 
                          backgroundColor: '#f1f5f9', 
                          padding: '12px', 
                          borderRadius: '8px', 
                          marginBottom: '16px',
                          borderLeft: '4px solid #3b82f6',
                          whiteSpace: 'pre-line'
                        }}>
                          {aiFeedback}
                        </div>
                      )}

                      <div className="ai-warning-list">
                        {issues.map((issue) => (
                          <div className={`warning-item ${issue.severity}`} key={issue.id}>
                            <span className="warning-icon">
                              {issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️'}
                            </span>
                            <div className="warning-body">
                              <span className="warning-title">{issue.message.split(' (')[0]}</span>
                              <span className="warning-text">
                                {issue.message.includes(' (') ? issue.message.split(' (')[1].replace(')', '') : ''}
                              </span>
                            </div>
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

                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button 
                        className="btn btn-primary"
                        onClick={handleMobileSubmit}
                        disabled={issues.length > 0}
                        style={{ width: '100%', opacity: issues.length > 0 ? 0.6 : 1, cursor: issues.length > 0 ? 'not-allowed' : 'pointer' }}
                      >
                        전체 문서 전송
                      </button>
                      <button className="btn btn-secondary" onClick={() => setHasGenerated(false)} style={{ width: '100%' }}>
                        뒤로 가기 (입력 수정)
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>}
          </div>

          {/* 3. Interactive Right Mobile Simulator Panel */}
          <div className="simulator-wrapper">
            <div className="iphone-frame">
              <div className="iphone-notch"></div>
              
              <div className="iphone-screen">
                <div className="mobile-status-bar">
                  <span>12:25</span>
                  <div className="status-bar-icons">
                    <span>📶</span>
                    <span>🔋</span>
                  </div>
                </div>

                <div className="mobile-header">
                  <ArrowLeft size={16} className="mobile-back-icon" onClick={() => setHasGenerated(false)} />
                  <span className="mobile-title">문서 검토 결과</span>
                </div>

                <div className="mobile-body">
                  {!hasGenerated ? (
                    /* Mobile Standby screen */
                    <div className="mobile-empty-state">
                      <Smartphone size={40} className="text-light" />
                      <span className="mobile-empty-text">실시간 보완 대기 중</span>
                      <span className="mobile-empty-sub">좌측 대시보드에서 [필요 서류 자동 생성]을 누르면 실시간 보완 및 피드백 기능이 활성화됩니다.</span>
                    </div>
                  ) : (
                    /* Mobile active verification & fix workspace */
                    <>
                      <div className="mobile-summary-card">
                        <div className="mobile-summary-row">
                          <span className="mobile-summary-label">
                            <CheckCircle2 size={14} className="text-success" />
                            검토 완료 문서
                          </span>
                          <span className="mobile-summary-value success">{completedDocsCount}건</span>
                        </div>
                        <div className="mobile-summary-row">
                          <span className="mobile-summary-label">
                            <AlertTriangle size={14} className="text-warning" />
                            보완 필요
                          </span>
                          <span className="mobile-summary-value warning">{reviewDocsCount}건</span>
                        </div>
                      </div>

                      <div className="mobile-section-title">누락 및 수정이 필요한 서류</div>

                      <div className="mobile-fix-list">
                        {issues.map((issue) => (
                          <div className="mobile-fix-card" key={issue.id}>
                            <div className="mobile-fix-header">
                              <div className="mobile-fix-info">
                                <span className="mobile-fix-name">
                                  {issue.docType === 'packing_list' ? '패킹리스트' : 
                                   issue.docType === 'customs_dec' ? '통관신고서' : 
                                   issue.docType === 'co' ? '원산지증명서' : '기타 서류'}
                                </span>
                                <span className="mobile-fix-msg">
                                  {issue.field === 'weight' ? '중량 정보 확인 필요' : 
                                   issue.field === 'hsCode' ? 'HS CODE 유효성 검사 오류' : 
                                   '수출국 규제 서류 작성 필요'}
                                </span>
                              </div>
                              <span className="mobile-fix-badge status-review-required">
                                {issue.severity === 'error' ? '오류' : '보완 필요'}
                              </span>
                            </div>

                            {/* Dynamic input form depending on error type */}
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
                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveWeight}>
                                  중량 입력 및 보완 완료
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
                                    <div className="hs-candidates-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
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

                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveHSCode}>
                                  HS CODE 수정 반영
                                </button>
                              </div>
                            )}

                            {issue.docType === 'co' && (
                              <div className="mobile-input-group">
                                <label className="mobile-input-label">원산지 정보 선택</label>
                                <select 
                                  className="mobile-input" 
                                  value={mobileOrigin}
                                  onChange={(e) => setMobileOrigin(e.target.value)}
                                >
                                  <option value="">국가를 선택하세요</option>
                                  <option value="대한민국">대한민국 (KR)</option>
                                  <option value="미국">미국 (US)</option>
                                  <option value="중국">중국 (CN)</option>
                                </select>
                                <button className="mobile-btn mobile-btn-primary" onClick={handleSolveOrigin}>
                                  원산지증명서 발급 요청
                                </button>
                              </div>
                            )}
                          </div>
                        ))}

                        {issues.length === 0 && (
                          <div className="mobile-empty-state">
                            <span className="mobile-empty-icon">🎉</span>
                            <span className="mobile-empty-text">보완할 사항 없음</span>
                            <span className="mobile-empty-sub">모든 관세법 서류 제출 요건이 충족되었습니다. 아래 [수정 후 제출] 버튼을 눌러 발송을 완료하세요.</span>
                          </div>
                        )}
                      </div>

                      <button 
                        className="mobile-btn mobile-btn-primary" 
                        onClick={handleMobileSubmit}
                        style={{ marginTop: 'auto' }}
                        disabled={issues.length > 0}
                      >
                        수정 후 제출
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
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
                  <span className={`log-text-content ${log.type}`}>
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
                {previewDocId === 'invoice' ? '상업송장(Commercial Invoice) 미리보기' : 
                 previewDocId === 'packing_list' ? '패킹리스트(Packing List) 미리보기' : 
                 '원산지증명서(Certificate of Origin) 미리보기'}
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
