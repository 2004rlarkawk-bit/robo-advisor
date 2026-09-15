import { ExternalLink, Mail } from 'lucide-react';
import type { ForwarderImportCase } from '../../types/forwarderCase';
import type { ImportDocumentMeta } from '../../types/importTrade';
import { getInboxImporterName } from '../../utils/forwarderInbox';
import ForwarderReturnRequestContent from './ForwarderReturnRequestContent';

interface Props {
  item: ForwarderImportCase;
  documents: ImportDocumentMeta[];
  documentBusy: boolean;
  saving: boolean;
  onOpenDocument: (document: ImportDocumentMeta) => void;
  onReview: () => void;
  onCancel: () => void;
}

function messageDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

/** 받은 회신과 보낸 요청을 분리한다. 기존 요청 원문은 변경하지 않는다. */
export default function ForwarderRequestMessages({ item, documents, documentBusy, saving, onOpenDocument, onReview, onCancel }: Props) {
  const request = item.returnRequest;
  if (!request) return null;
  const replied = Boolean(request.resolvedAt);
  const shipper = getInboxImporterName(item) === '화주명 미입력' ? '화주 담당자' : `${getInboxImporterName(item)} 담당자`;
  const reply = request.shipperReply?.trim();
  const replyDate = request.shipperReplyAt || request.resolvedAt || '';
  const sentContent = <>
    <div className="fwd-return-envelope">
      <h3>수입 서류 보완 요청 <span>· B/L {item.blNo || '번호 미입력'}</span></h3>
      <dl>
        <div><dt>받는 사람</dt><dd>{shipper}</dd></div>
        <div><dt>보낸 날짜</dt><dd><time dateTime={request.requestedAt}>{messageDate(request.requestedAt)}</time></dd></div>
      </dl>
    </div>
    <ForwarderReturnRequestContent reason={request.reason} />
  </>;

  return <section className={`fwd-return-banner${replied ? ' is-resolved' : ''}`} aria-label={replied ? '화주에게 받은 보완 회신' : '화주에게 보낸 보완 요청'}>
    <div className="fwd-return-head">
      <Mail size={17} aria-hidden="true" />
      <strong>{replied ? '받은 회신' : '보낸 요청'}</strong>
      <span className="fwd-return-channel">{replied ? '화주 → 포워더' : '포워더 → 화주'}</span>
      <span className={`fwd-return-status${replied ? ' is-replied' : ''}`}>{replied ? '재검토 필요' : item.shipperEditing ? '화주 수정 중' : '회신 대기'}</span>
    </div>
    {replied ? <>
      <div className="fwd-return-envelope fwd-received-envelope">
        <h3>{reply ? '화주가 보완 회신을 보냈습니다.' : '화주가 서류를 다시 제출했습니다.'}</h3>
        <dl>
          <div><dt>보낸 사람</dt><dd>{shipper}</dd></div>
          <div><dt>받은 날짜</dt><dd><time dateTime={replyDate}>{messageDate(replyDate)}</time></dd></div>
        </dl>
      </div>
      <div className={`fwd-received-body${reply ? '' : ' is-empty'}`}>
        {reply ? <p>{reply}</p> : <p>별도로 남긴 답변은 없습니다. 제출 서류를 확인해 주세요.</p>}
      </div>
      <div className="fwd-reply-documents">
        <strong>재제출 시점의 서류 <span className="fwd-doc-count">{documents.length}</span></strong>
        <p className="fwd-reply-document-note">현재 제출본입니다. 파일별 수정 여부는 원본에서 확인해 주세요.</p>
        <div>{documents.map(doc => <button type="button" key={doc.id} disabled={documentBusy} onClick={() => onOpenDocument(doc)}>{doc.name}<ExternalLink size={13} aria-hidden="true" /></button>)}</div>
        {documents.length === 0 && <p>보관된 원본 파일이 없습니다.</p>}
      </div>
      <div className="fwd-return-actions"><button type="button" className="btn btn-primary" disabled={saving} onClick={onReview}>수정 서류 검토하기</button></div>
      <details className="fwd-sent-history">
        <summary>이전에 보낸 보완 요청 보기</summary>
        {sentContent}
      </details>
    </> : <>
      {sentContent}
      {!item.shipperEditing && <div className="fwd-return-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>요청 취소</button></div>}
    </>}
  </section>;
}
