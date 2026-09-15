import { useState } from 'react';
import { ArrowRight, Inbox, Plus, RefreshCw } from 'lucide-react';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import { IMPORT_DOCUMENT_TYPE_LABELS } from '../../services/importDocumentAnalysisService';
import { formatInboxEta, getInboxImporterName, getInboxItemName, getInboxState, type InboxFilter } from '../../utils/forwarderInbox';
import '../../styles/forwarderImportInbox.css';

interface Props {
  cases: ForwarderImportCase[] | null;
  error: string;
  refreshing: boolean;
  onRefresh: () => void;
  onDirectUpload: () => void;
  onOpen: (tradeId: string) => void;
}

/** 직접 등록(구 단건 위저드) 진입 버튼 노출 여부 — 시연 기간 숨김. */
const DIRECT_UPLOAD_ENABLED = false;

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: 'all', label: '전체' }, { value: 'new', label: '신규' },
  { value: 'progress', label: '진행 중' }, { value: 'reply', label: '보완 회신' }, { value: 'done', label: '완료' },
];

export default function ForwarderImportInbox({ cases, error, refreshing, onRefresh, onDirectUpload, onOpen }: Props) {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const rows = (cases ?? []).map((item) => ({ item, state: getInboxState(item) }));
  const visible = rows.filter(({ state }) => filter === 'all' || state.category === filter);
  // Never open a stale or hidden selection after filtering, refresh, or a status change.
  const picked = visible.find(({ item }) => item.tradeId === pickedId)?.item ?? visible[0]?.item ?? null;
  const documents = picked?.snapshot.documents ?? [];
  const documentTypes = [...new Set(documents.map((document) => document.type))];

  return <section className="fwd-inbox" aria-labelledby="fwd-inbox-title">
    <div className="fwd-inbox-panel" aria-busy={refreshing}>
      <div className="fwd-inbox-panel-heading">
        <h2 id="fwd-inbox-title">받은 의뢰 <span>{cases === null ? '—' : `${cases.length}건`}</span></h2>
        <div className="fwd-inbox-heading-actions">
          {/* 직접 등록은 개편 전 단건 위저드로 이동한다 — 새 워크스페이스와 화면이 달라
              시연 중 혼선을 줄 수 있어 잠시 숨긴다. 복원: DIRECT_UPLOAD_ENABLED를 true로. */}
          {DIRECT_UPLOAD_ENABLED && (
            <button type="button" className="btn btn-secondary" onClick={onDirectUpload}><Plus size={17} aria-hidden="true" /> 직접 등록</button>
          )}
          <button type="button" className="btn btn-secondary fwd-inbox-refresh" aria-label="의뢰 새로고침" title="새로고침" disabled={refreshing} onClick={onRefresh}><RefreshCw size={19} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" /></button>
        </div>
      </div>
      <div className="fwd-inbox-filters" role="group" aria-label="의뢰 상태 필터">
        {FILTERS.map(({ value, label }) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => { setFilter(value); setPickedId(null); }}>
          {label} <span>{cases === null ? '—' : rows.filter(({ state }) => value === 'all' || state.category === value).length}</span>
        </button>)}
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      {cases === null && !error ? <p className="fwd-inbox-empty" role="status">의뢰를 불러오는 중…</p>
        : !error && rows.length === 0 ? <div className="fwd-inbox-empty"><Inbox size={28} aria-hidden="true" /><p>아직 받은 의뢰가 없습니다.</p><span>별도로 받은 서류는 직접 등록할 수 있습니다.</span></div>
        : !error && visible.length === 0 ? <p className="fwd-inbox-empty">이 상태의 의뢰가 없습니다.</p>
        : visible.length > 0 && <div className="fwd-inbox-table-scroll">
          <table className="fwd-inbox-table">
            <caption className="fwd-inbox-sr">받은 의뢰 목록. 의뢰를 선택한 후 하단의 열기 버튼을 누르세요.</caption>
            <thead><tr><th scope="col"><span className="fwd-inbox-sr">선택</span></th><th scope="col">화주 / 품목</th><th scope="col">도착 예정일</th><th scope="col">상태</th><th scope="col">다음 할 일</th></tr></thead>
            <tbody>{visible.map(({ item, state }) => <tr key={item.tradeId} className={picked?.tradeId === item.tradeId ? 'is-selected' : ''} onClick={() => setPickedId(item.tradeId)}>
              <td><input type="radio" name="forwarder-import-case" aria-label={`${getInboxImporterName(item)} · B/L ${item.blNo} 선택`} checked={picked?.tradeId === item.tradeId} onChange={() => setPickedId(item.tradeId)} /></td>
              <td className="fwd-inbox-party"><strong>{getInboxImporterName(item)}</strong><span>{getInboxItemName(item)} · B/L {item.blNo}</span>{item.origin === 'direct_upload' && <small>직접 등록</small>}</td>
              <td className="fwd-inbox-eta">{formatInboxEta(item.eta)}</td>
              <td><span className={`fwd-inbox-badge is-${state.tone}`}>{state.label}</span></td>
              <td>{state.next}</td>
            </tr>)}</tbody>
          </table>
        </div>}
      {picked && <div className="fwd-inbox-selection" aria-live="polite">
        <strong>{getInboxImporterName(picked)}</strong><span>· 첨부 서류 {documents.length}개</span>
        <div className="fwd-inbox-documents">{documentTypes.map((type) => <span key={type} title={IMPORT_DOCUMENT_TYPE_LABELS[type]}>
          {type === 'commercial_invoice' ? 'C/I' : type === 'packing_list' ? 'P/L' : type === 'bill_of_lading' ? 'B/L' : IMPORT_DOCUMENT_TYPE_LABELS[type]}
        </span>)}</div>
      </div>}
    </div>
    <footer className="fwd-inbox-footer"><button type="button" className="btn btn-primary" disabled={!picked || refreshing || Boolean(error)} onClick={() => { if (picked) onOpen(picked.tradeId); }}>선택한 의뢰 열기 <ArrowRight size={18} aria-hidden="true" /></button></footer>
  </section>;
}
