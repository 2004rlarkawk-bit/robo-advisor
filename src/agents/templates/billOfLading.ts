import type { BillOfLadingData, NumericInput } from '../../types';
import { escapeHtml } from './escapeHtml';

const show = (value: unknown) => escapeHtml(value ?? '') || '&nbsp;';
const number = (value: NumericInput) => value === '' ? '' : Number(value).toLocaleString('en-US');

export function renderBillOfLadingHTML(data: BillOfLadingData): string {
  const generatedDate = data.generatedAt.slice(0, 10);
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
        .bl-title{text-align:center;font-size:25px;font-weight:800;letter-spacing:1.4px;margin-bottom:3px}.bl-draft{text-align:center;color:#b45309;font-size:11px;font-weight:800;margin-bottom:18px}
        .bl-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #334155}.bl-box{padding:9px 11px;min-height:72px;border-right:1px solid #64748b;border-bottom:1px solid #64748b;font-size:10px;line-height:1.55}.bl-box:nth-child(even){border-right:0}
        .bl-label{display:block;color:#475569;font-size:8px;font-weight:800;text-transform:uppercase;margin-bottom:3px}.bl-table{width:100%;border-collapse:collapse;font-size:9px;margin-top:12px}.bl-table th,.bl-table td{border:1px solid #64748b;padding:6px 4px;text-align:center;vertical-align:middle}.bl-table th{background:#eaf1f8}.bl-total td{font-weight:800;background:#f8fafc}
        .bl-note{margin-top:14px;border:1px solid #94a3b8;padding:10px;font-size:9px;line-height:1.55;color:#475569}
      </style>
      <div class="bl-title">BILL OF LADING</div>
      <div class="bl-draft">DRAFT — FOR REVIEW</div>
      <div style="display:flex;justify-content:flex-end;gap:22px;font-size:10px;margin-bottom:8px"><span><b>Draft No.</b> ${show(data.draftNo)}</span><span><b>Generated</b> ${show(generatedDate)}</span></div>
      <div class="bl-grid">
        <div class="bl-box"><span class="bl-label">Shipper</span><b>${show(data.shipper.name)}</b><br>${show(data.shipper.address)}</div>
        <div class="bl-box"><span class="bl-label">Consignee</span><b>${show(data.consignee.name)}</b><br>${show(data.consignee.address)}</div>
        <div class="bl-box"><span class="bl-label">Notify Party</span><b>${show(data.notifyParty?.name)}</b><br>${show(data.notifyParty?.address)}</div>
        <div class="bl-box"><span class="bl-label">Carrier / Booking No.</span>${show(data.carrier)}<br>${show(data.bookingNo)}</div>
        <div class="bl-box"><span class="bl-label">Vessel / Voyage</span><b>${show(data.vessel)}</b> / ${show(data.voyageNo)}<br>ETD: ${show(data.etd)} &nbsp; ETA: ${show(data.eta)}</div>
        <div class="bl-box"><span class="bl-label">Ports</span>POL: <b>${show(data.loadPort)}</b><br>POD: <b>${show(data.dischargePort)}</b><br>Mode: ${show(data.loadingMode)}</div>
      </div>
      <table class="bl-table"><thead><tr><th>No.</th><th>Marks &amp; Numbers</th><th>Description of Goods</th><th>No. &amp; Kind of Packages</th><th>Gross Weight (kg)</th><th>Measurement (CBM)</th></tr></thead><tbody>
        ${rows || '<tr><td colspan="6">No cargo item entered</td></tr>'}
        <tr class="bl-total"><td colspan="3">TOTAL</td><td>${show(number(totals.numberOfPackages))}</td><td>${show(number(totals.grossWeightKg))}</td><td>${show(totals.measurementCbm)}</td></tr>
      </tbody></table>
      <div class="bl-grid" style="margin-top:12px"><div class="bl-box"><span class="bl-label">Container No.</span>${show(data.containerNo)}</div><div class="bl-box"><span class="bl-label">Seal No.</span>${show(data.sealNo)}</div></div>
      <div class="bl-note">This draft Bill of Lading is generated from the forwarder's confirmed form data for review. Final issuance remains subject to the carrier's confirmation.</div>
    </div>`;
}
