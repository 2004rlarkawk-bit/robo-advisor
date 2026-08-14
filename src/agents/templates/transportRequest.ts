import type { TransportRequestData } from '../../types';
import { escapeHtml } from './escapeHtml';

const esc = (value: unknown) => escapeHtml(value ?? '');
const show = (value: unknown) => esc(value) || '&nbsp;';
const number = (value: number) => Number.isFinite(value) && value > 0 ? value.toLocaleString('en-US') : '';

export function renderTransportRequestHTML(data: TransportRequestData): string {
  const itemRows = data.items.map((item, index) => `
    <tr>
      <td>${index + 1}</td><td style="text-align:left">${show(item.description)}</td>
      <td>${show(item.hsCode)}</td><td>${show(number(item.quantity))}</td><td>${show(item.unit)}</td>
      <td>${show(number(item.packageCount))}</td><td>${show(item.packageType)}</td>
      <td>${show(number(item.netWeight))}</td><td>${show(number(item.grossWeight))}</td><td>${show(item.measurement)}</td>
    </tr>`).join('');
  const notify = data.notifyParty;
  const loadingMode = data.loadingMode || 'TBD';

  return `
    <div style="width:820px;max-width:100%;margin:0 auto;background:#fff;color:#172033;font-family:Arial,'Noto Sans KR',sans-serif;padding:36px;box-sizing:border-box">
      <style>
        .tr-title{text-align:center;font-size:25px;font-weight:800;letter-spacing:1px;margin:0 0 4px}.tr-ko{text-align:center;font-size:14px;font-weight:700;color:#475569;margin-bottom:22px}
        .tr-meta{display:flex;justify-content:flex-end;gap:24px;font-size:11px;margin-bottom:10px}.tr-box{border:1px solid #334155;padding:10px 12px;min-height:76px;line-height:1.55;font-size:11px}
        .tr-label{display:block;color:#475569;font-size:9px;font-weight:700;text-transform:uppercase;margin-bottom:3px}.tr-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
        .tr-table{width:100%;border-collapse:collapse;font-size:9px;margin:12px 0}.tr-table th,.tr-table td{border:1px solid #64748b;padding:6px 4px;text-align:center;vertical-align:middle}.tr-table th{background:#eaf1f8;font-weight:700}
        .tr-request{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #334155;margin-top:12px}.tr-request>div{padding:9px;border-right:1px solid #94a3b8;font-size:11px}.tr-request>div:last-child{border-right:0}
      </style>
      <div class="tr-title">EXPORT TRANSPORT REQUEST</div><div class="tr-ko">수출 운송의뢰서</div>
      <div class="tr-meta"><span><b>Request No.</b> ${show(data.requestNo)}</span><span><b>Date</b> ${show(data.requestDate)}</span></div>
      <div class="tr-grid">
        <div class="tr-box"><span class="tr-label">Exporter / Requester</span><b>${show(data.exporter.name)}</b><br>${show(data.exporter.address)}<br>Contact: ${show(data.requesterName || data.exporter.contact)}<br>Tel/E-mail: ${show(data.exporter.contact)}<br>Business No.: ${show(data.businessRegistrationNo)}</div>
        <div class="tr-box"><span class="tr-label">Consignee</span><b>${show(data.consignee.name)}</b><br>${show(data.consignee.address)}<br>${show(data.consignee.contact)}</div>
        ${notify ? `<div class="tr-box" style="grid-column:1/-1"><span class="tr-label">Notify Party</span><b>${show(notify.name)}</b><br>${show(notify.address)}<br>${show(notify.contact)}</div>` : ''}
      </div>
      <table class="tr-table"><thead><tr><th>No.</th><th>Goods Description</th><th>HS Code</th><th>Qty</th><th>Unit</th><th>Pkg Qty</th><th>Package Type</th><th>N/W (kg)</th><th>G/W (kg)</th><th>CBM</th></tr></thead><tbody>${itemRows || '<tr><td colspan="10">No cargo item entered</td></tr>'}</tbody></table>
      <div class="tr-grid">
        <div class="tr-box"><span class="tr-label">Trade Terms</span>Incoterms: <b>${show(data.incoterms)}</b><br>Named Place: ${show(data.incotermsPlace)}<br>Payment Terms: ${show(data.paymentTerms)}<br>Invoice No.: ${show(data.invoiceNo)}</div>
        <div class="tr-box"><span class="tr-label">Transport Request</span>POL: <b>${show(data.loadPort)}</b><br>POD: <b>${show(data.dischargePort)}</b><br>Requested Departure: ${show(data.requestedDepartureDate)}<br>Loading Mode: <b>${show(loadingMode)}</b></div>
      </div>
      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #94a3b8;text-align:center;font-size:11px;line-height:1.6">We request ocean transportation and shipment arrangements for the cargo described above.<br><span style="color:#64748b">상기 화물에 대한 해상운송 및 선적 업무를 의뢰합니다.</span></div>
      <div style="margin-top:10px;text-align:center;font-size:9px;color:#94a3b8">Business transport request draft — booking and B/L particulars are to be confirmed by the forwarder.</div>
    </div>`;
}
