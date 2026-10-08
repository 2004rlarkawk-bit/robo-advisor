import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, FileText, X } from 'lucide-react';
import type { GeneratedDocuments } from '../../../types';
import { buildInvoiceDocx, renderInvoiceDocxPreview } from '../../../services/invoiceDocxService';
import { buildPackingListDocx, renderPackingListDocxPreview } from '../../../services/packingListDocxService';
import { buildTransportRequestDocx, renderTransportRequestDocxPreview } from '../../../services/transportRequestDocxService';
import { buildExportDeclarationDocx, renderExportDeclarationDocxPreview } from '../../../services/exportDeclarationDocxService';
import { portaiFileName } from '../../../utils/documentFileName';
import { saveBlobAs } from '../../../utils/saveBlob';
import { describePreviewError } from '../../../utils/docxPreview';

interface DocEntry {
  id: string;
  abbr: string;
  name: string;
  fileName: string;
  build: () => Promise<Blob>;
  render: (blob: Blob, host: HTMLElement) => Promise<void>;
}

/** 화주가 PortAI로 만들어 의뢰와 함께 보낸 서류 — 있는 것만, 화주 화면과 같은 순서로. */
function shipperDocEntries(docs: GeneratedDocuments | null | undefined): DocEntry[] {
  if (!docs) return [];
  const entries: Omit<DocEntry, 'fileName'>[] = [];
  if (docs.invoice) entries.push({ id: 'invoice', abbr: 'C/I', name: '상업송장', build: () => buildInvoiceDocx(docs.invoice!), render: renderInvoiceDocxPreview });
  if (docs.packingList) entries.push({ id: 'packing_list', abbr: 'P/L', name: '패킹리스트', build: () => buildPackingListDocx(docs.packingList!), render: renderPackingListDocxPreview });
  if (docs.transportRequest) entries.push({ id: 'transport_request', abbr: 'S/I', name: '수출 운송의뢰서', build: () => buildTransportRequestDocx(docs.transportRequest!), render: renderTransportRequestDocxPreview });
  if (docs.customsDeclaration) entries.push({ id: 'customs_dec', abbr: 'E/D', name: '수출신고서(초안)', build: () => buildExportDeclarationDocx(docs.customsDeclaration!), render: renderExportDeclarationDocxPreview });
  return entries.map((entry) => ({ ...entry, fileName: portaiFileName(entry.id, 'docx') }));
}

/** 카드 썸네일 — 실제 docx 첫 페이지를 그려 카드 폭에 맞게 줄인다(수입 포워더의 원본 첫 페이지 카드와 같은 모양). */
function DocThumbnail({ entry }: { entry: DocEntry }) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const blob = await entry.build();
        if (cancelled || !hostRef.current) return;
        await entry.render(blob, hostRef.current);
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [entry]);

  // 그려진 첫 페이지 폭에 맞춰 축소 비율을 정한다 — 카드 폭이 바뀌면 다시 맞춘다.
  useEffect(() => {
    const frame = frameRef.current;
    const host = hostRef.current;
    if (status !== 'ready' || !frame || !host) return;
    const fit = () => {
      const page = host.querySelector<HTMLElement>('section.docx-preview, section') ?? host;
      const pageWidth = page.offsetWidth || 794;
      host.style.setProperty('--thumb-scale', String(Math.min(1, (frame.clientWidth - 12) / pageWidth)));
      host.style.width = `${pageWidth}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [status]);

  return (
    <span className="fwd-shipper-doc-page" ref={frameRef}>
      <div className="fwd-shipper-doc-page-host" ref={hostRef} aria-hidden="true" hidden={status === 'error'} />
      {status !== 'ready' && (
        <span className="fwd-shipper-doc-placeholder">
          <FileText size={26} aria-hidden="true" />
          <span>{status === 'loading' ? '미리보기 불러오는 중…' : '눌러서 미리보기'}</span>
        </span>
      )}
    </span>
  );
}

/**
 * 수출 포워더 STEP 1 맨 위 — 화주가 제출한 서류를 먼저 보여 준다(수입 포워더 화면과 같은 카드 모양).
 * 카드를 누르면 화주 화면과 같은 docx 미리보기가 열리고, 거기서 같은 DOCX 파일을 내려받는다.
 */
export default function ShipperSubmittedDocs({ docs }: { docs: GeneratedDocuments | null | undefined }) {
  const entries = useMemo(() => shipperDocEntries(docs), [docs]);
  const [previewing, setPreviewing] = useState<DocEntry | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!previewing) return;
    let cancelled = false;
    (async () => {
      try {
        const blob = await previewing.build();
        if (cancelled || !hostRef.current) return;
        await previewing.render(blob, hostRef.current);
      } catch (err) {
        if (cancelled || !hostRef.current) return;
        hostRef.current.textContent = `미리보기를 만들지 못했습니다. (${describePreviewError(err)})`;
      }
    })();
    return () => { cancelled = true; };
  }, [previewing]);

  if (entries.length === 0) return null;

  const download = async (entry: DocEntry) => {
    if (busyId) return;
    setBusyId(entry.id);
    setError('');
    try {
      saveBlobAs(await entry.build(), entry.fileName);
    } catch (err) {
      setError(`${entry.name} 파일을 만들지 못했습니다. (${describePreviewError(err)})`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="fwd-export-shipper-docs fwd-export-content-card" aria-label="화주가 제출한 서류">
      <h3>화주가 제출한 서류 <span className="fwd-shipper-doc-count">{entries.length}</span></h3>
      <ul className={`fwd-shipper-doc-gallery${entries.length === 4 ? ' is-four' : ''}`}>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="fwd-shipper-doc-card"
              title={entry.name}
              aria-label={`${entry.name} 미리보기 열기`}
              onClick={() => setPreviewing(entry)}
            >
              <DocThumbnail entry={entry} />
              <span className="fwd-shipper-doc-card-foot">
                <span className="fwd-shipper-doc-abbr">{entry.abbr}</span>
                <Eye size={15} aria-hidden="true" />
              </span>
              <span className="fwd-shipper-doc-filename">{entry.fileName}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="form-message error">{error}</p>}

      {previewing && (
        <div className="fwd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewing(null); }}>
          <div className="fwd-modal fwd-shipper-doc-modal" role="dialog" aria-modal="true" aria-labelledby="shipper-doc-title">
            <div className="fwd-modal-head">
              <h2 id="shipper-doc-title">{previewing.name} 미리보기</h2>
              <button type="button" className="fwd-modal-close" aria-label="닫기" onClick={() => setPreviewing(null)}><X size={22} /></button>
            </div>
            <div className="fwd-shipper-doc-preview" ref={hostRef}>미리보기를 만드는 중입니다…</div>
            <div className="fwd-shipper-doc-foot">
              <button type="button" className="btn btn-primary" disabled={busyId !== null} onClick={() => void download(previewing)}>
                <Download size={16} aria-hidden="true" /> DOCX 다운로드
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
