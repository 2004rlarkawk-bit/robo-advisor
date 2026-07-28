/**
 * 설정 페이지 — API 키 관리
 *
 * 브라우저에서 직접 호출하는 외부 서비스 설정:
 *  1. data.go.kr 관세청 GW (수출입실적)
 *
 * 각 키는 저장 후 "연결 테스트"로 실호출 검증 가능.
 * 키 미설정이어도 모든 기능은 시뮬레이션 폴백으로 동작함을 안내.
 */
import { useState } from 'react';
import { KeyRound, CheckCircle2, XCircle, Loader2, Trash2, PlugZap } from 'lucide-react';
import { getSettings, saveSettings } from '../services/storageService';
import {
  setDataGoKrKey, hasDataGoKrKey, clearDataGoKrKey,
  getItemTradeStats,
} from '../services/customsApiService';

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

function LLMToggleRow() {
  const [useLLM, setUseLLM] = useState(getSettings().useLLM);

  const handleToggle = () => {
    const next = !useLLM;
    setUseLLM(next);
    saveSettings({ useLLM: next });
  };

  return (
    <div className="form-card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>AI(LLM) 기능 사용</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '6px 0 0' }}>
            끄면 문서 생성·재검증 시 서버 AI 기능을 호출하지 않고 로컬 사전과 룰 기반으로만 동작합니다.
          </p>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={useLLM} onChange={handleToggle} style={{ width: 18, height: 18 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: useLLM ? '#16a34a' : '#94a3b8' }}>
            {useLLM ? '사용 중' : '꺼짐'}
          </span>
        </label>
      </div>
    </div>
  );
}

export default function SettingsPanel() {
  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title">설정</h1>
        <p className="page-subtitle">
          브라우저에서 직접 호출하는 외부 데이터 서비스만 설정합니다. AI 기능의 키는 서버에서 안전하게 관리됩니다.
        </p>
      </div>

      <LLMToggleRow />
      <KeyRow
        title="공공데이터포털 키 (관세청 GW)"
        description="품목별·국가별·총괄 수출입실적 조회에 사용됩니다. 관세환율은 서버에서 별도로 관리되므로 이 키를 사용하지 않습니다. data.go.kr 마이페이지의 일반 인증키(Encoding 아닌 Decoding 키 권장)."
        placeholder="data.go.kr 인증키"
        saved={hasDataGoKrKey()}
        onSave={setDataGoKrKey}
        onClear={clearDataGoKrKey}
        onTest={async () => {
          const stats = await getItemTradeStats('8517621010', '202601', '202601');
          const apiHit = stats.find((stat) => stat.source === 'api');
          if (!apiHit) throw new Error('API 응답 실패 — 시뮬레이션 폴백됨. 키 또는 CORS 확인 필요.');
          return `품목별 수출입실적 조회 성공 (기간 ${apiHit.period})`;
        }}
      />

    </div>
  );
}
