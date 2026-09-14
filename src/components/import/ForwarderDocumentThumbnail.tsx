import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import type { ImportDocumentMeta } from '../../types/importTrade';
import { loadTradeAttachmentFile } from '../../services/tradeAttachmentStorageService';

/** Render only the submitted file, never simulated document contents. */
export default function ForwarderDocumentThumbnail({ document: doc, userId }: { document: ImportDocumentMeta; userId: string }) {
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('미리보기 불러오는 중…');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    let destroyPdf: (() => void) | undefined;
    setPreview('');
    setMessage('미리보기 불러오는 중…');
    const load = async () => {
      try {
        if (!doc.storageBucket || !doc.storagePath) throw new Error('Missing attachment');
        // Do not download large or unsupported files just to draw a small card.
        if (doc.size > 20 * 1024 * 1024) {
          setMessage('큰 파일 · 원본으로 확인');
          return;
        }
        if (!/application\/pdf|image\/(png|jpeg|webp|gif|avif)/i.test(doc.mimeType) && !/\.(pdf|png|jpe?g|webp|gif|avif)$/i.test(doc.name)) {
          setMessage('원본에서 미리보기');
          return;
        }
        const file = await loadTradeAttachmentFile({
          storageBucket: doc.storageBucket, storagePath: doc.storagePath,
          fileName: doc.name, mimeType: doc.mimeType,
          documentType: doc.type === 'unknown' ? 'other' : doc.type,
        }, userId);
        if (!active) return;
        if (file.size > 20 * 1024 * 1024) {
          setMessage('큰 파일 · 원본으로 확인');
          return;
        }
        if (/^image\/(png|jpeg|webp|gif|avif)$/i.test(file.type)) {
          objectUrl = URL.createObjectURL(file);
          setPreview(objectUrl);
          return;
        }
        const data = new Uint8Array(await file.arrayBuffer());
        // Validate the file signature; never embed HTML or an arbitrary active document.
        if (String.fromCharCode(...data.slice(0, 5)) !== '%PDF-') {
          setMessage('원본에서 미리보기');
          return;
        }
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const task = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true });
        destroyPdf = () => { void task.destroy().catch(() => undefined); };
        // Password-protected files fall back to the original, without a hidden prompt.
        task.onPassword = () => { if (active) setMessage('암호화된 서류 · 원본 확인'); destroyPdf?.(); };
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        if (!active) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(560 / original.width, 760 / original.height) });
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport }).promise;
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!active || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
        destroyPdf();
        destroyPdf = undefined;
      } catch {
        if (active) setMessage('미리보기 불가 · 원본 확인');
        destroyPdf?.();
      }
    };
    void load();
    return () => { active = false; destroyPdf?.(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc.id, doc.name, doc.size, doc.mimeType, doc.type, doc.storageBucket, doc.storagePath, doc.uploadedAt, userId]);

  return <span className="fwd-doc-page fwd-doc-page--original">
    {preview ? <img src={preview} alt={`${doc.name} 첫 페이지 미리보기`} onError={() => { setPreview(''); setMessage('미리보기 불가 · 원본 확인'); }} />
      : <span className="fwd-doc-preview-placeholder"><FileText size={28} aria-hidden="true" /><span>{message}</span></span>}
  </span>;
}
