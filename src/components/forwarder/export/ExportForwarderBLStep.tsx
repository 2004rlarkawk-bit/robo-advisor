import { useState } from 'react';
import { ArrowRight, Download, Eye, FileSignature, RefreshCw } from 'lucide-react';
import type { BillOfLadingData, BillOfLadingKind, BillOfLadingSignerCapacity, FreightTerms, NumericInput } from '../../../types';
import { deriveFreightTerms, isFreightTermsUnusual, FREIGHT_TERMS_LABEL } from '../../../utils/freightTerms';
import type { ForwarderFormState } from '../../../utils/forwarderForm';
import type { TradeAttachment } from '../../../types/tradeFormData';
import type { ExportBookingDetails } from '../../../types/exportForwarderCase';
import ForwarderDocumentSlot from './ForwarderDocumentSlot';

interface Props {
  state: ForwarderFormState;
  patch: (values: Partial<ForwarderFormState>) => void;
  userId: string;
  scopeId: string;
  attachments: TradeAttachment[];
  onAttachmentsChange: (attachments: TradeAttachment[]) => void;
  /** 2단계에서 등록한 부킹 확정 정보 — 참고 표기·빈 칸 채우기에만 쓴다 */
  booking: ExportBookingDetails;
  readOnly: boolean;
  busy: boolean;
  masterBlNo: string;
  onSaveMasterBl: (value: string) => void;
  /** 생성된 House B/L — forwarderBillOfLadingService.createForwarderBillOfLadingDraft()의 결과. */
  billOfLadingData: BillOfLadingData | null;
  generationError: string;
  onGenerateHouseBillOfLading: () => void;
  onViewHouseBillOfLading: () => void;
  onDownloadHouseBillOfLading: () => void;
  onNext: () => void;
}

function numericValue(value: string): NumericInput {
  return value === '' ? '' : Number(value);
}

/** STEP 4 — B/L 관리. Master B/L(선사 발행, 등록만)과 House B/L(PortAI 자동생성)을 분리해 다룬다. */
export default function ExportForwarderBLStep({
  state,
  patch,
  userId,
  scopeId,
  attachments,
  onAttachmentsChange,
  booking,
  readOnly,
  busy,
  masterBlNo,
  onSaveMasterBl,
  billOfLadingData,
  generationError,
  onGenerateHouseBillOfLading,
  onViewHouseBillOfLading,
  onDownloadHouseBillOfLading,
  onNext,
}: Props) {
  const [mblDraft, setMblDraft] = useState(masterBlNo);
  const suggestedFreightTerms = deriveFreightTerms(state.incoterms ?? '');
  const freightTermsUnusual = isFreightTermsUnusual(state.incoterms ?? '', state.freightTerms);
  const hasBillOfLading = Boolean(billOfLadingData);
  const billOfLadingReady = hasBillOfLading && !generationError;
  const houseBillOfLadingNo = billOfLadingData?.blNo?.trim() || billOfLadingData?.draftNo || '';
  // 2단계 부킹 값과 H/B/L 입력값이 다를 때만 알려준다. 자동으로 덮어쓰지 않는다.
  const bookingFreightTerms = booking.freightTerms ?? '';
  const freightTermsDiffersFromBooking = Boolean(bookingFreightTerms && state.freightTerms && bookingFreightTerms !== state.freightTerms);

  return (
    <div className="form-card forwarder-workspace-form fwd-export-stage">
      <div className="trade-section-header fwd-export-step-heading">
        <div>
          <span className="fwd-section-kicker">04 · 선적 서류</span>
          <h2 className="card-title">B/L 관리</h2>
        </div>
      </div>

      <details className="form-section fwd-export-bl-card is-master" open>
        <summary className="form-section-summary">Master B/L</summary>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label" htmlFor="mbl-no">M/B/L No.</label>
            <input id="mbl-no" className="form-input" disabled={readOnly} value={mblDraft} onChange={(e) => setMblDraft(e.target.value)} onBlur={() => { if (mblDraft !== masterBlNo) onSaveMasterBl(mblDraft); }} />
          </div>
          <div className="form-group"><label className="form-label">Carrier</label><input className="form-input" value={state.carrier} disabled readOnly /></div>
          <div className="form-group"><label className="form-label">Vessel / Voyage</label><input className="form-input" value={[state.vesselOrFlight, state.voyageNo].filter(Boolean).join(' / ')} disabled readOnly /></div>
          <div className="form-group"><label className="form-label">POL / POD</label><input className="form-input" value={[state.loadPort, state.dischargePort].filter(Boolean).join(' → ')} disabled readOnly /></div>
        </div>
        <ForwarderDocumentSlot
          label=""
          documentType="bill_of_lading"
          userId={userId}
          scopeId={scopeId}
          attachments={attachments}
          onAttachmentsChange={onAttachmentsChange}
          readOnly={readOnly}
        />
      </details>

      <details className="form-section fwd-export-bl-card is-house" open>
        <summary className="form-section-summary">House B/L</summary>

        <div className="form-grid">
          <div className="form-group"><label className="form-label">Booking No.</label><input className="form-input" value={state.bookingNo || '미등록'} disabled readOnly /></div>
          <div className="form-group"><label className="form-label">ETD</label><input className="form-input" value={state.departureDate || '미입력'} disabled readOnly /></div>
          <div className="form-group"><label className="form-label">컨테이너</label><input className="form-input" value={state.loadingMode === 'FCL' ? [state.containerSize, state.containerQuantity !== '' ? `${state.containerQuantity}개` : ''].filter(Boolean).join(' · ') : state.loadingMode || '미정'} disabled readOnly /></div>
        </div>

        {!readOnly && (
          <fieldset className="workspace-readonly-fieldset" disabled={readOnly}>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="bl-kind">증권 종류</label>
                <select id="bl-kind" className="form-input" value={state.blKind} onChange={(e) => patch({ blKind: e.target.value as BillOfLadingKind })}>
                  <option value="house">House B/L (포워더 → 화주 발행)</option>
                  <option value="master">Master B/L (선사 → 포워더 발행)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="bl-no">B/L 번호 (선택)</label><input id="bl-no" className="form-input" value={state.blNo} onChange={(e) => patch({ blNo: e.target.value })} placeholder="비우면 초안 번호로 표기" /></div>
              <div className="form-group"><label className="form-label" htmlFor="bl-receipt">화물 인수지 (Place of Receipt)</label><input id="bl-receipt" className="form-input" value={state.placeOfReceipt} onChange={(e) => patch({ placeOfReceipt: e.target.value })} placeholder="비우면 선적항과 동일" /></div>
              <div className="form-group"><label className="form-label" htmlFor="bl-delivery">화물 인도지 (Place of Delivery)</label><input id="bl-delivery" className="form-input" value={state.placeOfDelivery} onChange={(e) => patch({ placeOfDelivery: e.target.value })} placeholder="비우면 도착항과 동일" /></div>
              <div className="form-group">
                <label className="form-label" htmlFor="bl-freight">운임 지급조건 (Freight)</label>
                <select id="bl-freight" className="form-input" value={state.freightTerms} onChange={(e) => patch({ freightTerms: e.target.value as FreightTerms })}>
                  <option value="">선택하세요</option>
                  <option value="PREPAID">{FREIGHT_TERMS_LABEL.PREPAID}</option>
                  <option value="COLLECT">{FREIGHT_TERMS_LABEL.COLLECT}</option>
                </select>
                {freightTermsDiffersFromBooking && (
                  <small className="form-help" role="status">
                    2단계 부킹에는 {FREIGHT_TERMS_LABEL[bookingFreightTerms as 'PREPAID' | 'COLLECT']}로 등록되어 있습니다. 여기 입력한 값이 H/B/L에 쓰입니다.
                  </small>
                )}
                {freightTermsUnusual && (
                  <small className="form-help form-help-error" role="alert">
                    {state.incoterms} 조건은 통상 {suggestedFreightTerms}입니다. 화주와 합의된 값인지 확인하세요.
                  </small>
                )}
              </div>
              <div className="form-group"><label className="form-label" htmlFor="bl-charges">운임·부대비용 명세 (선택)</label><input id="bl-charges" className="form-input" value={state.freightAndCharges} onChange={(e) => patch({ freightAndCharges: e.target.value })} placeholder="비우면 AS ARRANGED로 표기" /></div>
              <div className="form-group"><label className="form-label" htmlFor="bl-originals">원본 발행 통수</label><input id="bl-originals" type="number" min="1" max="5" className="form-input" value={state.numberOfOriginals} onChange={(e) => patch({ numberOfOriginals: numericValue(e.target.value) })} /></div>
              <div className="form-group"><label className="form-label" htmlFor="bl-onboard">본선 적재일 (Shipped on Board)</label><input id="bl-onboard" type="date" className="form-input" value={state.shippedOnBoardDate} onChange={(e) => patch({ shippedOnBoardDate: e.target.value })} /><small className="form-help">비우면 수취선하증권(Received B/L)으로 발행됩니다.</small></div>
              <div className="form-group"><label className="form-label" htmlFor="bl-issuer">발행자 상호</label><input id="bl-issuer" className="form-input" value={state.issuerName} onChange={(e) => patch({ issuerName: e.target.value })} placeholder="포워더 상호" /></div>
              <div className="form-group">
                <label className="form-label" htmlFor="bl-capacity">발행 자격</label>
                <select id="bl-capacity" className="form-input" value={state.signerCapacity} onChange={(e) => patch({ signerCapacity: e.target.value as BillOfLadingSignerCapacity })}>
                  <option value="AS_CARRIER">as Carrier (운송인 자격 — House B/L 통상)</option>
                  <option value="AS_AGENT_FOR_CARRIER">as Agent for the Carrier (선사 대리인 자격)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label" htmlFor="bl-place">발행지 (Place of Issue)</label><input id="bl-place" className="form-input" value={state.placeOfIssue} onChange={(e) => patch({ placeOfIssue: e.target.value })} placeholder="Seoul, Korea" /></div>
              <div className="form-group"><label className="form-label" htmlFor="bl-date">발행일자 (Date of Issue)</label><input id="bl-date" type="date" className="form-input" value={state.dateOfIssue} onChange={(e) => patch({ dateOfIssue: e.target.value })} /></div>
            </div>

            <details className="form-section" data-form-section="6" style={{ marginTop: 14 }}>
              <summary className="form-section-summary">운임·기타 기재란</summary>
              <div className="form-grid">
                <div className="form-group"><label className="form-label" htmlFor="bl-precarriage">Pre-Carriage by</label><input id="bl-precarriage" className="form-input" value={state.preCarriageBy} onChange={(e) => patch({ preCarriageBy: e.target.value })} placeholder="TRUCK, RAIL 등" /></div>
                <div className="form-group"><label className="form-label" htmlFor="bl-final">최종 목적지 (Final Destination)</label><input id="bl-final" className="form-input" value={state.finalDestination} onChange={(e) => patch({ finalDestination: e.target.value })} placeholder="비우면 인도지와 동일" /></div>
                <div className="form-group"><label className="form-label" htmlFor="bl-flag">선박 국적 (Flag)</label><input id="bl-flag" className="form-input" value={state.flag} onChange={(e) => patch({ flag: e.target.value })} placeholder="PANAMA 등" /></div>
                <div className="form-group"><label className="form-label" htmlFor="bl-revenue">Revenue tons</label><input id="bl-revenue" className="form-input" value={state.revenueTons} onChange={(e) => patch({ revenueTons: e.target.value })} placeholder="운임 산정 톤수" /></div>
                <div className="form-group"><label className="form-label" htmlFor="bl-rate">Rate (운임 요율)</label><input id="bl-rate" className="form-input" value={state.freightRate} onChange={(e) => patch({ freightRate: e.target.value })} placeholder="USD 85.00" /></div>
                <div className="form-group"><label className="form-label" htmlFor="bl-per">Per (요율 단위)</label><input id="bl-per" className="form-input" value={state.freightPer} onChange={(e) => patch({ freightPer: e.target.value })} placeholder="CBM, R/T 등" /></div>
                {state.freightTerms === 'PREPAID' && (
                  <>
                    <div className="form-group"><label className="form-label" htmlFor="bl-prepaid-at">Freight prepaid at (선불 지급지)</label><input id="bl-prepaid-at" className="form-input" value={state.freightPrepaidAt} onChange={(e) => patch({ freightPrepaidAt: e.target.value })} /></div>
                    <div className="form-group"><label className="form-label" htmlFor="bl-total-prepaid">Total prepaid in (선불 총액)</label><input id="bl-total-prepaid" className="form-input" value={state.totalPrepaid} onChange={(e) => patch({ totalPrepaid: e.target.value })} /></div>
                  </>
                )}
                {state.freightTerms === 'COLLECT' && (
                  <>
                    <div className="form-group"><label className="form-label" htmlFor="bl-payable-at">Freight payable at (후불 지급지)</label><input id="bl-payable-at" className="form-input" value={state.freightPayableAt} onChange={(e) => patch({ freightPayableAt: e.target.value })} /></div>
                    <div className="form-group"><label className="form-label" htmlFor="bl-collect">Collect 금액</label><input id="bl-collect" className="form-input" value={state.collectAmount} onChange={(e) => patch({ collectAmount: e.target.value })} /></div>
                  </>
                )}
              </div>
            </details>
          </fieldset>
        )}

        <div className={`forwarder-generated-document-card ${billOfLadingReady ? 'is-complete' : generationError ? 'is-failed' : 'is-pending'}`} style={{ marginTop: 14 }}>
          <div className="forwarder-generated-document-summary">
            <div className="forwarder-generated-document-icon" aria-hidden="true">B/L</div>
            <div>
              <strong>House 선하증권 (H/B/L)</strong>
              <span className={`forwarder-generated-document-status ${billOfLadingReady ? 'is-complete' : 'is-failed'}`}>
                {billOfLadingReady ? '생성 완료' : generationError ? '생성 실패' : '생성 대기'}
              </span>
              {billOfLadingReady ? (
                <p role="status" className="forwarder-generated-document-meta">H/B/L No. {houseBillOfLadingNo}</p>
              ) : (
                <p role={generationError ? 'alert' : 'status'}>
                  {generationError || '생성된 H/B/L이 없습니다.'}
                </p>
              )}
            </div>
          </div>
          {billOfLadingReady ? (
            <div className="forwarder-bl-document-actions">
              <button type="button" className="btn btn-secondary" onClick={onViewHouseBillOfLading}><Eye size={16} /> 보기</button>
              <button type="button" className="btn btn-secondary" onClick={onDownloadHouseBillOfLading}><Download size={16} /> 다운로드</button>
              {!readOnly && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={onGenerateHouseBillOfLading}><RefreshCw size={16} /> 재생성</button>
              )}
            </div>
          ) : !readOnly ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={onGenerateHouseBillOfLading}><FileSignature size={16} /> H/B/L 생성</button>
          ) : null}
        </div>
      </details>

      {!readOnly && (
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onNext}>
            다음: 선적 완료 <ArrowRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
