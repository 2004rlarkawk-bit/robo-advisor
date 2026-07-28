/**
 * 설정 페이지.
 *
 * 외부 API 키는 브라우저에 저장하지 않고 Supabase Edge Function Secret으로 관리합니다.
 */
import { useState } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { getSettings, saveSettings } from '../services/storageService';

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

function ServerApiRow() {
  return (
    <div className="form-card" style={{ marginBottom: 16 }}>
      <div className="card-header-icon-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={18} className="text-primary" />
        <h2 className="card-title" style={{ margin: 0 }}>관세청 수출입 통계 API</h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16a34a', fontSize: 13, fontWeight: 600 }}>
          <CheckCircle2 size={14} /> 서버에서 안전하게 관리
        </span>
      </div>
      <p style={{ fontSize: 13, color: '#64748b', margin: '8px 0 0' }}>
        공공데이터 인증키는 Supabase Edge Function의 Secret으로 관리됩니다. 브라우저에 API 키를 입력하거나 저장하지 않습니다.
      </p>
    </div>
  );
}

export default function SettingsPanel() {
  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title">설정</h1>
        <p className="page-subtitle">
          AI와 공공데이터 API의 사용 상태를 확인합니다. 민감한 키는 서버에서 관리됩니다.
        </p>
      </div>

      <LLMToggleRow />
      <ServerApiRow />
    </div>
  );
}
