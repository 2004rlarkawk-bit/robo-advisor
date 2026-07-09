/**
 * 설정 페이지 — API 키 관리
 *
 * 3종 키를 localStorage에 저장:
 *  1. Claude API (LLM 추천·피드백)
 *  2. data.go.kr 관세청 GW (환율·수출입실적)
 *  3. 국세청 사업자등록 상태조회
 *
 * 각 키는 저장 후 "연결 테스트"로 실호출 검증 가능.
 * 키 미설정이어도 모든 기능은 시뮬레이션 폴백으로 동작함을 안내.
 */
import { useState } from 'react';
import { KeyRound, CheckCircle2, XCircle, Loader2, Trash2, PlugZap } from 'lucide-react';
import { setApiKey, hasApiKey, clearApiKey } from '../services/claudeService';
import {
  setDataGoKrKey, hasDataGoKrKey, clearDataGoKrKey,
  setNtsBusinessKey, hasNtsBusinessKey, clearNtsBusinessKey,
  getCustomsExchangeRate, verifyBusinessRegistration,
} from '../services/customsApiService';
import {
  setUnipassKey, hasUnipassKey, clearUnipassKey,
  testUnipassKey, UnipassKeyId,
} from '../services/unipassService';
import { setLawOC, hasLawOC, clearLawOC, searchLaw } from '../services/lawService';

interface KeyRowProps {
  title: string;
  description: string;
  placeholder: string;
  saved: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
  onTest?: () => Promise<string>; // 성공 메시지 반환, 실패 시 throw
}

function KeyRow({ title, description, placeholder, saved, onSave, onClear, onTest }: KeyRowProps) {
  const [value, setValue] = useState('');
  const [isSaved, setIsSaved] = useState(saved);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = () => {
    if (!value.trim()) return;
    onSave(value.trim());
    setValue('');
    setIsSaved(true);
    setTestResult(null);
  };

  const handleClear = () => {
    onClear();
    setIsSaved(false);
    setTestResult(null);
  };

  const handleTest = async () => {
    if (!onTest) return;
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await onTest();
      setTestResult({ ok: true, msg });
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="form-card" style={{ marginBottom: 16 }}>
      <div className="card-header-icon-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <KeyRound size={18} className="text-primary" />
        <h2 className="card-title" style={{ margin: 0 }}>{title}</h2>
        {isSaved ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
            <CheckCircle2 size={14} /> 저장됨
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: 13 }}>
            <XCircle size={14} /> 미설정
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 12px' }}>{description}</p>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="password"
          className="form-input"
          style={{ flex: 1 }}
          placeholder={isSaved ? '새 키 입력 시 교체됩니다' : placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <button className="btn-primary" onClick={handleSave} disabled={!value.trim()}>
          저장
        </button>
        {isSaved && onTest && (
          <button className="btn-secondary" onClick={handleTest} disabled={testing} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {testing ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />}
            연결 테스트
          </button>
        )}
        {isSaved && (
          <button className="btn-secondary" onClick={handleClear} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626' }}>
            <Trash2 size={14} /> 삭제
          </button>
        )}
      </div>

      {testResult && (
        <div
          style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 13,
            background: testResult.ok ? '#f0fdf4' : '#fef2f2',
            color: testResult.ok ? '#15803d' : '#b91c1c',
            border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
        </div>
      )}
    </div>
  );
}

export default function SettingsPanel() {
  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title">설정</h1>
        <p className="page-subtitle">
          API 키를 등록하면 실데이터 기반으로 동작합니다. 미등록 시에도 모든 기능은 시뮬레이션 모드로 이용 가능합니다.
        </p>
      </div>

      <KeyRow
        title="Claude API 키"
        description="LLM 기반 HS Code 추천, 자연어 피드백, 문서 필드 자동 채움에 사용됩니다. console.anthropic.com에서 발급."
        placeholder="sk-ant-..."
        saved={hasApiKey()}
        onSave={setApiKey}
        onClear={clearApiKey}
      />

      <KeyRow
        title="공공데이터포털 키 (관세청 GW)"
        description="관세환율(주간 적용환율)·품목별 수출입실적 조회에 사용됩니다. data.go.kr 마이페이지의 일반 인증키(Encoding 아닌 Decoding 키 권장)."
        placeholder="data.go.kr 인증키"
        saved={hasDataGoKrKey()}
        onSave={setDataGoKrKey}
        onClear={clearDataGoKrKey}
        onTest={async () => {
          const fx = await getCustomsExchangeRate('USD', 'import');
          if (fx.source !== 'api') throw new Error('API 응답 실패 — 시뮬레이션 폴백됨. 키 또는 CORS 확인 필요.');
          return `USD 과세환율 ${fx.rate.toLocaleString()}원 (적용일 ${fx.effectiveDate})`;
        }}
      />

      <KeyRow
        title="국세청 사업자등록 조회 키"
        description="거래처 사업자등록번호 상태(계속/휴업/폐업) 확인에 사용됩니다. data.go.kr에서 발급한 국세청 서비스 키."
        placeholder="data.go.kr 인증키"
        saved={hasNtsBusinessKey()}
        onSave={setNtsBusinessKey}
        onClear={clearNtsBusinessKey}
        onTest={async () => {
          // 실존 사업자번호(삼성전자: 124-81-00998)로 상태조회 테스트
          const r = await verifyBusinessRegistration('1248100998');
          if (r.source !== 'api') throw new Error('API 응답 실패 — 시뮬레이션 폴백됨. 키 확인 필요.');
          return `테스트 조회 성공 — 124-81-00998(삼성전자): ${r.statusText}`;
        }}
      />

      <div className="page-heading" style={{ marginTop: 32 }}>
        <h2 className="page-title" style={{ fontSize: 20 }}>UNI-PASS 키 (관세청 전자통관 — 서비스별 개별 키)</h2>
        <p className="page-subtitle">
          ⚠ UNI-PASS는 브라우저 보안정책(CORS) 제한으로 <b>로컬 개발 환경(npm run dev)에서만 실데이터</b>로 동작합니다.
          배포 사이트에서는 시뮬레이션 값이 표시됩니다.
        </p>
      </div>

      {([
        {
          id: 'tariff' as UnipassKeyId,
          title: 'UNI-PASS 관세율기본조회 키',
          description: 'HSK 10자리 기준 기본세율/WTO/FTA 세율 조회 — 예상 관세액 계산에 사용됩니다.',
        },
        {
          id: 'requirement' as UnipassKeyId,
          title: 'UNI-PASS 수출입요건승인내역 키',
          description: '요건승인번호로 발급된 승인 내역(서식명·유효기간)을 확인합니다.',
        },
        {
          id: 'cargo' as UnipassKeyId,
          title: 'UNI-PASS 화물통관진행정보 키',
          description: 'B/L번호로 화물 통관 진행상태를 추적합니다.',
        },
        {
          id: 'fulfillment' as UnipassKeyId,
          title: 'UNI-PASS 수출이행내역 키',
          description: '수출신고번호로 선적 이행 여부·적재의무기한을 확인합니다.',
        },
      ]).map((cfg) => (
        <KeyRow
          key={cfg.id}
          title={cfg.title}
          description={cfg.description}
          placeholder="UNI-PASS 인증키 (crkyCn)"
          saved={hasUnipassKey(cfg.id)}
          onSave={(k) => setUnipassKey(cfg.id, k)}
          onClear={() => clearUnipassKey(cfg.id)}
          onTest={() => testUnipassKey(cfg.id)}
        />
      ))}

      <div className="page-heading" style={{ marginTop: 32 }}>
        <h2 className="page-title" style={{ fontSize: 20 }}>법제처 국가법령정보</h2>
        <p className="page-subtitle">
          현행법령·판례 검색 및 검증 결과의 근거 법령 연결에 사용됩니다. 키가 아니라 <b>law.go.kr 가입 ID(OC)</b>를 입력하세요.
          발급 시 등록한 도메인에서만 호출이 허용될 수 있습니다.
        </p>
      </div>

      <KeyRow
        title="법제처 OC (사용자 ID)"
        description="open.law.go.kr에서 Open API 신청 시 사용한 가입 ID. 예: g4c 이메일이 abc@gmail.com이면 OC는 abc."
        placeholder="law.go.kr 가입 ID"
        saved={hasLawOC()}
        onSave={setLawOC}
        onClear={clearLawOC}
        onTest={async () => {
          const results = await searchLaw('관세법', 3);
          const apiHit = results.find((r) => r.source === 'api');
          if (!apiHit) throw new Error('API 응답 실패 — 시뮬레이션 폴백됨. OC와 도메인 등록(localhost 여부)을 확인하세요.');
          return `법령 검색 성공 — ${apiHit.lawName} (${apiHit.lawType}, 시행 ${apiHit.effectiveDate})`;
        }}
      />
    </div>
  );
}
