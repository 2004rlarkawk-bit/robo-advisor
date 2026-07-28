import { useEffect, useState } from 'react';
import { Download, Eye, RefreshCw, Search } from 'lucide-react';
import ImportStepIndicator from './ImportStepIndicator';
import ImportDocumentUploader from './ImportDocumentUploader';
import ImportAnalysisSummary from './ImportAnalysisSummary';
import ImportDocumentComparison from './ImportDocumentComparison';
import ArrivalNoticeUploader from './ArrivalNoticeUploader';
import { analyzeImportDocuments } from '../../services/importDocumentAnalysisService';
import { calculateEstimatedImportDuty } from '../../services/importDutyService';
import { assessImportRisks } from '../../services/importRiskService';
import { reconcileFromAnalysis, runImportReconciliation, evaluateReconciliationGate } from '../../services/importReconciliationEngine';
import { IMPORT_DEMO_SCENARIOS, type ImportDemoScenario } from '../../services/importReconciliationFixtures';

// 데모 데이터 버튼 노출 플래그 (OpenAI 없이 대사 화면 재현용).
// 팀 기존 플래그 재사용하되 DEV 게이트는 빼서 빌드/심사장에서도 사용 가능.
const IMPORT_DEMO_ENABLED = import.meta.env.VITE_ENABLE_TEST_SUBMISSION === 'true';
import { generateImportDeclarationRequest, downloadImportDeclarationRequest } from '../../services/importDeclarationService';
import { lookupImportCargo } from '../../services/cargoProgressService';
import type {
  CargoTrackingResult,
  ArrivalNoticeMeta,
  ImportAnalysisResult,
  ImportDocumentMeta,
  ImportDutyEstimate,
  ImportHSCodeSuggestion,
  ImportRisk,
  ImportTradeSnapshot,
  ReconciliationRuleResult,
  UserTradeRole,
} from '../../types/importTrade';
import type { TradeStatus } from '../../types';

interface Props {
  role: UserTradeRole;
  userId: string;
  onComplete: (snapshot: ImportTradeSnapshot) => Promise<void>;
}

interface CachedState {
  step: number;
  documents: ImportDocumentMeta[];
  analysis: ImportAnalysisResult | null;
  reconciliation: ReconciliationRuleResult[];
  overrides: Record<string, string>; // ruleId → 진행 사유 (overridable 오류 우회 기록)
  suggestions: ImportHSCodeSuggestion[];
  selectedCode: string;
  duty: ImportDutyEstimate | null;
  risks: ImportRisk[];
  cargo: CargoTrackingResult | null;
  arrivalNotice: ArrivalNoticeMeta | null;
  generatedAt: string | null;
  tradeId?: string;
  existingStatus?: TradeStatus;
}

const EMPTY: CachedState = { step: 1, documents: [], analysis: null, reconciliation: [], overrides: {}, suggestions: [], selectedCode: '', duty: null, risks: [], cargo: null, arrivalNotice: null, generatedAt: null };
function loadCached(key: string): CachedState {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<CachedState> | null;
    return parsed ? { ...EMPTY, ...parsed, documents: parsed.documents ?? [] } : EMPTY;
  } catch {
    return EMPTY;
  }
}

export default function ImportTradeFlow({ role, userId, onComplete }: Props) {
  const cacheKey = `portai_import_draft:${userId}:${role}`;
  const [state, setState] = useState<CachedState>(() => loadCached(cacheKey));
  const [sourceFiles, setSourceFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const selectedHS = state.suggestions.find((item) => item.code === state.selectedCode);
  const gate = state.analysis ? evaluateReconciliationGate(state.reconciliation, state.overrides) : null;

  useEffect(() => {
    try {
      localStorage.setItem(cacheKey, JSON.stringify(state));
    } catch (error) {
      // 저장 공간 제한/브라우저 정책 오류가 있어도 React state의 현재 입력 화면은 유지합니다.
      console.warn('[Import Draft] localStorage 임시 저장 실패:', error);
    }
  }, [cacheKey, state]);

  const analyze = async () => {
    setMessage('');
    if (state.documents.length === 0) {
      setMessage('분석할 파일을 먼저 업로드해 주세요.');
      return;
    }
    const missingFiles = state.documents.filter((document) => !sourceFiles[document.id]);
    if (missingFiles.length) {
      setMessage(`원본 파일을 다시 선택해 주세요: ${missingFiles.map((document) => document.name).join(', ')}`);
      return;
    }
    setBusy(true);
    try {
      const result = await analyzeImportDocuments(state.documents, sourceFiles);
      const suggestions = role === 'shipper' ? result.suggestions : [];
      setState((current) => {
        const documents = current.documents.map((document) => {
          const classification = result.classifications.find((item) => item.id === document.id);
          return classification ? { ...document, type: classification.type, status: 'ready' as const } : document;
        });
        // 결정론적 대사 엔진으로 판정(코드) — LLM validations는 AI 참고 채널로만 전달.
        const reconciliation = reconcileFromAnalysis(result.analysis, documents.map((document) => document.type));
        return {
          ...current,
          step: 2,
          documents,
          analysis: result.analysis,
          reconciliation,
          overrides: {},
          suggestions,
          selectedCode: suggestions[0]?.code ?? '',
          risks: assessImportRisks(documents, reconciliation, result.analysis.validations),
        };
      });
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : '문서 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const loadDemoScenario = (scenario: ImportDemoScenario) => {
    setMessage('');
    setSourceFiles({});
    // 판정은 픽스처 input을 엔진에 직접 주입(OCR/어댑터 우회). 화면은 scenario.analysis로 표시.
    const reconciliation = runImportReconciliation(scenario.input);
    setState((current) => ({
      ...current,
      step: 2,
      documents: scenario.documents,
      analysis: scenario.analysis,
      reconciliation,
      overrides: {},
      suggestions: [],
      selectedCode: '',
      duty: null,
      cargo: null,
      risks: assessImportRisks(scenario.documents, reconciliation, scenario.analysis.validations),
      generatedAt: current.generatedAt ?? new Date().toISOString(),
    }));
  };

  // 필수 정보 확인 + 관세 계산 후 3단계로 진입 (게이트 통과 이후에만 호출)
  const proceedToProcessing = async () => {
    if (!state.analysis) return;
    const requiredFields = [
      ['품명', state.analysis.extracted.productDescription],
      ['B/L 번호', state.analysis.extracted.blNo],
      ['수입자/Consignee', state.analysis.extracted.consignee],
    ].filter(([, value]) => !value);
    if (requiredFields.length) {
      setMessage(`필수 정보가 부족합니다: ${requiredFields.map(([label]) => label).join(', ')}`);
      return;
    }
    if (role === 'shipper' && !selectedHS) {
      setMessage('최종 HS Code를 선택해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const duty = role === 'shipper' && selectedHS
        ? await calculateEstimatedImportDuty({
          hsCode: selectedHS.code,
          customsValue: Number(state.analysis.extracted.totalAmount) || 0,
          originCountry: state.analysis.extracted.originCountry,
          destinationCountry: state.analysis.extracted.destinationCountry,
        })
        : null;
      setState((current) => ({ ...current, step: 3, duty, generatedAt: current.generatedAt ?? new Date().toISOString(), existingStatus: 'generated' }));
      setMessage('');
    } finally {
      setBusy(false);
    }
  };

  // 2→3단계 전이 게이트: 하드 차단(IR10)→막음, overridable 오류→사유 모달, 없으면 바로 진행
  const continueToProcessing = async () => {
    if (!state.analysis) return;
    const currentGate = evaluateReconciliationGate(state.reconciliation, state.overrides);
    if (currentGate.status === 'blocked') {
      setMessage(currentGate.message);
      return;
    }
    if (currentGate.status === 'override_required') {
      setOverrideReason('');
      setOverrideOpen(true);
      return;
    }
    await proceedToProcessing();
  };

  // 사유 입력 확정 → 미해결 overridable 오류를 사유로 우회 기록 후 3단계 진행
  const confirmOverride = async () => {
    const reason = overrideReason.trim();
    if (!reason) {
      setMessage('진행 사유를 입력해 주세요.');
      return;
    }
    const currentGate = evaluateReconciliationGate(state.reconciliation, state.overrides);
    const nextOverrides = { ...state.overrides };
    currentGate.overridable.forEach((result) => { nextOverrides[result.ruleId] = reason; });
    setState((current) => ({ ...current, overrides: nextOverrides }));
    setOverrideOpen(false);
    setOverrideReason('');
    setMessage('');
    await proceedToProcessing();
  };

  const lookupCargo = async () => {
    if (!state.analysis?.extracted.blNo) {
      setMessage('B/L 번호를 입력해 주세요.');
      return;
    }
    setBusy(true);
    setState((current) => ({ ...current, cargo: current.cargo ? { ...current.cargo, lookupStatus: 'loading' } : null }));
    try {
      const cargo = await lookupImportCargo(state.analysis.extracted.blNo);
      setState((current) => ({ ...current, cargo }));
    } catch (error) {
      console.error(error);
      setMessage('통관 진행 정보를 조회하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!state.analysis) return;
    if (!window.confirm('수입 거래를 완료하고 저장할까요?')) return;
    setBusy(true);
    try {
      const snapshot: ImportTradeSnapshot = {
        tradeId: state.tradeId,
        direction: 'import',
        role,
        documents: state.documents,
        arrivalNotice: state.arrivalNotice ?? undefined,
        analysis: state.analysis,
        reconciliationOverrides: Object.keys(state.overrides).length > 0 ? state.overrides : undefined,
        selectedHSCode: selectedHS,
        duty: state.duty ?? undefined,
        risks: state.risks,
        cargo: state.cargo ?? undefined,
        generatedAt: state.generatedAt ?? new Date().toISOString(),
        flowCompletedAt: new Date().toISOString(),
      };
      await onComplete(snapshot);
      localStorage.removeItem(cacheKey);
      setState(EMPTY);
      setSourceFiles({});
    } catch (error) {
      console.error(error);
      setMessage('거래 저장에 실패했습니다. DB 마이그레이션 적용 여부와 연결 상태를 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    if (!window.confirm('현재 수입 거래의 단계와 분석 결과를 모두 초기화할까요?')) return;
    localStorage.removeItem(cacheKey);
    setState(EMPTY);
    setSourceFiles({});
    setMessage('');
  };

  return (
    <div className="import-flow">
      <div className="import-flow-header">
        <div>
          <h2>수입 {role === 'shipper' ? '화주' : '포워더'} 업무</h2>
          <p>{role === 'shipper' ? '수입신고 준비부터 예상 관세와 리스크까지 확인합니다.' : '수령한 서류를 대사하고 UNI-PASS 통관 진행을 추적합니다.'}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={reset}><RefreshCw size={15} /> 단계 초기화</button>
      </div>

      <ImportStepIndicator
        current={state.step}
        labels={role === 'shipper' ? ['서류 업로드', 'AI 분석 확인', '통합 처리', '완료'] : ['서류 업로드', '서류 대사', '통관 처리', '완료']}
        onMove={(step) => setState((current) => ({ ...current, step }))}
      />
      {message && <div className="form-message error" role="alert">{message}</div>}

      {state.step === 1 && (
        <>
          <ImportDocumentUploader
            documents={state.documents}
            onChange={(documents) => setState((current) => ({ ...current, documents }))}
            onFilesAdded={(entries) => setSourceFiles((current) => {
              const next = { ...current };
              entries.forEach(({ id, file }) => { next[id] = file; });
              return next;
            })}
            onFileRemoved={(id) => setSourceFiles((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            })}
            description={role === 'shipper'
              ? 'C/I, P/L, B/L 파일을 업로드하면 AI가 종류를 자동 분류하고 주요 정보를 분석합니다.'
              : '화주 또는 수출지 포워더에게 받은 B/L, C/I, P/L 사본을 업로드해 주세요.'}
          />
          <div className="import-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void analyze()}>{busy ? 'AI 분석 중…' : 'AI 분석 시작'}</button></div>
          {IMPORT_DEMO_ENABLED && role === 'forwarder' && (
            <div className="import-demo-bar">
              <span className="import-demo-label">데모 데이터 (OpenAI 없이 대사 시연)</span>
              <div className="import-demo-buttons">
                {IMPORT_DEMO_SCENARIOS.map((scenario) => (
                  <button key={scenario.id} type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => loadDemoScenario(scenario)} title={scenario.description}>
                    {scenario.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {state.step === 2 && state.analysis && (
        <>
          <ImportAnalysisSummary analysis={state.analysis} onChange={(extracted) => setState((current) => ({ ...current, analysis: current.analysis ? { ...current.analysis, extracted } : null }))} />
          {role === 'forwarder' ? <ImportDocumentComparison results={state.reconciliation} rows={state.analysis.comparison} /> : (
            <section className="form-card import-card">
              <div className="import-card-heading"><div><span className="ai-badge">수입국 기준</span><h2>HS Code 추천</h2></div></div>
              <div className="hs-suggestion-list">{state.suggestions.map((suggestion) => (
                <label key={suggestion.code} className={`hs-suggestion ${state.selectedCode === suggestion.code ? 'selected' : ''}`}>
                  <input type="radio" name="import-hs" checked={state.selectedCode === suggestion.code} onChange={() => setState((current) => ({ ...current, selectedCode: suggestion.code }))} />
                  <span><strong>{suggestion.code} · {suggestion.description}</strong><small>{suggestion.reasoning} · 신뢰도 {Math.round(suggestion.confidence * 100)}%</small></span>
                </label>
              ))}</div>
            </section>
          )}
          {gate && gate.status !== 'clear' && (
            <div className={`form-message ${gate.status === 'blocked' ? 'error' : 'info'}`} role="alert">{gate.message}</div>
          )}
          <div className="import-actions">
            <button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 1 }))}>이전</button>
            <button className="btn btn-primary" disabled={busy || gate?.status === 'blocked'} onClick={() => void continueToProcessing()}>
              {gate?.status === 'override_required' ? '사유 입력 후 진행' : '확인'}
            </button>
          </div>
        </>
      )}

      {state.step === 3 && state.analysis && role === 'shipper' && (
        <>
          <section className="form-card import-card">
            <div className="import-card-heading"><div><h2>수입신고 의뢰서</h2></div><p>분석 결과를 기반으로 생성한 미리보기 데이터입니다.</p></div>
            <div className="document-preview-actions">
              <button className="btn btn-secondary" aria-label="수입신고 의뢰서 보기" title="수입신고 의뢰서 보기" onClick={() => setPreview(true)}><Eye size={17} /> 보기</button>
              <button className="btn btn-primary" aria-label="수입신고 의뢰서 다운로드" title="수입신고 의뢰서 다운로드" onClick={() => void downloadImportDeclarationRequest({ fields: state.analysis!.extracted, hsCode: selectedHS, duty: state.duty ?? undefined })}><Download size={17} /> 다운로드</button>
            </div>
            {preview && <pre className="declaration-preview">{generateImportDeclarationRequest({ fields: state.analysis.extracted, hsCode: selectedHS, duty: state.duty ?? undefined })}</pre>}
          </section>
          {state.duty && <section className="form-card import-card"><div className="import-card-heading"><div><h2>예상 관세액</h2></div><span className="source-badge">{state.duty.source === 'api' ? 'API' : '시뮬레이션'}</span></div>
            <dl className="duty-grid">
              <div><dt>과세가격</dt><dd>{state.duty.customsValue.toLocaleString()}원</dd></div><div><dt>기본세율</dt><dd>{state.duty.basicRate}%</dd></div>
              <div><dt>기본 관세</dt><dd>{state.duty.basicDuty.toLocaleString()}원</dd></div><div><dt>FTA 협정</dt><dd>{state.duty.ftaAgreement}</dd></div>
              <div><dt>FTA 세율</dt><dd>{state.duty.ftaRate}%</dd></div><div><dt>FTA 관세</dt><dd>{state.duty.ftaDuty.toLocaleString()}원</dd></div>
              <div><dt>예상 절감액</dt><dd>{state.duty.estimatedSavings.toLocaleString()}원</dd></div><div><dt>부가가치세</dt><dd>{state.duty.vat.toLocaleString()}원</dd></div>
              <div><dt>총 예상 세액</dt><dd>{state.duty.totalTax.toLocaleString()}원</dd></div>
            </dl><p className="import-notice">FTA 협정세율은 원산지증명서와 협정 요건 충족 여부에 따라 달라질 수 있습니다.</p>
          </section>}
          <RiskSummary risks={state.risks} />
          <div className="import-actions"><button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button><button className="btn btn-primary" disabled={busy} onClick={() => void complete()}>완료</button></div>
        </>
      )}

      {state.step === 3 && state.analysis && role === 'forwarder' && (
        <>
          <section className="form-card import-card"><div className="import-card-heading"><div><h2>통관 진행 현황</h2></div><span className="source-badge">{state.cargo?.source === 'api' ? 'UNI-PASS API' : state.cargo ? '시뮬레이션' : '조회 전'}</span></div>
            <div className="cargo-query"><label className="form-group"><span className="form-label">M/H B/L 번호</span><input className="form-input" value={state.analysis.extracted.blNo} onChange={(event) => setState((current) => ({ ...current, analysis: current.analysis ? { ...current.analysis, extracted: { ...current.analysis.extracted, blNo: event.target.value } } : null }))} /></label><label className="form-group"><span className="form-label">컨테이너 번호</span><input className="form-input" value={state.analysis.extracted.containerNo} onChange={(event) => setState((current) => ({ ...current, analysis: current.analysis ? { ...current.analysis, extracted: { ...current.analysis.extracted, containerNo: event.target.value } } : null }))} /></label><button className="btn btn-primary" disabled={busy} onClick={() => void lookupCargo()}><Search size={16} /> {busy ? '조회 중…' : '조회'}</button></div>
            {!state.cargo ? <p className="import-empty">B/L 번호로 통관 진행 정보를 조회해 주세요.</p> : <><p className="cargo-status-text"><strong>{state.cargo.status}</strong> · {state.cargo.detail}</p><ol className="cargo-timeline">{state.cargo.timeline.map((item) => <li key={item.label} className={item.current ? 'current' : item.completed ? 'done' : ''}><span />{item.label}</li>)}</ol></>}
          </section>
          <ArrivalNoticeUploader value={state.arrivalNotice} onChange={(arrivalNotice) => setState((current) => ({ ...current, arrivalNotice }))} />
          <RiskSummary risks={state.risks} />
          <div className="import-actions"><button className="btn btn-secondary" onClick={() => setState((current) => ({ ...current, step: 2 }))}>이전</button><button className="btn btn-primary" disabled={busy || state.existingStatus === 'submitted'} onClick={() => void complete()}>{state.existingStatus === 'submitted' ? '제출 완료' : state.arrivalNotice ? '완료 및 제출' : '진행 중으로 저장'}</button></div>
        </>
      )}

      {overrideOpen && gate && gate.overridable.length > 0 && (
        <div className="import-modal-overlay" role="dialog" aria-modal="true" aria-label="진행 사유 입력">
          <div className="import-modal">
            <h3>확인 필요 오류 — 진행 사유 입력</h3>
            <p className="import-modal-desc">아래 불일치를 검토했고, 사유를 남기면 통관 처리 단계로 진행합니다. (필수 서류 누락은 사유로도 진행할 수 없습니다.)</p>
            <ul className="import-modal-list">
              {gate.overridable.map((result) => (
                <li key={result.ruleId}><strong>{result.ruleId}. {result.label}</strong><span>{result.evidence}</span></li>
              ))}
            </ul>
            <textarea
              className="form-input"
              rows={3}
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder="예: 수출자에 수량·중량 확인 요청함. 원본 P/L 재발행 예정."
            />
            <div className="import-modal-actions">
              <button className="btn btn-secondary" onClick={() => { setOverrideOpen(false); setOverrideReason(''); }}>취소</button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void confirmOverride()}>사유 확인 후 진행</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RiskSummary({ risks }: { risks: ImportRisk[] }) {
  const relevant = risks.filter((risk) => risk.level !== 'low');
  return <section className="form-card import-card"><div className="import-card-heading"><div><h2>종합 리스크 요약</h2></div></div>
    {relevant.length === 0 ? <div className="risk-complete"><strong>모든 주요 조건이 충족되었습니다.</strong><p>현재 확인된 서류와 입력정보를 기준으로 추가적인 주요 위험요소가 발견되지 않았습니다.</p></div> : <div className="risk-list">{relevant.map((risk) => <article key={risk.id} className={`risk-item ${risk.level}`}><span>{risk.level === 'high' ? '높음' : '보통'}</span><div><strong>{risk.item}</strong><p>{risk.cause}</p><small>권장 확인사항: {risk.recommendation}</small></div></article>)}</div>}
    <p className="import-notice">이 결과는 자동 분석에 따른 참고 정보이며 법률적·행정적 확정 판단이 아닙니다.</p>
  </section>;
}
