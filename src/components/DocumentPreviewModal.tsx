import type { RefObject } from 'react';
import { Download } from 'lucide-react';
import type { CustomsDeclarationData } from '../types';
import { exportDeclarationFobNotice } from '../utils/exportDeclarationFob';

interface Props {
  previewDocId: string;
  htmlTemplates: Record<string, string>;
  customsDeclarationData: CustomsDeclarationData | null;
  /** docx를 그대로 렌더하는 서류별 미리보기 영역 */
  docxPreviewRef: RefObject<HTMLDivElement>;
  packingDocxPreviewRef: RefObject<HTMLDivElement>;
  trDocxPreviewRef: RefObject<HTMLDivElement>;
  blDocxPreviewRef: RefObject<HTMLDivElement>;
  customsDocxPreviewRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onDownload: (docId: string) => void;
}

/** 생성된 서류 미리보기 — 화면에 보이는 것과 내려받는 파일이 같은 소스다. */
export default function DocumentPreviewModal({
  previewDocId,
  htmlTemplates,
  customsDeclarationData,
  docxPreviewRef,
  packingDocxPreviewRef,
  trDocxPreviewRef,
  blDocxPreviewRef,
  customsDocxPreviewRef,
  onClose,
  onDownload,
}: Props) {
  return (
    <div className="preview-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div className="preview-modal-container" style={{
        backgroundColor: '#f8fafc',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
        width: '100%',
        maxWidth: '850px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        {/* Modal Header */}
        <div className="preview-modal-header" style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#ffffff'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#0f172a' }}>
            {(({
              invoice: '상업송장(Commercial Invoice)',
              packing_list: '패킹리스트(Packing List)',
              co: '원산지증명서(Certificate of Origin)',
              bl: '선하증권(B/L)',
              transport_request: '수출 운송의뢰서(Shipping Instruction, S/I)',
              customs_dec: '수출신고서(초안)',
              insurance: '적하보험증권(Insurance Policy)',
            } as Record<string, string>)[previewDocId] ?? '문서')} 미리보기
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#64748b',
              lineHeight: '1'
            }}
          >
            &times;
          </button>
        </div>

        {/* Modal Content - HTML container */}
        <div className="preview-modal-body" style={{
          padding: '24px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          backgroundColor: '#f1f5f9'
        }}>
          {previewDocId === 'invoice' ? (
            // 상업송장: 생성된 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
            <div ref={docxPreviewRef} style={{ width: '100%' }} />
          ) : previewDocId === 'packing_list' ? (
            // 패킹리스트: 생성된 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
            <div ref={packingDocxPreviewRef} style={{ width: '100%' }} />
          ) : previewDocId === 'transport_request' ? (
            // 운송의뢰서: 고정 서식 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
            <div ref={trDocxPreviewRef} style={{ width: '100%' }} />
          ) : previewDocId === 'bl' ? (
            // 선하증권: 무역협회 표준 서식 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
            <div ref={blDocxPreviewRef} style={{ width: '100%' }} />
          ) : previewDocId === 'customs_dec' ? (
            // 수출신고서(초안): 생성된 docx를 그대로 렌더 — 미리보기와 다운로드가 동일 바이너리
            <div style={{ width: '100%' }}>
              <div style={{
                marginBottom: '12px', padding: '10px 14px', borderRadius: '8px',
                background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412',
                fontSize: '13px', lineHeight: 1.5,
              }}>
                <b>초안 생성</b> — 세관 제출본이 아닙니다. 신고번호·세관기재란 등은 <b>신고 후 확정</b>되며, 실제 신고는 관세사 또는 UNI-PASS를 통해 진행하세요.
              </div>
              {customsDeclarationData && exportDeclarationFobNotice(customsDeclarationData.incoterms) && (
                // 신고가격(FOB) 숫자 칸은 비워 두고, 이유는 문서 위 주석으로만 알린다.
                <div role="note" style={{
                  marginBottom: '12px', padding: '10px 14px', borderRadius: '8px',
                  background: '#f8fafc', border: '1px solid #cbd5e1', color: '#334155',
                  fontSize: '13px', lineHeight: 1.5,
                }}>
                  <b>신고가격(FOB) 빈칸</b> — {customsDeclarationData.incoterms || 'Incoterms 미선택'} 조건: {exportDeclarationFobNotice(customsDeclarationData.incoterms)}
                </div>
              )}
              <div ref={customsDocxPreviewRef} style={{ width: '100%' }} />
            </div>
          ) : (
            <div
              style={{ transform: 'scale(1)', transformOrigin: 'top center', width: '100%' }}
              dangerouslySetInnerHTML={{ __html: htmlTemplates[previewDocId] || '<p>문서 양식이 생성되지 않았습니다.</p>' }}
            />
          )}
        </div>

        {/* Modal Footer */}
        <div className="preview-modal-footer" style={{
          padding: '16px 24px',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '12px',
          backgroundColor: '#ffffff'
        }}>
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
          >
            닫기
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onDownload(previewDocId)}
          >
            <Download size={16} />
            {(previewDocId === 'invoice' || previewDocId === 'packing_list' || previewDocId === 'customs_dec' || previewDocId === 'transport_request' || previewDocId === 'bl') ? 'DOCX 다운로드' : 'PDF 저장 (텍스트)'}
          </button>
        </div>
      </div>
    </div>
  );
}
