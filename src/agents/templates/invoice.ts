import type { InvoiceData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 상업송장 (Commercial Invoice)
 * 한국무역협회(KITA) 표준 서식 ①~⑱ 기준.
 * 참고 양식: 무역협회_상업송장_commercial invoice.docx
 */
export function renderInvoiceHTML(data: InvoiceData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '—') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#94a3b8;">${esc(fallback)}</span>` : esc(s);
  };
  const cur = esc(data.currency || 'USD');
  const marks = d.shippingMarks && String(d.shippingMarks).trim() !== '' ? esc(d.shippingMarks) : '<span style="color:#94a3b8;">N/M</span>';

  const itemsHTML = data.items.map(item => {
    const it = item as Record<string, any>;
    const pkg = it.packageCount ? `${esc(String(it.packageCount))} ${esc(it.packageType || d.packageType || 'CARTONS')}` : fb(d.packageCount ? `${d.packageCount} ${d.packageType || 'CARTONS'}` : '');
    const hs = item.hsCode ? `<br><span style="color:#94a3b8; font-size:11px;">HS ${esc(item.hsCode)}</span>` : '';
    return `
      <tr>
        <td style="border:1px solid #444; padding:9px 8px; text-align:center; color:#94a3b8;">${marks}</td>
        <td style="border:1px solid #444; padding:9px 8px;">${pkg}</td>
        <td style="border:1px solid #444; padding:9px 8px;"><strong>${esc(item.description)}</strong>${hs}</td>
        <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${esc((item.quantity ?? 0).toLocaleString())} ${esc(item.unit || '')}</td>
        <td style="border:1px solid #444; padding:9px 8px; text-align:right;">${cur} ${esc((item.unitPrice ?? 0).toFixed(2))}</td>
        <td style="border:1px solid #444; padding:9px 8px; text-align:right; font-weight:700;">${cur} ${esc((item.amount ?? 0).toFixed(2))}</td>
      </tr>`;
  }).join('');

  const originRef = d.countryOfOrigin || data.items?.[0]?.countryOfOrigin;
  const buyerAddress = String(d.buyer?.address || '').trim();
  const buyerCountry = String(d.buyer?.country || '').trim();
  const buyer = d.buyer?.name
    ? [
        d.buyer.name,
        buyerAddress,
        buyerCountry && !buyerAddress.toLowerCase().includes(buyerCountry.toLowerCase()) ? buyerCountry : '',
      ].filter(Boolean).map((value) => esc(value)).join('<br>')
    : '<span style="color:#94a3b8;">SAME AS CONSIGNEE</span>';
  const sellerTax = d.sellerTaxNo || d.businessRegistrationNo || d.taxNo;

  return `
    <div style="font-family:'Malgun Gothic','Inter','Helvetica Neue',Arial,sans-serif; max-width:800px; margin:0 auto; padding:28px 32px 40px; background:#fff; color:#111;">
      <h1 style="text-align:center; font-size:22px; letter-spacing:3px; margin:0 0 4px; font-weight:700;">COMMERCIAL INVOICE</h1>
      <div style="text-align:center; font-size:10px; color:#555; letter-spacing:2px; margin-bottom:14px; text-transform:uppercase;">Korea International Trade Association Standard Form</div>

      <table style="border-collapse:collapse; width:100%; border:1px solid #222;">
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top; width:55%;" rowspan="2">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">① Shipper / Seller</div>
            <div style="font-size:12px; line-height:1.45;"><span style="font-weight:700; font-size:13px;">${esc(data.seller?.name || '')}</span><br>
            ${fb(data.seller?.address)}<br>
            ${data.seller?.contact ? 'TEL: ' + esc(data.seller.contact) : ''}${sellerTax ? ' &nbsp; 사업자등록번호: ' + esc(sellerTax) : ''}</div>
          </td>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top; width:45%;">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑦ Invoice No. and date</div>
            <div style="font-size:12px;"><span style="font-weight:700;">${esc(data.invoiceNo || '')}</span> &nbsp; ${esc(data.invoiceDate || d.date || '')}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑧ L/C No. and date</div>
            <div style="font-size:12px;">${fb(d.lcNo)}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;" rowspan="2">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">② Consignee (or For account &amp; risk of Messrs)</div>
            <div style="font-size:12px; line-height:1.45;"><span style="font-weight:700; font-size:13px;">${esc(data.consignee?.name || '')}</span><br>
            ${fb(data.consignee?.address)}<br>
            ${data.consignee?.contact ? 'TEL: ' + esc(data.consignee.contact) : ''}</div>
          </td>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑨ Buyer (if other than consignee)</div>
            <div style="font-size:12px;">${buyer}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑩ Other references</div>
            <div style="font-size:12px;">${originRef ? 'COUNTRY OF ORIGIN: ' + esc(originRef) : fb('')}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:0;">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="border-right:1px solid #222; padding:6px 8px; width:50%; vertical-align:top;">
                  <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">③ Departure date</div>
                  <div style="font-size:12px;">${fb(data.departureDate)}</div>
                </td>
                <td style="padding:6px 8px; width:50%; vertical-align:top;">
                  <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">④ Vessel / flight</div>
                  <div style="font-size:12px;">${fb(d.vessel || d.vesselOrFlight)}</div>
                </td>
              </tr>
            </table>
          </td>
          <td style="border:1px solid #222; padding:6px 8px; vertical-align:top;" rowspan="2">
            <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑪ Terms of delivery and payment</div>
            <div style="font-size:12px; line-height:1.5;"><span style="font-weight:700;">${esc(data.incoterms || '')} ${esc(data.loadPort || '')}</span><br>${fb(data.paymentTerms)}</div>
          </td>
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:0;">
            <table style="width:100%; border-collapse:collapse;">
              <tr>
                <td style="border-right:1px solid #222; padding:6px 8px; width:50%; vertical-align:top;">
                  <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑤ From</div>
                  <div style="font-size:12px;">${fb(data.loadPort)}</div>
                </td>
                <td style="padding:6px 8px; width:50%; vertical-align:top;">
                  <div style="font-size:10px; color:#1e3a8a; font-weight:700; margin-bottom:3px;">⑥ To</div>
                  <div style="font-size:12px;">${fb(data.dischargePort)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table style="border-collapse:collapse; width:100%; margin-top:-1px;">
        <thead>
          <tr style="background:#1e3a8a; color:#fff; font-size:11px;">
            <th style="border:1px solid #1e3a8a; padding:8px 6px; width:14%;">⑫ Shipping Marks</th>
            <th style="border:1px solid #1e3a8a; padding:8px 6px; width:16%;">⑬ No. &amp; kind of packages</th>
            <th style="border:1px solid #1e3a8a; padding:8px 6px; width:32%;">⑭ Goods description</th>
            <th style="border:1px solid #1e3a8a; padding:8px 6px; width:12%;">⑮ Quantity</th>
            <th style="border:1px solid #1e3a8a; padding:8px 6px; width:13%;">⑯ Unit price</th>
            <th style="border:1px solid #1e3a8a; padding:8px 6px; width:13%;">⑰ Amount</th>
          </tr>
        </thead>
        <tbody style="font-size:12px;">
          ${itemsHTML}
          <tr style="background:#f1f5f9; font-weight:700;">
            <td colspan="5" style="border:1px solid #444; padding:9px 8px; text-align:right;">TOTAL AMOUNT</td>
            <td style="border:1px solid #444; padding:9px 8px; text-align:right; color:#1e3a8a;">${cur} ${esc((data.totalAmount ?? 0).toFixed(2))}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:22px; display:flex; justify-content:flex-end;">
        <div style="width:290px;">
          <div style="font-size:11px; color:#1e3a8a; font-weight:700; margin-bottom:24px;">⑱ Signed by</div>
          <div style="border-bottom:1px solid #333; font-family:'Courier New',monospace; font-style:italic; font-size:15px; padding-bottom:4px; color:#333;">${esc(data.signedBy || data.seller?.name || '')}</div>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0; margin-top:24px; padding-top:8px; text-align:center; font-size:9px; color:#aaa;">Generated by PortAI • Korea International Trade Association Standard Commercial Invoice</div>
    </div>
  `;
}
