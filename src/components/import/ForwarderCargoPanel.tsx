import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { lookupImportCargo } from '../../services/cargoProgressService';
import type { CargoTrackingResult } from '../../types/importTrade';

export default function ForwarderCargoPanel({ initialBlNo }: { initialBlNo: string }) {
  const [blNo, setBlNo] = useState(initialBlNo === '-' ? '' : initialBlNo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ cargo: CargoTrackingResult; blNo: string; at: string } | null>(null);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);
  const lookup = async () => {
    if (busy || !blNo.trim()) return;
    const id = ++requestId.current;
    const queriedBlNo = blNo.trim();
    setBusy(true); setError(''); setResult(null);
    try {
      const cargo = await lookupImportCargo(queriedBlNo);
      if (requestId.current === id) setResult({ cargo, blNo: queriedBlNo, at: new Date().toISOString() });
    } catch {
      if (requestId.current === id) setError('조회하지 못했습니다. B/L 번호와 연결 상태를 확인한 뒤 다시 시도하세요.');
    } finally { if (requestId.current === id) setBusy(false); }
  };
  return <section className="form-card import-card fwd-cargo-card">
    <div className="import-card-heading"><div><h2><span className="fwd-section-number">1</span> 통관·화물 진행 현황</h2></div><span className="fwd-cargo-state">{busy ? '조회 중' : error ? '조회 실패' : result ? '조회 결과' : '조회 전'}</span></div>
    <div className="cargo-query"><label className="form-group"><span className="form-label">M/H B/L 번호</span><input className="form-input" value={blNo} disabled={busy} onChange={event => setBlNo(event.target.value)} placeholder="B/L 번호 입력" /></label><button type="button" className="btn btn-primary" disabled={busy || !blNo.trim()} onClick={() => void lookup()}><Search size={16} />{busy ? '조회 중…' : '진행 조회'}</button></div>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {result && <div className="cargo-result" role="status">
      <div className="fwd-cargo-result-head"><strong>{result.cargo.status}</strong>{(result.cargo.source === 'simulation' || result.cargo.lookupStatus === 'simulation') && <span className="da-sim-badge">시뮬레이션 · 실제 조회 아님</span>}</div>
      <p className="fwd-cargo-hint">{result.cargo.detail}</p>
      {result.cargo.lookupStatus !== 'empty' && <ol className="cargo-steps">{result.cargo.timeline.map(step => <li key={step.label} className={`${step.completed ? 'is-done' : ''}${step.current ? ' is-current' : ''}`}>{step.label}</li>)}</ol>}
      {result.cargo.arrivalPort && <p className="cargo-meta">도착항 {result.cargo.arrivalPort} · 화물관리번호 {result.cargo.cargoNo}</p>}
      <p className="fwd-cargo-updated">조회 B/L {result.blNo} · 마지막 조회 <time dateTime={result.at}>{new Date(result.at).toLocaleString('ko-KR')}</time></p>
      {blNo.trim() !== result.blNo && <p className="fwd-cargo-hint">B/L 번호가 바뀌었습니다. 위 결과는 이전 번호의 조회 결과입니다.</p>}
    </div>}
  </section>;
}
