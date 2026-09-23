import { useEffect, useRef, useState } from 'react';
import { getExportFulfillment, type ExportFulfillment } from '../../../services/unipassService';

function dateLabel(value: string) {
  return /^\d{8}$/.test(value) ? value.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3') : value || '조회 정보 없음';
}

/** Key this component by case and declaration number to discard outdated responses. */
export default function ExportCustomsLookup({ declarationNo, busy = false }: { declarationNo: string; busy?: boolean }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'found' | 'empty' | 'error'>('idle');
  const [result, setResult] = useState<ExportFulfillment | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const alive = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  async function lookup() {
    if (inFlight.current) return;
    inFlight.current = true;
    setStatus('loading');
    setResult(null);
    try {
      const data = await getExportFulfillment(declarationNo);
      if (!alive.current) return;
      setResult(data);
      setCheckedAt(new Date().toLocaleString('ko-KR'));
      setStatus(data ? 'found' : 'empty');
    } catch {
      if (alive.current) setStatus('error');
    } finally {
      inFlight.current = false;
    }
  }

  return (
    <section className="fwd-export-customs-lookup" aria-label="유니패스 수출이행 조회" aria-busy={status === 'loading'}>
      <div className="fwd-export-customs-status">
        <span>수출신고번호 기준 · UNI-PASS</span>
        <button type="button" className="btn btn-secondary" disabled={busy || status === 'loading' || !declarationNo.replace(/[^0-9]/g, '')} onClick={() => void lookup()}>
          {status === 'loading' ? '조회 중…' : '유니패스 조회'}
        </button>
      </div>
      <div aria-live="polite">
        {status === 'idle' && <p className="form-help">수출신고번호를 입력하고 조회해 주세요. 기존 수동 기록은 세관 조회 결과로 표시하지 않습니다.</p>}
        {status === 'error' && <p className="form-message error" role="alert">유니패스 조회에 실패했습니다. 잠시 후 다시 시도해 주세요. 반복되면 관리자에게 수출 조회 API 배포·인증키 설정을 확인해 주세요.</p>}
        {status === 'empty' && <p className="form-message info">조회 결과가 없습니다. 신고번호와 신고 정보 반영 여부를 확인해 주세요. 통관 완료를 의미하지 않습니다.</p>}
        {status === 'found' && result && <>
          <dl className="fwd-export-summary-grid">
            <div><dt>수출신고 수리</dt><dd>{result.acceptDate ? '수리 확인' : '수리 정보 없음'}</dd></div>
            <div><dt>신고 수리일</dt><dd>{dateLabel(result.acceptDate)}</dd></div>
            <div><dt>적재 기한</dt><dd>{dateLabel(result.loadDeadline)}</dd></div>
            <div><dt>선적 완료 여부</dt><dd>{result.shipmentCompleted ? '완료' : '미완료'}</dd></div>
          </dl>
          <p className="form-help">조회 시각: {checkedAt} · 신고 수리와 선적 완료는 별개입니다. 최신 상태는 다시 조회해 주세요.</p>
        </>}
      </div>
    </section>
  );
}
