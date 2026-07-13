import type { PackingListData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 포장명세서 (Packing List)
 * 한국무역협회(KITA) 표준 서식 ①~⑯ 기준 — 상업송장과 동일 서식 계열.
 * 참고 양식: 포장명세서.docx
 */
export function renderPackingListHTML(data: PackingListData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '—') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#94a3b8;">${esc(fallback)}</span>` : esc(s);
  };
  const seller = data.seller || d.exporter || { name: '', address: '', contact: '' };
  const consignee = data.consignee || d.importer || { name: '', address: '', contact: '' };
  const marks = data.shippingMarks && String(data.shippingMarks).trim() !== '' && data.shippingMarks !== 'N/M'
    ? esc(data.shippingMarks) : '<span style="color:#94a3b8;">N/M</span>';

  const itemsHTML = data.items.map(item => {
    const it = item as Record<string, any>;
    const pkg = it.packageCount ? `${esc(String(it.packageCount))} ${esc(it.packageType || data.packageType || 'CARTONS')}`
      : (data.packageCount ? `${esc(String(data.packageCount))} ${esc(data.packageType || 'CARTONS')}` : fb(''));
    const hs = item.hsCode && item.hsCode !== 'N/A' ? `<br><span style="color:#94a3b8; font-size:11px;">HS ${esc(item.hsCode)}</span>` : '';
    return `
      <tr>
        <td style="border:1px solid #444; padding:9px 8px; text-align:center; color:#94a3b8;">${marks}</td>
        <td style="border:1px solid #444; padding:9px 8px;">${pkg}</td>
        <td style="border:1px solid #444; padding:9px 8px;"><strong>${esc(item.description)}</strong>${hs}</td>
        <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${esc((item.quantity ?? 0).toLocaleString())} ${esc(item.unit || 'EA')}<br><span style="color:#94a3b8;">N.W ${esc((item.netWeight ?? 0).toFixed(1))} KG</span></td>
        <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${esc((item.grossWeight ?? 0).toFixed(1))} KG</td>
        <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${fb(item.dimensions || data.measurement)}</td>
      </tr>`;
  }).join('');

  const originRef = d.countryOfOrigin || data.items?.[0]?.countryOfOrigin;
  const buyer = d.buyer?.name ? esc(d.buyer.name) : '<span style="color:#94a3b8;">SAME AS CONSIGNEE</span>';
  const sellerTax = d.sellerTaxNo || d.businessRegistrationNo || d.taxNo;

  return `
    <div style="font-family:'Malgun Gothic','Inter','Helvetica Neue',Arial,sans-serif; max-width:800px; margin:0 auto; padding:28px 32px 40px; background:#fff; color:#111;">
      <h1 style="text-align:center; font-size:22px; letter-spacing:3px; margin:0 0 4px; font-weight:700;">PACKING LIST</h1>
      <div style="text-align:center; font-size:10px; color:#555; letter-spacing:2px; margin-bottom:14px; text-transform:uppercase;">Korea International Trade Association Standard Form</div>

      <table style="border-collapse:collapse; width:100%; border:1px solid #222;">
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top; width:55%;" rowspan="2">
            <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">① Seller</div>
            <div style="font-size:12px; line-height:1.45;"><span style="font-weight:700; font-size:13px;">${esc(seller.name || '')}</span><br>
            ${fb(seller.address)}<br>
            ${seller.contact ? 'TEL: ' + esc(seller.contact) : ''}${sellerTax ? ' &nbsp; 사업자등록번호: ' + esc(sellerTax) : ''}</div>
          </td>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top; width:45%;">
            <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">⑦ Invoice No. and date</div>
            <div style="font-size:12px;"><span style="font-weight:700;">${esc(data.invoiceNo || d.invoiceRef || '')}</span> &nbsp; ${esc(data.date || '')}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;">
            <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">⑧ Buyer (if other than consignee)</div>
            <div style="font-size:12px;">${buyer}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;" rowspan="2">
            <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">② Consignee</div>
            <div style="font-size:12px; line-height:1.45;"><span style="font-weight:700; font-size:13px;">${esc(consignee.name || '')}</span><br>
            ${fb(consignee.address)}<br>
            ${consignee.contact ? 'TEL: ' + esc(consignee.contact) : ''}</div>
          </td>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;">
            <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">⑨ Other references</div>
            <div style="font-size:12px;">${originRef ? 'COUNTRY OF ORIGIN: ' + esc(originRef) : fb('')}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;">
            <div style="font-size:10px; color:#64748b; font-weight:700; margin-bottom:3px;">Remarks</div>
            <div style="font-size:12px;">${fb(d.remarks)}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:0;" colspan="2">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="border-right:1px solid #222; padding:6px 8px; width:25%; vertical-align:top;">
                  <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">③ Departure date</div>
                  <div style="font-size:12px;">${fb(d.departureDate)}</div>
                </td>
                <td style="border-right:1px solid #222; padding:6px 8px; width:25%; vertical-align:top;">
                  <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">④ Vessel / flight</div>
                  <div style="font-size:12px;">${fb(d.vessel || d.vesselOrFlight)}</div>
                </td>
                <td style="border-right:1px solid #222; padding:6px 8px; width:25%; vertical-align:top;">
                  <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">⑤ From</div>
                  <div style="font-size:12px;">${fb(d.loadPort)}</div>
                </td>
                <td style="padding:6px 8px; width:25%; vertical-align:top;">
                  <div style="font-size:10px; color:#0f766e; font-weight:700; margin-bottom:3px;">⑥ To</div>
                  <div style="font-size:12px;">${fb(d.dischargePort)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table style="border-collapse:collapse; width:100%; margin-top:-1px;">
        <thead>
          <tr style="background:#0f766e; color:#fff; font-size:11px;">
            <th style="border:1px solid #0f766e; padding:8px 6px; width:13%;">⑩ Shipping Marks</th>
            <th style="border:1px solid #0f766e; padding:8px 6px; width:17%;">⑪ No. &amp; kind of packages</th>
            <th style="border:1px solid #0f766e; padding:8px 6px; width:30%;">⑫ Goods description</th>
            <th style="border:1px solid #0f766e; padding:8px 6px; width:16%;">⑬ Quantity / Net weight</th>
            <th style="border:1px solid #0f766e; padding:8px 6px; width:12%;">⑭ Gross Weight</th>
            <th style="border:1px solid #0f766e; padding:8px 6px; width:12%;">⑮ Measurement</th>
          </tr>
        </thead>
        <tbody style="font-size:12px;">
          ${itemsHTML}
          <tr style="background:#f0fdfa; font-weight:700;">
            <td colspan="3" style="border:1px solid #444; padding:9px 8px; text-align:right;">TOTAL</td>
            <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${esc((data.totalPackages ?? 0).toLocaleString())} EA</td>
            <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${esc((data.totalGrossWeight ?? 0).toFixed(1))} KG</td>
            <td style="border:1px solid #444; padding:9px 8px; text-align:right; color:#0f766e;">${fb(data.measurement)}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:22px; display:flex; justify-content:flex-end;">
        <div style="width:290px;">
          <div style="font-size:11px; color:#0f766e; font-weight:700; margin-bottom:24px;">⑯ Signed by</div>
          <div style="border-bottom:1px solid #333; font-family:'Courier New',monospace; font-style:italic; font-size:15px; padding-bottom:4px; color:#333;">${esc(data.signedBy || seller.name || '')}</div>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0; margin-top:24px; padding-top:8px; text-align:center; font-size:9px; color:#aaa;">Generated by PortAI • Korea International Trade Association Standard Packing List</div>
    </div>
  `;
}
