import { FileWarning, RotateCcw } from 'lucide-react';
import type { ForwarderReturnRequest } from '../../types/forwarderCase';
import type { ImportAnalysisResult } from '../../types/importTrade';
import ForwarderReturnRequestContent from '../import/ForwarderReturnRequestContent';
import ImportReturnRequestMatches from '../import/ImportReturnRequestMatches';
import { returnRequestChips } from '../../utils/returnRequestDocuments';
import '../../styles/returnRequest.css';

interface Props {
  request: ForwarderReturnRequest;
  /** 있으면 [문서 수정하러 가기]를 보여준다(처리 전 요청일 때만). */
  onRevise?: () => void;
  analysis?: ImportAnalysisResult | null;
}

function dateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * 화주가 받은 포워더 보완 요청 — 어떤 서류를 왜 다시 보내야 하는지 먼저 보여주고,
 * 그다음에 고치러 가게 한다. 이미 재제출로 처리된 요청이면 처리 완료로 표시한다.
 */
export default function ShipperReturnRequestCard({ request, onRevise, analysis = null }: Props) {
  const resolved = Boolean(request.resolvedAt);
  const chips = returnRequestChips(request);
  const reply = request.shipperReply?.trim();

  return (
    <section className={`rr-card${resolved ? ' is-resolved' : ''}`} aria-label="포워더 보완 요청">
      <div className="rr-card-head">
        <FileWarning size={17} aria-hidden="true" />
        <strong>포워더 보완 요청</strong>
        <span className={`rr-card-status${resolved ? ' is-resolved' : ''}`}>{resolved ? '처리 완료' : '수정 필요'}</span>
        <time className="rr-card-date" dateTime={request.requestedAt}>{dateTime(request.requestedAt)} 요청</time>
      </div>

      {chips.length > 0 && (
        <div className="rr-card-docs">
          <span>{request.documentTypes?.length ? '보완 서류' : '요청 항목'}</span>
          <ul>{chips.map((chip) => <li key={chip}>{chip}</li>)}</ul>
        </div>
      )}

      <div className="rr-content">
        <ForwarderReturnRequestContent reason={request.reason} />
      </div>
      <ImportReturnRequestMatches request={request} analysis={analysis} />

      {resolved && (
        <p className="rr-card-resolved">
          {dateTime(request.resolvedAt)}에 서류를 다시 제출해 처리된 요청입니다.
          {reply && <><br />남긴 회신: {reply}</>}
        </p>
      )}

      {!resolved && onRevise && (
        <div className="rr-card-actions">
          <button type="button" className="btn btn-primary" onClick={onRevise}>
            <RotateCcw size={15} /> 문서 수정하러 가기
          </button>
        </div>
      )}
    </section>
  );
}
