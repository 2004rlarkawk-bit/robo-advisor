import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Download, FileText, Paperclip, X } from 'lucide-react';
import {
  IMPORT_DECLARATION_STATUS_LABEL as DECLARATION_LABELS,
  IMPORT_DO_STATUS_LABEL as DO_LABELS,
  type ForwarderCaseState,
  type ForwarderImportCase,
  type ForwarderImportOperationsState,
} from '../../types/forwarderCase';
import {
  buildImportDeclarationDocx, downloadImportDeclarationDocx, renderImportDeclarationPreview,
} from '../../services/importDeclarationService';
import { loadTradeAttachmentFile, uploadTradeAttachment } from '../../services/tradeAttachmentStorageService';
import ForwarderCargoPanel from './ForwarderCargoPanel';

interface Props {
  item: ForwarderImportCase;
  userId: string;
  saving: boolean;
  locked: boolean;
  arrivalNotice: ReactNode;
  onSave: (state: ForwarderImportOperationsState, activity: string) => Promise<boolean>;
}

/** 준비한 자료와 외부에서 처리한 신고·D/O의 기록을 구분한다. */
export default function ForwarderImportOperations({ item, userId, saving, locked, arrivalNotice, onSave }: Props) {
  const stored = (item.trade.forwarderCase as ForwarderCaseState | undefined)?.importOperations;
  const [draft, setDraft] = useState<ForwarderImportOperationsState>(() => stored ?? {
    brokerName: '', declarationNo: '', declarationStatus: 'preparing',
    doStatus: 'waiting', doNumber: item.trade.forwarderCase?.dispatchRequest?.doNo ?? '', doIssuer: '', doDocument: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const data = {
    fields: item.snapshot.analysis.extracted, duty: item.snapshot.duty, risks: item.snapshot.risks,
    documents: item.snapshot.documents, importerCompanyName: item.importer, tradeId: item.tradeId,
    customsBroker: draft.brokerName, deliveryOrderNo: draft.doNumber, hasDeliveryOrderDocument: Boolean(draft.doDocument),
  };
  const readonly = locked || saving || busy || item.stage === 'done';
  const patch = (value: Partial<ForwarderImportOperationsState>) => {
    setDraft(current => ({ ...current, ...value })); setNotice('');
  };
  useEffect(() => {
    if (!previewBlob || !previewHost.current) return;
    dialog.current?.showModal();
    void renderImportDeclarationPreview(previewBlob, previewHost.current).catch(() => {
      setError('미리보기를 열지 못했습니다. 다시 시도해 주세요.'); setPreviewBlob(null);
    });
  }, [previewBlob]);

  const documentAction = async (preview: boolean) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (preview) setPreviewBlob(await buildImportDeclarationDocx(data));
      else await downloadImportDeclarationDocx(data);
    } catch { setError('신고자료를 생성하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (readonly) return;
    setNotice(''); setError('');
    if (draft.declarationStatus === 'handed_over' && !draft.brokerName.trim()) {
      setError('전달한 관세사 또는 관세법인을 입력해 주세요.'); return;
    }
    if (['filed', 'cleared'].includes(draft.declarationStatus) && !draft.declarationNo.trim()) {
      setError('신고 접수·수리 상태에는 수입신고번호를 입력해 주세요.'); return;
    }
    if (draft.doStatus === 'received' && !draft.doNumber.trim() && !draft.doDocument) {
      setError('D/O 수령 기록에는 번호 또는 원본 서류가 필요합니다.'); return;
    }
    if (await onSave(draft, `수입 업무 기록 — ${DECLARATION_LABELS[draft.declarationStatus]} · D/O ${DO_LABELS[draft.doStatus]}`)) {
      setNotice('업무 기록을 저장했습니다.');
    }
  };
  const attachDo = async (file?: File) => {
    if (!file || readonly) return;
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name) || file.size > 20 * 1024 * 1024) {
      setError('20MB 이하 PDF·PNG·JPG 파일을 선택해 주세요.'); return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const uploaded = await uploadTradeAttachment({ userId, scopeId: item.tradeId, documentType: 'other', file });
      // 업로드한 파일을 즉시 업무 기록에 연결한다. 다른 미저장 입력은 함께 저장하지 않는다.
      const base = stored ?? { brokerName: '', declarationNo: '', declarationStatus: 'preparing' as const,
        doStatus: 'waiting' as const, doNumber: '', doIssuer: '' };
      if (await onSave({ ...base, doDocument: uploaded }, `D/O 원본 첨부 — ${file.name}`)) {
        patch({ doDocument: uploaded }); setNotice('D/O 원본을 첨부했습니다. 수령 상태는 확인 후 저장하세요.');
      } else setError('파일 연결을 저장하지 못했습니다. 다시 첨부해 주세요.');
    } catch { setError('D/O 원본을 첨부하지 못했습니다. 다시 시도해 주세요.'); }
    finally { setBusy(false); }
  };
  const openDo = async () => {
    if (!draft.doDocument || busy) return;
    const target = window.open('', '_blank');
    if (target) target.opener = null;
    setBusy(true); setError('');
    try {
      const file = await loadTradeAttachmentFile(draft.doDocument, userId);
      const url = URL.createObjectURL(file);
      if (target) target.location.href = url;
      else setError('원본을 열려면 팝업을 허용해 주세요.');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { target?.close(); setError('D/O 원본을 열지 못했습니다.'); }
    finally { setBusy(false); }
  };

  return <div className="fwd-import-operations">
    <section className="form-card import-card fwd-declaration-card">
      <div className="import-card-heading"><div><span className="fwd-section-kicker">01 · 신고 준비</span><h2>수입신고 자료</h2><p>제출 서류의 정보를 신고의뢰서로 정리합니다.</p></div><span className="fwd-soft-badge">관세사 전달용</span></div>
      <div className="fwd-declaration-document">
        <span className="fwd-document-icon"><FileText size={25} /></span>
        <div><strong>수입신고의뢰서</strong><p>수입자 · 품목 · 금액 · 첨부 서류</p></div>
        <div className="fwd-inline-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void documentAction(true)}>미리보기</button><button className="btn btn-primary" type="button" disabled={busy || locked || saving} onClick={() => void documentAction(false)}><Download size={15} />{busy ? '처리 중…' : '자료 다운로드'}</button></div>
      </div>
      <p className="fwd-section-note">다운로드한 자료를 관세사에게 전달해 주세요. 세관에 자동 제출되지 않습니다.</p>
    </section>

    <section className="form-card import-card">
      <div className="import-card-heading"><div><span className="fwd-section-kicker">02 · 통관 관리</span><h2>신고 진행 기록</h2><p>관세사에게 확인한 진행 상황을 기록하세요.</p></div><span className="fwd-soft-badge">{DECLARATION_LABELS[stored?.declarationStatus ?? 'preparing']}</span></div>
      <fieldset className="fwd-operation-fields" disabled={readonly}>
        <div className="fwd-operation-grid">
          <label className="form-group"><span className="form-label">담당 관세사 / 관세법인</span><input className="form-input" value={draft.brokerName} onChange={e => patch({ brokerName: e.target.value })} placeholder="예: 한빛 관세법인" /></label>
          <label className="form-group"><span className="form-label">신고 진행 상태</span><select className="form-input" value={draft.declarationStatus} onChange={e => patch({ declarationStatus: e.target.value as ForwarderImportOperationsState['declarationStatus'] })}>{Object.entries(DECLARATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="form-group"><span className="form-label">수입신고번호</span><input className="form-input" value={draft.declarationNo} onChange={e => patch({ declarationNo: e.target.value })} placeholder="신고 접수 후 입력" /></label>
        </div>
      </fieldset>
      <details className="fwd-cargo-disclosure"><summary>B/L로 화물 진행 조회</summary><ForwarderCargoPanel initialBlNo={item.blNo} /></details>
    </section>

    <div className="fwd-section-heading"><span className="fwd-section-kicker">03 · 도착·인도 서류</span><h2>도착 안내와 화물 인도</h2></div>
    <div className="fwd-release-grid">
      {arrivalNotice}
      <section className="form-card import-card fwd-do-card">
        <div className="import-card-heading"><div><h2>화물인도지시서 · D/O</h2><p>선사·대리점에 요청한 D/O를 관리합니다.</p></div></div>
        <fieldset className="fwd-operation-fields" disabled={readonly}>
          <div className="fwd-operation-grid fwd-operation-grid--two">
            <label className="form-group"><span className="form-label">D/O 상태</span><select className="form-input" value={draft.doStatus} onChange={e => patch({ doStatus: e.target.value as ForwarderImportOperationsState['doStatus'] })}>{Object.entries(DO_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="form-group"><span className="form-label">D/O 번호</span><input className="form-input" value={draft.doNumber} onChange={e => patch({ doNumber: e.target.value })} placeholder="수령 후 입력" /></label>
            <label className="form-group fwd-field-wide"><span className="form-label">발급 선사 / 대리점</span><input className="form-input" value={draft.doIssuer} onChange={e => patch({ doIssuer: e.target.value })} placeholder="발급처 상호" /></label>
          </div>
          <label className="fwd-do-upload"><Paperclip size={16} />{busy ? '처리 중…' : draft.doDocument ? 'D/O 원본 교체' : 'D/O 원본 첨부'}<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e => { void attachDo(e.target.files?.[0]); e.target.value = ''; }} /><small>PDF · 이미지, 최대 20MB</small></label>
        </fieldset>
        {draft.doDocument && <button type="button" className="fwd-file-link" disabled={busy} onClick={() => void openDo()}><FileText size={16} />{draft.doDocument.fileName} · 원본 열기</button>}
        <p className="fwd-section-note">외부 발급 내역을 기록합니다. 선사에 요청이 자동 전송되지 않습니다.</p>
      </section>
    </div>
    {error && <p role="alert" className="form-message error">{error}</p>}
    {notice && <p role="status" className="fwd-save-notice"><CheckCircle2 size={16} />{notice}</p>}
    <div className="fwd-operation-save"><span>변경한 신고·D/O 상태를 업무 기록에 저장합니다.</span><button type="button" className="btn btn-primary" disabled={readonly} onClick={() => void save()}>{saving ? '저장 중…' : '업무 기록 저장'}</button></div>
    {previewBlob && <dialog className="fwd-declaration-dialog" ref={dialog} onCancel={() => setPreviewBlob(null)}><div className="fwd-dialog-heading"><div><strong>수입신고의뢰서 미리보기</strong><span>자동 생성 초안 · 제출 전 확인</span></div><button type="button" className="btn btn-secondary" aria-label="미리보기 닫기" onClick={() => setPreviewBlob(null)}><X size={20} /></button></div><div className="fwd-declaration-preview" ref={previewHost} /></dialog>}
  </div>;
}
