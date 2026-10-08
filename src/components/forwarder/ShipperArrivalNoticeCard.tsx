import { useEffect, useRef, useState } from 'react';
import { Download, Eye, Ship } from 'lucide-react';
import type { SavedTrade } from '../../types';
import type { ForwarderArrivalNoticeSent } from '../../types/forwarderCase';
import { deriveForwarderCase } from '../../services/forwarderCaseService';
import {
  buildArrivalNoticeDocx, downloadArrivalNoticeDocx, printArrivalNoticeAsPdf, renderArrivalNoticePreview,
} from '../../services/arrivalNoticeDocxService';

interface Props {
  trade: SavedTrade;
  sent: ForwarderArrivalNoticeSent;
}

function dateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * 화주가 받은 화물 도착통지서(A/N) — 포워더가 [화주에게 전달]을 누르면 업무 메시지 위에 붙는다.
 * 파일을 따로 주고받지 않고, 포워더 화면과 같은 거래 데이터·발행 포워더 정보로 같은 문서를 만든다.
 */
export default function ShipperArrivalNoticeCard({ trade, sent }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const previewHost = useRef<HTMLDivElement>(null);
  const caseItem = deriveForwarderCase(trade);

  useEffect(() => {
    if (!previewBlob || !previewHost.current) return;
    void renderArrivalNoticePreview(previewBlob, previewHost.current).catch(() => {
      setError('도착통지서 미리보기를 열지 못했습니다. 다시 시도해 주세요.');
      setPreviewBlob(null);
    });
  }, [previewBlob]);

  if (!caseItem) return null;

  const action = async (format: 'preview' | 'docx' | 'pdf') => {
    if (busy) return;
    if (format === 'preview' && previewBlob) { setPreviewBlob(null); return; }
    setBusy(true); setError('');
    try {
      if (format === 'preview') setPreviewBlob(await buildArrivalNoticeDocx(caseItem, sent.issuerName, sent.contactName));
      else if (format === 'docx') await downloadArrivalNoticeDocx(caseItem, sent.issuerName, sent.contactName);
      else await printArrivalNoticeAsPdf(caseItem, sent.issuerName, sent.contactName);
    } catch {
      setError(format === 'pdf' ? 'PDF 저장 창을 열지 못했습니다. 다시 시도해 주세요.' : '도착통지서를 열지 못했습니다. 다시 시도해 주세요.');
    } finally { setBusy(false); }
  };

  const eta = caseItem.eta;
  return (
    <section className="rr-card an-card" aria-label="화물 도착통지서">
      <div className="rr-card-head">
        <Ship size={17} aria-hidden="true" />
        <strong>화물 도착통지서(A/N)</strong>
        <time className="rr-card-date" dateTime={sent.sentAt}>{dateTime(sent.sentAt)} 받음</time>
      </div>
      <p className="an-card-summary">
        {[caseItem.vesselName && `선박 ${caseItem.vesselName}`, eta && `도착 예정 ${eta}`, caseItem.blNo !== '-' && `B/L ${caseItem.blNo}`].filter(Boolean).join(' · ')
          || '포워더가 보낸 도착통지서를 확인해 주세요.'}
      </p>
      <div className="an-card-actions">
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} aria-expanded={Boolean(previewBlob)} onClick={() => void action('preview')}>
          <Eye size={15} aria-hidden="true" /> {previewBlob ? '닫기' : '보기'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void action('docx')}>
          <Download size={15} aria-hidden="true" /> DOCX
        </button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void action('pdf')}>
          <Download size={15} aria-hidden="true" /> PDF
        </button>
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      {previewBlob && <div className="declaration-preview an-card-preview" ref={previewHost} aria-label="도착통지서 미리보기" />}
    </section>
  );
}
