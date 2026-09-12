import type { BillOfLadingData, NumericInput } from '../../types';
import { escapeHtml } from './escapeHtml';

const show = (value: unknown) => escapeHtml(value ?? '') || '&nbsp;';
const number = (value: NumericInput) => value === '' ? '' : Number(value).toLocaleString('en-US');

const ORIGINAL_WORD: Record<number, string> = {
  1: 'ONE (1)', 2: 'TWO (2)', 3: 'THREE (3)', 4: 'FOUR (4)', 5: 'FIVE (5)',
};

/**
 * 선하증권 본문 레이아웃 — 한국무역협회 선하증권 서식의 기재 순서를 따른다.
 * 법정 기재사항: 선박 명칭·화물 종류/중량/용적/포장 개수·송하인·수하인·
 * 선적항·양륙항·운임·발행일자·발행지·발행자.
 */
export function renderBillOfLadingHTML(data: BillOfLadingData): string {
  const isHouse = data.kind === 'house';
  const title = isHouse ? 'HOUSE BILL OF LADING' : 'BILL OF LADING';
  const koTitle = isHouse ? '하우스 선하증권 (복합운송증권)' : '선하증권';
  const documentNo = data.blNo || data.draftNo;
  const isDraft = !data.blNo;

  const onBoard = data.shippedOnBoardDate;
  const receiptType = onBoard ? 'SHIPPED ON BOARD' : 'RECEIVED FOR SHIPMENT';
  const originals = ORIGINAL_WORD[data.numberOfOriginals] ?? `${data.numberOfOriginals}`;
  const signerLabel = data.signerCapacity === 'AS_CARRIER' ? 'as Carrier' : 'as Agent for the Carrier';
  const freight = data.freightTerms || 'AS ARRANGED';

  const rows = data.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td>
      <td style="text-align:left">${show(item.marksAndNumbers)}</td>
      <td style="text-align:left">${show(item.descriptionOfGoods)}</td>
      <td>${show(number(item.numberOfPackages))}<br>${show(item.kindOfPackages)}</td>
      <td>${show(number(item.grossWeightKg))}</td>
      <td>${show(item.measurementCbm)}</td>
    </tr>`).join('');
  const totals = data.cargoTotals;

  return `
    <div style="width:820px;max-width:100%;margin:0 auto;background:#fff;color:#172033;font-family:Arial,'Noto Sans KR',sans-serif;padding:34px;box-sizing:border-box">
      <style>
        .bl-title{text-align:center;font-size:24px;font-weight:800;letter-spacing:1.2px;margin:0 0 3px}
        .bl-ko{text-align:center;font-size:13px;font-weight:700;color:#475569;margin-bottom:6px}
        .bl-draft{text-align:center;color:#b45309;font-size:11px;font-weight:800;margin-bottom:16px}
        .bl-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #334155}
        .bl-box{padding:9px 11px;min-height:70px;border-right:1px solid #64748b;border-bottom:1px solid #64748b;font-size:10px;line-height:1.55}
        .bl-box:nth-child(even){border-right:0}
        .bl-label{display:block;color:#475569;font-size:8px;font-weight:800;text-transform:uppercase;margin-bottom:3px}
        .bl-route{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #334155;border-top:0}
        .bl-route>div{padding:9px 11px;border-right:1px solid #64748b;font-size:10px;line-height:1.5}
        .bl-route>div:last-child{border-right:0}
        .bl-table{width:100%;border-collapse:collapse;font-size:9px;margin-top:12px}
        .bl-table th,.bl-table td{border:1px solid #64748b;padding:6px 4px;text-align:center;vertical-align:middle}
        .bl-table th{background:#eaf1f8}.bl-total td{font-weight:800;background:#f8fafc}
        .bl-foot{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #334155;border-top:0;margin-top:12px}
        .bl-foot>div{padding:9px 11px;border-right:1px solid #64748b;font-size:10px;line-height:1.5}
        .bl-foot>div:last-child{border-right:0}
        .bl-sign{margin-top:14px;border:1px solid #334155;padding:12px;font-size:10px;line-height:1.6}
        .bl-terms{margin-top:12px;font-size:8.5px;line-height:1.6;color:#475569;border-top:1px solid #cbd5e1;padding-top:9px}
      </style>

      <div class="bl-title">${title}</div>
      <div class="bl-ko">${koTitle}</div>
      ${isDraft ? '<div class="bl-draft">DRAFT — FOR REVIEW / 발행 전 검토용</div>' : ''}

      <div style="display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;margin-bottom:8px">
        <span><b>${isDraft ? 'Draft No.' : 'B/L No.'}</b> ${show(documentNo)}</span>
        <span><b>Booking No.</b> ${show(data.bookingNo)}</span>
      </div>

      <div class="bl-grid">
        <div class="bl-box"><span class="bl-label">Shipper / 송하인</span><b>${show(data.shipper.name)}</b><br>${show(data.shipper.address)}</div>
        <div class="bl-box"><span class="bl-label">Consignee / 수하인</span><b>${show(data.consignee.name)}</b><br>${show(data.consignee.address)}</div>
        <div class="bl-box"><span class="bl-label">Notify Party / 착화통지처</span><b>${show(data.notifyParty?.name)}</b><br>${show(data.notifyParty?.address)}</div>
        <div class="bl-box"><span class="bl-label">Carrier / 운송인</span>${show(data.carrier)}<br><span style="color:#64748b">Mode: ${show(data.loadingMode)}</span></div>
      </div>

      <div class="bl-route">
        <div><span class="bl-label">Place of Receipt</span><b>${show(data.placeOfReceipt)}</b></div>
        <div><span class="bl-label">Port of Loading / 선적항</span><b>${show(data.loadPort)}</b><br><span style="color:#64748b">ETD ${show(data.etd)}</span></div>
        <div><span class="bl-label">Port of Discharge / 양륙항</span><b>${show(data.dischargePort)}</b><br><span style="color:#64748b">ETA ${show(data.eta)}</span></div>
        <div><span class="bl-label">Place of Delivery</span><b>${show(data.placeOfDelivery)}</b></div>
      </div>

      <div class="bl-route" style="grid-template-columns:repeat(3,1fr)">
        <div><span class="bl-label">Vessel / Voyage No.</span><b>${show(data.vessel)}</b> / ${show(data.voyageNo)}</div>
        <div><span class="bl-label">Container No.</span>${show(data.containerNo)}</div>
        <div><span class="bl-label">Seal No.</span>${show(data.sealNo)}</div>
      </div>

      <table class="bl-table">
        <thead><tr><th>No.</th><th>Marks &amp; Numbers</th><th>Description of Goods</th><th>No. &amp; Kind of Packages</th><th>Gross Weight (kg)</th><th>Measurement (CBM)</th></tr></thead>
        <tbody>
          ${rows || '<tr><td colspan="6">No cargo item entered</td></tr>'}
          <tr class="bl-total"><td colspan="3">TOTAL</td><td>${show(number(totals.numberOfPackages))}</td><td>${show(number(totals.grossWeightKg))}</td><td>${show(totals.measurementCbm)}</td></tr>
        </tbody>
      </table>

      <div class="bl-foot">
        <div><span class="bl-label">Freight &amp; Charges / 운임</span><b>${show(freight)}</b><br>${show(data.freightAndCharges || 'AS ARRANGED')}</div>
        <div><span class="bl-label">No. of Original B/L / 발행 통수</span><b>${show(originals)}</b></div>
        <div><span class="bl-label">Receipt Type</span><b>${receiptType}</b>${onBoard ? `<br><span style="color:#64748b">Shipped on Board: ${show(onBoard)}</span>` : ''}</div>
      </div>

      <div class="bl-sign">
        <div style="display:flex;justify-content:space-between;gap:20px">
          <div>
            <span class="bl-label">Place and Date of Issue / 발행지 및 발행일자</span>
            <b>${show(data.placeOfIssue)}</b> &nbsp;·&nbsp; ${show(data.dateOfIssue)}
          </div>
          <div style="text-align:right">
            <span class="bl-label">Signed for the Carrier / 발행자</span>
            <b>${show(data.issuerName)}</b><br>
            <span style="color:#475569">${signerLabel}</span>
          </div>
        </div>
      </div>

      <div class="bl-terms">
        In witness whereof, ${show(originals)} original Bills of Lading have been signed, one of which being accomplished, the others to stand void.
        Carriage hereunder is subject to the terms and conditions on the reverse side hereof.
        <br><span style="color:#64748b">본 증권의 운송은 이면약관(복합운송선하증권 표준약관)에 따릅니다. 원본 ${show(originals)}통 중 1통이 사용되면 나머지는 무효가 됩니다.</span>
        ${isDraft ? '<br><b style="color:#b45309">본 문서는 발행 전 검토용 초안이며, 정식 발행 시 B/L 번호와 서명이 부여됩니다.</b>' : ''}
      </div>
    </div>`;
}
