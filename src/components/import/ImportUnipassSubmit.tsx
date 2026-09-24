/**
 * UNI-PASS 전자신고 전송 — 시연용.
 *
 * 실제 전송은 관세청 등록 신고인만 가능해 지금은 흐름만 보여준다.
 * 그 사실을 화면에 배지와 안내로 분명히 적어 둔다 — 시연을 보는 사람이
 * 실제 제출로 오해하면 나머지 실제 연동(관세율·화물진행 조회)까지 의심받는다.
 */
import { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import {
  submitImportDeclaration,
  UNIPASS_SUBMIT_STEPS,
  type UnipassSubmitResult,
} from '../../services/unipassDeclarationSubmitService';

interface Props {
  /** 신고번호를 고정하는 값 — B/L 번호 */
  seed: string;
  /** 신고서에 적힌 세관 */
  customsOffice?: string;
  /** 전송 전에 확인시킬 요약 항목 */
  summary: Array<{ label: string; value: string }>;
  /** 아직 해결되지 않은 확인 항목 수 — 0보다 크면 전송을 막는다. */
  pendingCount?: number;
}

/** 단계가 하나씩 켜지는 걸 눈으로 볼 수 있어야 전송 과정이 전달된다. */
const STEP_DELAY_MS = 700;

const timeText = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} `
  + `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export default function ImportUnipassSubmit({ seed, customsOffice, summary, pendingCount = 0 }: Props) {
  const [step, setStep] = useState(-1);
  const [result, setResult] = useState<UnipassSubmitResult | null>(null);
  const [error, setError] = useState('');
  const sending = step >= 0 && !result;

  const handleSubmit = async () => {
    setError('');
    setResult(null);
    try {
      for (let index = 0; index < UNIPASS_SUBMIT_STEPS.length; index += 1) {
        setStep(index);
        await new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS));
      }
      setResult(await submitImportDeclaration({ seed, customsOffice }));
    } catch (err) {
      console.error('[UNI-PASS 전송] 실패:', err);
      setError('전송하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      setStep(-1);
    }
  };

  return (
    <section className="form-card import-card unipass-submit">
      <div className="import-card-heading">
        <div>
          <h2>UNI-PASS 전자신고<span className="unipass-demo-badge">시연</span></h2>
        </div>
        <p>작성된 수입신고서를 관세청 UNI-PASS로 전송합니다.</p>
      </div>

      <dl className="unipass-submit-summary">
        {summary.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value || '—'}</dd>
          </div>
        ))}
      </dl>

      {pendingCount > 0 && (
        <p className="form-message warning">
          확인이 끝나지 않은 항목이 {pendingCount}건 있습니다. 신고 후 정정하면 가산세가 붙을 수 있으니 먼저 확인해 주세요.
        </p>
      )}

      {step >= 0 && (
        <ol className="unipass-submit-steps">
          {UNIPASS_SUBMIT_STEPS.map((label, index) => {
            const done = result !== null || index < step;
            const active = !done && index === step;
            return (
              <li key={label} className={done ? 'is-done' : active ? 'is-active' : ''}>
                <span className="unipass-step-icon" aria-hidden="true">
                  {done ? <CheckCircle2 size={16} /> : active ? <Loader2 size={16} className="spin" /> : null}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {result && (
        <div className="unipass-submit-result">
          <p className="unipass-result-title"><CheckCircle2 size={18} /> 신고 접수 완료</p>
          <dl>
            <div><dt>신고번호</dt><dd><strong>{result.declarationNo}</strong></dd></div>
            <div><dt>접수 세관</dt><dd>{result.customsOffice}</dd></div>
            <div><dt>접수 시각</dt><dd>{timeText(result.acceptedAt)}</dd></div>
          </dl>
        </div>
      )}

      {error && <p className="form-message error" role="alert">{error}</p>}

      {!result && (
        <div className="document-preview-actions">
          <button className="btn btn-primary" disabled={sending} onClick={() => void handleSubmit()}>
            <Send size={17} /> {sending ? '전송 중…' : 'UNI-PASS 전송'}
          </button>
        </div>
      )}

      <p className="unipass-submit-note">
        전자신고는 관세청에 등록된 신고인(관세사 또는 자가통관 승인업체)만 할 수 있어, 이 화면의 전송과 신고번호는 시연용입니다.
        실제 신고는 생성된 신고서를 관세사에게 전달해 진행합니다. 관세율·화물통관진행 조회는 실제 UNI-PASS API를 씁니다.
      </p>
    </section>
  );
}
