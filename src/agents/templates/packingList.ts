import type { PackingListData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 포장명세서 (Packing List)
 * 한국무역협회(KITA) 표준 서식 ①~⑯ 기준 — 상업송장과 동일 계열.
 * 참고 양식: 샘플 서류/포장명세서.docx
 * 공식 흑백 서식 레이아웃을 그대로 재현하고, 값만 데이터로 치환한다.
 */
export function renderPackingListHTML(data: PackingListData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#b0b0b0;">${esc(fallback)}</span>` : esc(s);
  };
  const seller = data.seller || d.exporter || { name: '', address: '', contact: '' };
  const consignee = data.consignee || d.importer || { name: '', address: '', contact: '' };
  const marks = data.shippingMarks && String(data.shippingMarks).trim() !== '' && data.shippingMarks !== 'N/M'
    ? esc(data.shippingMarks) : '<span style="color:#b0b0b0;">N/M</span>';

  const B = 'border:1px solid #000;';
  const label = 'font-size:9px; font-weight:700; color:#222; margin-bottom:2px; letter-spacing:.2px;';
  const value = 'font-size:12px; line-height:1.45; color:#000;';

  const itemsHTML = data.items.map(item => {
    const it = item as Record<string, any>;
    const pkg = it.packageCount ? `${esc(String(it.packageCount))} ${esc(it.packageType || data.packageType || 'CARTONS')}`
      : (data.packageCount ? `${esc(String(data.packageCount))} ${esc(data.packageType || 'CARTONS')}` : fb(''));
    const hs = item.hsCode && item.hsCode !== 'N/A' ? `<br><span style="color:#666; font-size:11px;">HS ${esc(item.hsCode)}</span>` : '';
    return `
      <tr>
        <td style="${B} padding:9px 8px; text-align:center; vertical-align:top;">${marks}</td>
        <td style="${B} padding:9px 8px; vertical-align:top;">${pkg}</td>
        <td style="${B} padding:9px 8px; vertical-align:top;">${esc(item.description)}${hs}</td>
        <td style="${B} padding:9px 8px; text-align:right; vertical-align:top;">${esc((item.quantity ?? 0).toLocaleString())} ${esc(item.unit || 'EA')}${item.netWeight ? `<br><span style="color:#666;">N.W ${esc(item.netWeight.toFixed(1))} KG</span>` : ''}</td>
        <td style="${B} padding:9px 8px; text-align:right; vertical-align:top;">${esc((item.grossWeight ?? 0).toFixed(1))} KG</td>
        <td style="${B} padding:9px 8px; text-align:right; vertical-align:top;">${fb(item.dimensions || data.measurement)}</td>
      </tr>`;
  }).join('');

  const originRef = d.countryOfOrigin || data.items?.[0]?.countryOfOrigin;
  const buyer = d.buyer?.name ? esc(d.buyer.name) : '<span style="color:#b0b0b0;">SAME AS CONSIGNEE</span>';
  const sellerTax = d.sellerTaxNo || d.businessRegistrationNo || d.taxNo;

  return `
    <div style="font-family:'Times New Roman','Nanum Myeongjo','Malgun Gothic',serif; max-width:820px; margin:0 auto; padding:26px 30px 36px; background:#fff; color:#000;">
      <h1 style="text-align:center; font-size:22px; letter-spacing:3px; margin:0 0 18px; font-weight:700;">PACKING LIST</h1>

      <table style="border-collapse:collapse; width:100%; ${B} table-layout:fixed;">
        <colgroup><col style="width:55%;"><col style="width:45%;"></colgroup>
        <tr>
          <!-- 좌측: ①→②→③→④⑤→⑥ -->
          <td style="${B} padding:0; vertical-align:top;">
            <table style="border-collapse:collapse; width:100%;">
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">① Seller</div>
                <div style="${value}"><span style="font-weight:700; font-size:13px;">${esc(seller.name || '')}</span><br>
                  ${fb(seller.address)}<br>
                  ${seller.contact ? 'TEL: ' + esc(seller.contact) : ''}${sellerTax ? '<br>사업자등록번호: ' + esc(sellerTax) : ''}</div>
              </td></tr>
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">② Consignee</div>
                <div style="${value}"><span style="font-weight:700; font-size:13px;">${esc(consignee.name || '')}</span><br>
                  ${fb(consignee.address)}<br>
                  ${consignee.contact ? 'TEL: ' + esc(consignee.contact) : ''}</div>
              </td></tr>
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">③ Departure date</div>
                <div style="${value}">${fb(d.departureDate)}</div>
              </td></tr>
              <tr><td style="padding:0; vertical-align:top;">
                <table style="border-collapse:collapse; width:100%;">
                  <tr>
                    <td style="border-right:1px solid #000; border-bottom:1px solid #000; padding:6px 8px; width:50%; vertical-align:top;">
                      <div style="${label}">④ Vessel / flight</div>
                      <div style="${value}">${fb(d.vessel || d.vesselOrFlight)}</div>
                    </td>
                    <td style="border-bottom:1px solid #000; padding:6px 8px; width:50%; vertical-align:top;">
                      <div style="${label}">⑤ From</div>
                      <div style="${value}">${fb(d.loadPort)}</div>
                    </td>
                  </tr>
                  <tr><td colspan="2" style="padding:6px 8px; vertical-align:top;">
                    <div style="${label}">⑥ To</div>
                    <div style="${value}">${fb(d.dischargePort)}</div>
                  </td></tr>
                </table>
              </td></tr>
            </table>
          </td>
          <!-- 우측: ⑦→⑧→⑨ -->
          <td style="${B} padding:0; vertical-align:top;">
            <table style="border-collapse:collapse; width:100%; height:100%;">
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑦ Invoice No. and date</div>
                <div style="${value}"><span style="font-weight:700;">${fb(data.invoiceNo || d.invoiceRef)}</span> &nbsp; ${fb(data.date)}</div>
              </td></tr>
              <tr><td style="border-bottom:1px solid #000; padding:6px 8px; vertical-align:top;">
                <div style="${label}">⑧ Buyer (if other than consignee)</div>
                <div style="${value}">${buyer}</div>
              </td></tr>
              <tr><td style="padding:6px 8px; vertical-align:top; height:100%;">
                <div style="${label}">⑨ Other references</div>
                <div style="${value}">${originRef ? 'COUNTRY OF ORIGIN: ' + esc(originRef) : fb('')}</div>
              </td></tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- 품목 테이블 ⑩~⑮ -->
      <table style="border-collapse:collapse; width:100%; margin-top:-1px; table-layout:fixed;">
        <thead>
          <tr style="background:#f2f2f2; font-size:11px; color:#000;">
            <th style="${B} padding:8px 6px; width:13%;">⑩ Shipping<br>Marks</th>
            <th style="${B} padding:8px 6px; width:17%;">⑪ No. &amp; kind of<br>packages</th>
            <th style="${B} padding:8px 6px; width:29%;">⑫ Goods description</th>
            <th style="${B} padding:8px 6px; width:16%;">⑬ Quantity or<br>net weight</th>
            <th style="${B} padding:8px 6px; width:13%;">⑭ Gross Weight</th>
            <th style="${B} padding:8px 6px; width:12%;">⑮ Measurement</th>
          </tr>
        </thead>
        <tbody style="font-size:12px;">
          ${itemsHTML}
          <tr style="font-weight:700;">
            <td colspan="3" style="${B} padding:9px 8px; text-align:right;">TOTAL</td>
            <td style="${B} padding:9px 8px; text-align:right;">${esc((data.totalPackages ?? 0).toLocaleString())} EA</td>
            <td style="${B} padding:9px 8px; text-align:right;">${esc((data.totalGrossWeight ?? 0).toFixed(1))} KG</td>
            <td style="${B} padding:9px 8px; text-align:right;">${fb(data.measurement)}</td>
          </tr>
        </tbody>
      </table>

      <!-- ⑯ Signed by -->
      <div style="margin-top:26px; display:flex; justify-content:flex-end;">
        <div style="width:300px;">
          <div style="${label}">⑯ Signed by</div>
          <div style="border-bottom:1px solid #000; font-family:'Times New Roman','Nanum Myeongjo','Malgun Gothic',serif; font-style:italic; font-size:15px; padding:18px 4px 4px; color:#000;">${esc(data.signedBy || seller.name || '')}</div>
        </div>
      </div>
    </div>
  `;
}
