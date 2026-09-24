import { useState } from 'react';
import { X } from 'lucide-react';
import SentConfirmation from '../common/SentConfirmation';
import ForwarderRecommendList from './ForwarderRecommendList';
import type { SavedTrade } from '../../types';
import { ATTACHABLE_DOCUMENT_LABELS, type AttachableDocumentType } from '../../types/forwarderRequest';
import { getOwnForwarderAccount, searchForwarderByEmail, sendTradeRequest } from '../../services/forwarderRequestService';
import { getAttachableDocumentTypes, sendExternalForwarderEmail } from '../../services/externalForwarderEmailService';
import type { ForwarderLookupResult } from '../../types/forwarderRequest';
import '../../styles/forwarderRequest.css';

interface Props {
  trade: SavedTrade;
  onClose: () => void;
  /** 요청 생성/이메일 발송 성공 시 호출 — 호출부에서 상태 목록을 새로고침한다. */
  onSent?: () => void;
  /** 전송 완료 화면의 "요청 내역 보기" — 호출부에서 해당 거래의 요청 상태로 이동한다. */
  onViewRequests?: () => void;
  /** 겸용 계정이 자기에게 배정된 경우 안내하려고 받는다. */
  currentUserId?: string;
}

type Tab = 'internal' | 'external';

/** 외부 포워더 이메일 전송 탭 노출 여부 — 이메일 발송 인프라 검증 후 켠다. */
const EXTERNAL_EMAIL_ENABLED = false;

export default function ForwarderRequestModal({ trade, onClose, onSent, onViewRequests, currentUserId }: Props) {
  const [tab, setTab] = useState<Tab>('internal');

  // 내부(회원) 검색 상태
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<ForwarderLookupResult | null>(null);
  const [searchError, setSearchError] = useState('');
  const [internalMessage, setInternalMessage] = useState('');
  const [sendingInternal, setSendingInternal] = useState(false);
  const [internalSuccess, setInternalSuccess] = useState(false);

  // 외부 이메일 상태
  const attachableTypes = getAttachableDocumentTypes(trade);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientCompany, setRecipientCompany] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [externalMessage, setExternalMessage] = useState(
    '안녕하세요. 아래 건의 해상운송을 의뢰드립니다. 첨부된 의뢰서 및 관련 서류 확인 부탁드립니다.',
  );
  const [selectedDocTypes, setSelectedDocTypes] = useState<AttachableDocumentType[]>(attachableTypes);
  const [sendingExternal, setSendingExternal] = useState(false);
  const [externalError, setExternalError] = useState('');
  const [externalSuccess, setExternalSuccess] = useState(false);

  const handleSearch = async () => {
    setSearchError('');
    setSearchResult(null);
    setInternalSuccess(false);
    const email = searchEmail.trim();
    if (!email) return;
    setSearching(true);
    try {
      const result = await searchForwarderByEmail(email);
      if (!result) setSearchError('해당 이메일로 가입된 포워더 계정을 찾을 수 없습니다.');
      else setSearchResult(result);
    } catch (err) {
      console.error('[ForwarderRequestModal] 포워더 검색 실패:', err);
      setSearchError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectOwnAccount = async () => {
    setSearching(true);
    setSearchError('');
    setSearchResult(null);
    setInternalSuccess(false);
    try {
      setSearchResult(await getOwnForwarderAccount());
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '본인 계정을 확인하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setSearching(false);
    }
  };

  const handleSendInternalRequest = async () => {
    if (!searchResult) return;
    setSendingInternal(true);
    setSearchError('');
    try {
      await sendTradeRequest(trade.id, searchResult.id, internalMessage);
      setInternalSuccess(true);
      onSent?.();
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : '요청 전송에 실패했습니다.');
    } finally {
      setSendingInternal(false);
    }
  };

  const toggleDocType = (type: AttachableDocumentType) => {
    setSelectedDocTypes((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );
  };

  const handleSendExternalEmail = async () => {
    setExternalError('');
    if (!recipientEmail.trim()) {
      setExternalError('포워더 이메일을 입력해 주세요.');
      return;
    }
    setSendingExternal(true);
    try {
      await sendExternalForwarderEmail({
        trade,
        recipientEmail,
        recipientCompany,
        recipientName,
        message: externalMessage,
        documentTypes: selectedDocTypes,
      });
      setExternalSuccess(true);
      onSent?.();
    } catch (err) {
      setExternalError(err instanceof Error ? err.message : '이메일 전송에 실패했습니다.');
    } finally {
      setSendingExternal(false);
    }
  };

  const sentActions = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
      {onViewRequests && <button type="button" className="btn btn-primary" onClick={onViewRequests}>요청 내역 보기</button>}
    </>
  );

  return (
    <div
      className="fwd-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="fwd-modal" role="dialog" aria-modal="true" aria-labelledby="fwd-modal-title">
        <div className="fwd-modal-head">
          <h2 id="fwd-modal-title">포워더에게 의뢰하기</h2>
          <button type="button" className="fwd-modal-close" aria-label="닫기" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="fwd-modal-tabs">
          <button type="button" className={`fwd-modal-tab${tab === 'internal' ? ' active' : ''}`} onClick={() => setTab('internal')}>
            서비스 회원에게 요청
          </button>
          {/* 외부 포워더 이메일 전송은 발송 함수·발신 설정 검증 전까지 숨긴다 — 시연 중 미배포 상태에서 누르면 에러가 난다.
              복원: EXTERNAL_EMAIL_ENABLED를 true로. */}
          {EXTERNAL_EMAIL_ENABLED && (
            <button type="button" className={`fwd-modal-tab${tab === 'external' ? ' active' : ''}`} onClick={() => setTab('external')}>
              외부 포워더에게 이메일 전송
            </button>
          )}
        </div>

        {tab === 'internal' ? (
          internalSuccess ? (
            <SentConfirmation
              title="운송의뢰를 전달했어요"
              message={`${searchResult?.companyName?.trim() || searchResult?.contactName?.trim() || '선택한 포워더'}에 운송의뢰를 전달했습니다. 포워더의 수락을 기다리고 있습니다.`}
              actions={sentActions}
            />
          ) : (
            <>
              <ForwarderRecommendList
                trade={trade}
                currentUserId={currentUserId}
                onSelected={(candidate) => {
                  setSearchError('');
                  setSearchResult(candidate
                    ? {
                      id: candidate.id,
                      companyName: candidate.partnerCompanyName || candidate.companyName,
                      contactName: candidate.contactName,
                    }
                    : null);
                }}
              />

              <div className="fwd-field">
                <button type="button" className="btn btn-secondary" disabled={searching || sendingInternal}
                  onClick={() => void handleSelectOwnAccount()}>내 포워더 계정 선택</button>
              </div>
              <details className="fwd-assign-manual">
                <summary>담당자 이메일을 알고 있다면 직접 찾기</summary>
              <div className="fwd-field">
                <label htmlFor="fwd-search-email">포워더 이메일</label>
                <div className="fwd-search-row">
                  <input
                    id="fwd-search-email"
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="forwarder@example.com"
                  />
                  <button type="button" className="btn btn-secondary" disabled={searching || !searchEmail.trim()} onClick={() => void handleSearch()}>
                    {searching ? '검색 중…' : '검색'}
                  </button>
                </div>
              </div>
              </details>

              {searchError && <div className="form-message error">{searchError}</div>}

              {searchResult && (
                <div className="fwd-search-result">
                  <div className="fwd-search-result-row"><span>업체명</span><span>{searchResult.companyName || '-'}</span></div>
                  <div className="fwd-search-result-row"><span>담당자명</span><span>{searchResult.contactName || '-'}</span></div>
                  <div className="fwd-field" style={{ marginTop: 12, marginBottom: 0 }}>
                    <label htmlFor="fwd-internal-message">요청 메시지</label>
                    <textarea
                      id="fwd-internal-message"
                      rows={3}
                      value={internalMessage}
                      onChange={(e) => setInternalMessage(e.target.value)}
                      placeholder="전달하실 메시지를 입력해 주세요."
                    />
                  </div>
                </div>
              )}

              <div className="fwd-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
                {searchResult && (
                  <button type="button" className="btn btn-primary" disabled={sendingInternal} onClick={() => void handleSendInternalRequest()}>
                    {sendingInternal ? '전달 중…' : '선택한 포워더에게 전달'}
                  </button>
                )}
              </div>
            </>
          )
        ) : externalSuccess ? (
          <SentConfirmation
            title="이메일을 보냈어요"
            message={`${recipientCompany.trim() || recipientEmail.trim()}에게 의뢰 이메일을 보냈어요.`}
            actions={sentActions}
          />
        ) : (
          <>
            <div className="fwd-field">
              <label htmlFor="fwd-ext-email">포워더 이메일</label>
              <input id="fwd-ext-email" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="forwarder@example.com" />
            </div>
            <div className="fwd-field">
              <label htmlFor="fwd-ext-company">업체명</label>
              <input id="fwd-ext-company" type="text" value={recipientCompany} onChange={(e) => setRecipientCompany(e.target.value)} placeholder="ABC Logistics" />
            </div>
            <div className="fwd-field">
              <label htmlFor="fwd-ext-name">담당자명</label>
              <input id="fwd-ext-name" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="홍길동" />
            </div>
            <div className="fwd-field">
              <label htmlFor="fwd-ext-message">메시지</label>
              <textarea id="fwd-ext-message" rows={3} value={externalMessage} onChange={(e) => setExternalMessage(e.target.value)} />
            </div>

            <div className="fwd-field">
              <label>보낼 문서</label>
              {attachableTypes.length === 0 ? (
                <p className="fwd-doc-empty">이 거래에는 아직 생성된 문서가 없습니다.</p>
              ) : (
                <div className="fwd-doc-checklist">
                  {attachableTypes.map((type) => (
                    <label key={type}>
                      <input
                        type="checkbox"
                        checked={selectedDocTypes.includes(type)}
                        onChange={() => toggleDocType(type)}
                      />
                      {ATTACHABLE_DOCUMENT_LABELS[type]}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {externalError && <div className="form-message error">{externalError}</div>}

            <div className="fwd-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>닫기</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={sendingExternal || attachableTypes.length === 0}
                onClick={() => void handleSendExternalEmail()}
              >
                {sendingExternal ? '전송 중…' : '의뢰 이메일 보내기'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
