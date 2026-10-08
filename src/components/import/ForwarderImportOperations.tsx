import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Download, Eye } from 'lucide-react';
import {
  IMPORT_DECLARATION_STATUS_LABEL as DECLARATION_LABELS,
  type ForwarderCaseState,
  type ForwarderImportCase,
  type ForwarderImportOperationsState,
} from '../../types/forwarderCase';
import {
  buildImportDeclarationDocx, downloadImportDeclarationDocx, printImportDeclarationAsPdf, renderImportDeclarationPreview,
} from '../../services/importDeclarationService';
import ForwarderCargoPanel from './ForwarderCargoPanel';

interface Props {
  item: ForwarderImportCase;
  saving: boolean;
  locked: boolean;
  arrivalNotice: ReactNode;
  onSave: (state: ForwarderImportOperationsState, activity: string) => Promise<boolean>;
}

/** 관세사 전달용 신고의뢰서와 실제 신고 진행 기록을 구분한다. */
export default function ForwarderImportOperations({ item, saving, locked, arrivalNotice, onSave }: Props) {
  const stored = (item.trade.forwarderCase as ForwarderCaseState | undefined)?.importOperations;
  const [draft, setDraft] = useState<ForwarderImportOperationsState>(() => stored ?? {
    brokerName: '', declarationNo: '', declarationStatus: 'preparing',
    doStatus: 'waiting', doNumber: '', doIssuer: '', doDocument: null,
  });
  // 마지막으로 저장한 값 — 바뀐 게 없으면 다시 저장하지 않고, 상태가 바뀔 때만 업무 기록을 남긴다.
  const savedRef = useRef<Pick<ForwarderImportOperationsState, 'brokerName' | 'declarationNo' | 'declarationStatus'>>(
    stored ?? { brokerName: '', declarationNo: '', declarationStatus: 'preparing' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const data = {
    fields: item.snapshot.analysis.extracted, duty: item.snapshot.duty, risks: item.snapshot.risks,
    documents: item.snapshot.documents, importerCompanyName: item.importer, tradeId: item.tradeId,
    customsBroker: draft.brokerName,
  };
  const readonly = locked || saving || busy || item.stage === 'done';
  const patch = (value: Partial<ForwarderImportOperationsState>) => {
    setDraft(current => ({ ...current, ...value })); setNotice('');
  };
  useEffect(() => {
    if (!previewBlob || !previewHost.current) return;
    void renderImportDeclarationPreview(previewBlob, previewHost.current).catch(() => {
      setError('미리보기를 열지 못했습니다. 다시 시도해 주세요.'); setPreviewBlob(null);
    });
  }, [previewBlob]);

  const documentAction = async (format: 'preview' | 'docx' | 'pdf') => {
    if (busy) return;
    if (format === 'preview' && previewBlob) { setPreviewBlob(null); return; }
    setBusy(true); setError('');
    try {
      if (format === 'preview') setPreviewBlob(await buildImportDeclarationDocx(data));
      else if (format === 'docx') await downloadImportDeclarationDocx(data);
      else await printImportDeclarationAsPdf(data);
    } catch { setError(format === 'pdf' ? 'PDF 저장 창을 열지 못했습니다. 다시 시도해 주세요.' : '신고자료를 생성하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  /**
   * 신고 진행 기록은 바꾸는 즉시 저장한다(별도 저장 버튼 없음) — 상태는 고르는 순간, 글자 칸은 칸을 벗어날 때.
   * 상태가 바뀔 때만 업무 기록에 한 줄 남기고, 글자 수정은 기록 없이 값만 저장한다.
   */
  const persistDraft = async (next: ForwarderImportOperationsState) => {
    if (readonly) return;
    const before = savedRef.current;
    if (next.brokerName === before.brokerName && next.declarationNo === before.declarationNo
      && next.declarationStatus === before.declarationStatus) return;
    setNotice(''); setError('');
    // 빠진 값은 저장은 하되 바로 알려 준다.
    if (next.declarationStatus === 'handed_over' && !next.brokerName.trim()) {
      setError('전달한 관세사 또는 관세법인을 입력해 주세요.');
    } else if (['filed', 'cleared'].includes(next.declarationStatus) && !next.declarationNo.trim()) {
      setError('신고 접수·수리 상태에는 수입신고번호를 입력해 주세요.');
    }
    const activity = next.declarationStatus !== before.declarationStatus
      ? `수입 신고 진행 기록 — ${DECLARATION_LABELS[next.declarationStatus]}` : '';
    if (await onSave(next, activity)) {
      savedRef.current = next;
      setNotice('자동 저장했습니다.');
    }
  };

  return <div className="fwd-import-operations">
    <section className="form-card import-card fwd-declaration-card">
      <div className="import-card-heading"><div><span className="fwd-section-kicker">01 · 신고 준비</span><h2>수입신고 의뢰서</h2></div></div>
      <div className="document-preview-actions">
        <button className="btn btn-secondary" type="button" disabled={busy} aria-expanded={Boolean(previewBlob)} onClick={() => void documentAction('preview')}><Eye size={17} />{previewBlob ? '닫기' : '보기'}</button>
        <button className="btn btn-secondary" type="button" disabled={busy || locked || saving} onClick={() => void documentAction('docx')}><Download size={17} />DOCX 다운로드</button>
        <button className="btn btn-primary" type="button" disabled={busy || locked || saving} onClick={() => void documentAction('pdf')}><Download size={17} />PDF 저장</button>
      </div>
      {previewBlob && <div className="declaration-preview fwd-declaration-preview" ref={previewHost} aria-label="수입신고 의뢰서 미리보기" />}
    </section>

    <section className="form-card import-card">
      <div className="import-card-heading"><div><span className="fwd-section-kicker">02 · 통관 관리</span><h2>신고 진행 기록</h2><p>관세사에게 확인한 진행 상황을 기록하세요.</p></div><span className="fwd-soft-badge">{DECLARATION_LABELS[stored?.declarationStatus ?? 'preparing']}</span></div>
      <fieldset className="fwd-operation-fields" disabled={readonly}>
        <div className="fwd-operation-grid">
          <label className="form-group"><span className="form-label">담당 관세사 / 관세법인</span><input className="form-input" value={draft.brokerName} onChange={e => patch({ brokerName: e.target.value })} onBlur={() => void persistDraft(draft)} placeholder="예: 한빛 관세법인" /></label>
          <label className="form-group"><span className="form-label">신고 진행 상태</span><select className="form-input" value={draft.declarationStatus} onChange={e => {
            const next = { ...draft, declarationStatus: e.target.value as ForwarderImportOperationsState['declarationStatus'] };
            setDraft(next); void persistDraft(next);
          }}>{Object.entries(DECLARATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-group"><span className="form-label">수입신고번호</span><input className="form-input" value={draft.declarationNo} onChange={e => patch({ declarationNo: e.target.value })} onBlur={() => void persistDraft(draft)} placeholder="신고 접수 후 입력" /></label>
        </div>
      </fieldset>
      <details className="fwd-cargo-disclosure"><summary>B/L로 화물 진행 조회</summary><ForwarderCargoPanel initialBlNo={item.blNo} /></details>
    </section>

    <div className="fwd-release-grid">
      {arrivalNotice}
    </div>
    {error && <p role="alert" className="form-message error">{error}</p>}
    {notice && <p role="status" className="fwd-save-notice"><CheckCircle2 size={16} />{notice}</p>}
  </div>;
}
