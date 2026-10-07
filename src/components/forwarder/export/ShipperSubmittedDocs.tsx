import { useEffect, useRef, useState } from 'react';
import { Download, Eye, X } from 'lucide-react';
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
  build: () => Promise<Blob>;
  render: (blob: Blob, host: HTMLElement) => Promise<void>;
}

/** 화주가 PortAI로 만들어 의뢰와 함께 보낸 서류 — 있는 것만, 화주 화면과 같은 순서로. */
function shipperDocEntries(docs: GeneratedDocuments | null | undefined): DocEntry[] {
  if (!docs) return [];
  const entries: DocEntry[] = [];
  if (docs.invoice) entries.push({ id: 'invoice', abbr: 'C/I', name: '상업송장', build: () => buildInvoiceDocx(docs.invoice!), render: renderInvoiceDocxPreview });
  if (docs.packingList) entries.push({ id: 'packing_list', abbr: 'P/L', name: '패킹리스트', build: () => buildPackingListDocx(docs.packingList!), render: renderPackingListDocxPreview });
  if (docs.transportRequest) entries.push({ id: 'transport_request', abbr: 'S/I', name: '수출 운송의뢰서', build: () => buildTransportRequestDocx(docs.transportRequest!), render: renderTransportRequestDocxPreview });
  if (docs.customsDeclaration) entries.push({ id: 'customs_dec', abbr: 'E/D', name: '수출신고서(초안)', build: () => buildExportDeclarationDocx(docs.customsDeclaration!), render: renderExportDeclarationDocxPreview });
  return entries;
}

/**
 * 수출 포워더 STEP 1 맨 위 — 화주가 제출한 서류를 먼저 보여 준다(수입 포워더 화면과 같은 순서).
 * 보기는 화주 화면과 같은 docx 미리보기, 다운로드는 같은 DOCX 파일이다.
 */
export default function ShipperSubmittedDocs({ docs }: { docs: GeneratedDocuments | null | undefined }) {
  const entries = shipperDocEntries(docs);
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
      saveBlobAs(await entry.build(), portaiFileName(entry.id, 'docx'));
    } catch (err) {
      setError(`${entry.name} 파일을 만들지 못했습니다. (${describePreviewError(err)})`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="fwd-export-shipper-docs fwd-export-content-card" aria-label="화주 제출 서류">
      <h3>화주 제출 서류 <span>{entries.length}건</span></h3>
      <ul className="fwd-shipper-doc-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <span className="fwd-shipper-doc-abbr">{entry.abbr}</span>
            <strong>{entry.name}</strong>
            <span className="fwd-shipper-doc-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPreviewing(entry)}>
                <Eye size={15} aria-hidden="true" /> 보기
              </button>
              <button type="button" className="btn btn-secondary btn-sm" aria-label={`${entry.name} DOCX 다운로드`} disabled={busyId !== null} onClick={() => void download(entry)}>
                <Download size={15} aria-hidden="true" />
              </button>
            </span>
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
