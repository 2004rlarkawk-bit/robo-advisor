import type { InvoiceData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 상업송장 (Commercial Invoice)
 * 한국무역협회(KITA) 표준 서식 ①~⑱ 기준.
 * 참고 양식: 샘플 서류/무역협회_상업송장_commerical_invoice.docx
 * 공식 흑백 서식 레이아웃을 그대로 재현하고, 값만 데이터로 치환한다.
 */
export function renderInvoiceHTML(data: InvoiceData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#b0b0b0;">${esc(fallback)}</span>` : esc(s);
  };
  const cur = esc(data.currency || 'USD');
  const marks = d.shippingMarks && String(d.shippingMarks).trim() !== ''
    ? esc(d.shippingMarks)
    : '<span style="color:#b0b0b0;">N/M</span>';

  // 공통 셀 스타일
  const B = 'border:1px solid #000;';
  const label = 'font-size:9px; font-weight:700; color:#222; margin-bottom:2px; letter-spacing:.2px;';
  const value = 'font-size:12px; line-height:1.45; color:#000;';

  const itemsHTML = data.items.map(item => {
    const it = item as Record<string, any>;
    const pkg = it.packageCount
      ? `${esc(String(it.packageCount))} ${esc(it.packageType || d.packageType || 'CARTONS')}`
      : fb(d.packageCount ? `${d.packageCount} ${d.packageType || 'CARTONS'}` : '');
    const hs = item.hsCode
      ? `<br><span style="color:#666; font-size:11px;">HS ${esc(item.hsCode)}</span>`
      : '';
    return `
      <tr>
        <td style="${B} padding:9px 8px; text-align:center; vertical-align:top;">${marks}</td>
        <td style="${B} padding:9px 8px; vertical-align:top;">${pkg}</td>
        <td style="${B} padding:9px 8px; vertical-align:top;">${esc(item.description)}${hs}</td>
        <td style="${B} padding:9px 8px; text-align:right; vertical-align:top;">${esc((item.quantity ?? 0).toLocaleString())} ${esc(item.unit || '')}</td>
        <td style="${B} padding:9px 8px; text-align:right; vertical-align:top;">${cur} ${esc((item.unitPrice ?? 0).toFixed(2))}</td>
        <td style="${B} padding:9px 8px; text-align:right; vertical-align:top; font-weight:700;">${cur} ${esc((item.amount ?? 0).toFixed(2))}</td>
      </tr>`;
  }).join('');

  const originRef = d.countryOfOrigin || data.items?.[0]?.countryOfOrigin;
  const buyer = d.buyer?.name ? esc(d.buyer.name) : '<span style="color:#b0b0b0;">SAME AS CONSIGNEE</span>';
  const sellerTax = d.sellerTaxNo || d.businessRegistrationNo || d.taxNo;

  return `
    <div style="font-family:'Times New Roman','Nanum Myeongjo','Malgun Gothic',serif; max-width:820px; margin:0 auto; padding:26px 30px 36px; background:#fff; color:#000;">
      <h1 style="text-align:center; font-size:22px; letter-spacing:2px; margin:0 0 18px; font-weight:700;">COMMERCIAL INVOICE</h1>

      <table style="border-collapse:collapse; width:100%; ${B} table-layout:fixed;">
        <colgroup><col style="width:55%;"><col style="width:45%;"></colgroup>

        <!-- ① Shipper/Seller  |  ⑦ Invoice / ⑧ L/C -->
        <tr>
          <td style="${B} padding:6px 8px; vertical-align:top;">
            <div style="${label}">① Shipper / Seller</div>
            <div style="${value}"><span style="font-weight:700; font-size:13px;">${esc(data.seller?.name || '')}</span><br>
              ${fb(data.seller?.address)}<br>
              ${data.seller?.contact ? 'TEL: ' + esc(data.seller.contact) : ''}${sellerTax ? '<br>사업자등록번호: ' + esc(sellerTax) : ''}</div>
          </td>
          <td style="${B} padding:0; vertical-align:top;">
            <table style="border-collapse:collapse; width:100%; height:100%;">
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑦ Invoice No. and date</div>
                <div style="${value}"><span style="font-weight:700;">${fb(data.invoiceNo)}</span> &nbsp; ${fb(data.invoiceDate || d.date)}</div>
              </td></tr>
              <tr><td style="padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑧ L/C No. and date</div>
                <div style="${value}">${fb(d.lcNo)}</div>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- ② Consignee  |  ⑨ Buyer / ⑩ Other references -->
        <tr>
          <td style="${B} padding:6px 8px; vertical-align:top;">
            <div style="${label}">② Consignee (or For account &amp; risk of Messrs)</div>
            <div style="${value}"><span style="font-weight:700; font-size:13px;">${esc(data.consignee?.name || '')}</span><br>
              ${fb(data.consignee?.address)}<br>
              ${data.consignee?.contact ? 'TEL: ' + esc(data.consignee.contact) : ''}</div>
          </td>
          <td style="${B} padding:0; vertical-align:top;">
            <table style="border-collapse:collapse; width:100%; height:100%;">
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑨ Buyer (if other than consignee)</div>
                <div style="${value}">${buyer}</div>
              </td></tr>
              <tr><td style="padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑩ Other references</div>
                <div style="${value}">${originRef ? 'COUNTRY OF ORIGIN: ' + esc(originRef) : fb('')}</div>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- ③ Departure / ④ Vessel + ⑤ From / ⑥ To  |  ⑪ Terms -->
        <tr>
          <td style="${B} padding:0; vertical-align:top;">
            <table style="border-collapse:collapse; width:100%;">
              <tr><td colspan="2" style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">③ Departure date</div>
                <div style="${value}">${fb(data.departureDate)}</div>
              </td></tr>
              <tr>
                <td style="border-right:1px solid #000; border-bottom:1px solid #000; padding:6px 8px; width:50%; vertical-align:top;">
                  <div style="${label}">④ Vessel / flight</div>
                  <div style="${value}">${fb(d.vessel || d.vesselOrFlight)}</div>
                </td>
                <td style="border-bottom:1px solid #000; padding:6px 8px; width:50%; vertical-align:top;">
                  <div style="${label}">⑤ From</div>
                  <div style="${value}">${fb(data.loadPort)}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑥ To</div>
                <div style="${value}">${fb(data.dischargePort)}</div>
              </td></tr>
            </table>
          </td>
          <td style="${B} padding:6px 8px; vertical-align:top;">
            <div style="${label}">⑪ Terms of delivery and payment</div>
            <div style="${value}"><span style="font-weight:700;">${esc(data.incoterms || '')} ${esc(data.loadPort || '')}</span><br>${fb(data.paymentTerms)}</div>
          </td>
        </tr>
      </table>

      <!-- 품목 테이블 ⑫~⑰ -->
      <table style="border-collapse:collapse; width:100%; margin-top:-1px; table-layout:fixed;">
        <thead>
          <tr style="background:#f2f2f2; font-size:11px; color:#000;">
            <th style="${B} padding:8px 6px; width:13%;">⑫ Shipping<br>Marks</th>
            <th style="${B} padding:8px 6px; width:16%;">⑬ No. &amp; kind of<br>packages</th>
            <th style="${B} padding:8px 6px; width:30%;">⑭ Goods description</th>
            <th style="${B} padding:8px 6px; width:12%;">⑮ Quantity</th>
            <th style="${B} padding:8px 6px; width:14%;">⑯ Unit price</th>
            <th style="${B} padding:8px 6px; width:15%;">⑰ Amount</th>
          </tr>
        </thead>
        <tbody style="font-size:12px;">
          ${itemsHTML}
          <tr style="font-weight:700;">
            <td colspan="5" style="${B} padding:9px 8px; text-align:right;">TOTAL AMOUNT</td>
            <td style="${B} padding:9px 8px; text-align:right;">${cur} ${esc((data.totalAmount ?? 0).toFixed(2))}</td>
          </tr>
        </tbody>
      </table>

      <!-- ⑱ Signed by -->
      <div style="margin-top:26px; display:flex; justify-content:flex-end;">
        <div style="width:300px; text-align:center;">
          <div style="${label} text-align:left;">⑱ Signed by</div>
          <div style="border-bottom:1px solid #000; font-family:'Times New Roman',serif; font-style:italic; font-size:15px; padding:18px 4px 4px; color:#000;">${esc(data.signedBy || data.seller?.name || '')}</div>
        </div>
      </div>
    </div>
  `;
}
