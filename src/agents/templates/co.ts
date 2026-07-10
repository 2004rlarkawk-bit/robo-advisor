import type { CertificateOfOriginData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 원산지증명서 (Certificate of Origin) — RCEP 협정 서식 (FORM RCEP, Box 1~14).
 * 참고 양식: 관세청 FTA포털 rcep_dao_doc_01_B24-5.hwp (별지 제24호의5서식).
 * 실제 발급은 세관/상공회의소에서 이루어지며, 본 문서는 "발급 전 초안(Draft)"이다.
 */
export function renderCertificateOfOriginHTML(data: CertificateOfOriginData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '—') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#94a3b8;">${esc(fallback)}</span>` : esc(s);
  };
  const exporter = data.exporter || { name: '', address: '', contact: '' };
  const consignee = data.consignee || (d.importer as any) || { name: '', address: '', contact: '' };
  const originCountry = data.countryOfOrigin || d.originCountry || 'REPUBLIC OF KOREA';
  const hs6 = String(data.hsCode || '').replace(/[^0-9]/g, '').slice(0, 6) || (data.hsCode || '');
  const grossWeight = d.grossWeight ? `${esc(String(d.grossWeight))} KG` : (data.quantity ? esc(String(data.quantity)) : fb(''));

  return `
    <div style="font-family:'Malgun Gothic','Inter','Helvetica Neue',Arial,sans-serif; max-width:800px; margin:0 auto; padding:26px 30px 34px; background:#fff; color:#111;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <div style="font-size:9px; color:#9f1239; font-weight:700;">FORM RCEP</div>
        <div style="font-size:10px; color:#333; text-align:right;"><b style="font-size:11px; display:block;">Certificate No.: ${esc(d.certNo || data.coNo || '—')}</b>Original</div>
      </div>
      <h1 style="text-align:center; font-size:19px; margin:2px 0 0; font-weight:700; letter-spacing:1px;">CERTIFICATE OF ORIGIN</h1>
      <div style="text-align:center; font-size:10px; color:#9f1239; font-weight:700; letter-spacing:1px; margin:2px 0;">REGIONAL COMPREHENSIVE ECONOMIC PARTNERSHIP AGREEMENT (RCEP)</div>
      <div style="text-align:center; font-size:10px; color:#333; margin-bottom:10px;">Issued in <b>${esc(originCountry)}</b> (Country)</div>

      <table style="border-collapse:collapse; width:100%; border:1px solid #222;">
        <tr>
          <td style="border:1px solid #222; width:63%; padding:0; vertical-align:top;">
            <table style="width:100%; border-collapse:collapse;">
              <tr><td style="padding:5px 7px;">
                <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">1. Exporter's name, address and country</div>
                <div style="font-size:11.5px; line-height:1.4;"><b>${esc(exporter.name || '')}</b><br>${fb(exporter.address)}<br>${esc(originCountry)}</div>
              </td></tr>
              <tr><td style="border-top:1px solid #222; padding:5px 7px;">
                <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">2. Goods consigned to (Consignee's name, address, country)</div>
                <div style="font-size:11.5px; line-height:1.4;"><b>${esc(consignee.name || '')}</b><br>${fb(consignee.address)}<br>${fb(d.destinationCountry)}</div>
              </td></tr>
              <tr><td style="border-top:1px solid #222; padding:5px 7px;">
                <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">3. Producer's name, address and country (if known)</div>
                <div style="font-size:11.5px;">${d.producer ? esc(d.producer) : '<span style="color:#94a3b8;">SAME AS EXPORTER</span>'}</div>
              </td></tr>
              <tr><td style="border-top:1px solid #222; padding:5px 7px;">
                <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">4. Means of transport and route (if known)</div>
                <div style="font-size:11.5px; line-height:1.4;">Departure Date: ${fb(d.departureDate)} &nbsp;|&nbsp; Vessel/Aircraft: ${fb(d.vessel || d.vesselOrFlight)}<br>Port of Discharge: ${fb(d.dischargePort)}</div>
              </td></tr>
            </table>
          </td>
          <td style="border:1px solid #222; width:37%; padding:5px 7px; vertical-align:top;">
            <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">5. For Official Use</div>
            <div style="font-size:11px; line-height:1.9;">
              <span style="display:inline-block; width:11px; height:11px; border:1px solid #333; margin-right:5px; vertical-align:middle;"></span>Preferential Treatment Given<br>
              <span style="display:inline-block; width:11px; height:11px; border:1px solid #333; margin-right:5px; vertical-align:middle;"></span>Preferential Treatment Not Given<br>
              <span style="font-size:9px; color:#666;">(Please state reason/s)</span>
            </div>
            <div style="margin-top:30px; border-top:1px solid #bbb; padding-top:3px; font-size:8.5px; color:#666; text-align:center;">Signature of Authorised Signatory of the<br>Customs Authority of the Importing Country</div>
          </td>
        </tr>
      </table>

      <table style="border-collapse:collapse; width:100%; margin-top:-1px;">
        <thead>
          <tr style="background:#9f1239; color:#fff; font-size:9.5px;">
            <th style="border:1px solid #9f1239; padding:6px 4px; width:6%;">6. Item No.</th>
            <th style="border:1px solid #9f1239; padding:6px 4px; width:12%;">7. Marks &amp; numbers</th>
            <th style="border:1px solid #9f1239; padding:6px 4px; width:32%;">8. Number and kind of packages; description of goods</th>
            <th style="border:1px solid #9f1239; padding:6px 4px; width:11%;">9. HS Code (6-digit)</th>
            <th style="border:1px solid #9f1239; padding:6px 4px; width:12%;">10. Origin criterion</th>
            <th style="border:1px solid #9f1239; padding:6px 4px; width:13%;">11. Quantity (Gross weight)</th>
            <th style="border:1px solid #9f1239; padding:6px 4px; width:14%;">12. Invoice No. &amp; date</th>
          </tr>
        </thead>
        <tbody style="font-size:11px;">
          <tr>
            <td style="border:1px solid #444; padding:8px 6px; text-align:center;">1</td>
            <td style="border:1px solid #444; padding:8px 6px; text-align:center; color:#94a3b8;">${d.shippingMarks ? esc(d.shippingMarks) : 'N/M'}</td>
            <td style="border:1px solid #444; padding:8px 6px;">${d.packages ? esc(d.packages) + '<br>' : ''}<strong>${esc(data.itemDescription || '')}</strong></td>
            <td style="border:1px solid #444; padding:8px 6px; text-align:center;">${esc(hs6)}</td>
            <td style="border:1px solid #444; padding:8px 6px; text-align:center;">${fb(d.originCriterion, 'PSR')}</td>
            <td style="border:1px solid #444; padding:8px 6px; text-align:right;">${grossWeight}</td>
            <td style="border:1px solid #444; padding:8px 6px;">${esc(data.invoiceNo || d.invoiceRef || '')}<br>${fb(data.issueDate || d.date)}</td>
          </tr>
          <tr style="height:40px;"><td style="border:1px solid #444;">&nbsp;</td><td style="border:1px solid #444;"></td><td style="border:1px solid #444;"></td><td style="border:1px solid #444;"></td><td style="border:1px solid #444;"></td><td style="border:1px solid #444;"></td><td style="border:1px solid #444;"></td></tr>
        </tbody>
      </table>

      <table style="border-collapse:collapse; width:100%; border:1px solid #222; margin-top:-1px;">
        <tr>
          <td style="border:1px solid #222; width:50%; padding:5px 7px; vertical-align:top;">
            <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">13. Declaration by the exporter</div>
            <div style="font-size:10px; line-height:1.5;">The undersigned hereby declares that the above details and statements are correct, that all the goods were produced in <b>${esc(originCountry)}</b> and that they comply with the origin requirements specified in the RCEP Agreement.</div>
            <div style="border-bottom:1px solid #333; height:34px; margin-top:6px;"></div>
            <div style="font-size:9px; color:#666; text-align:center; margin-top:2px;">Place and date, signature of authorised person</div>
          </td>
          <td style="border:1px solid #222; width:50%; padding:5px 7px; vertical-align:top;">
            <div style="font-size:9.5px; color:#9f1239; font-weight:700; margin-bottom:2px;">14. Certification</div>
            <div style="font-size:10px; line-height:1.5;">It is hereby certified, on the basis of control carried out, that the declaration by the exporter is correct.</div>
            <div style="border-bottom:1px solid #333; height:34px; margin-top:6px;"></div>
            <div style="font-size:9px; color:#666; text-align:center; margin-top:2px;">Place and date, signature and stamp of authorised body</div>
          </td>
        </tr>
      </table>

      <div style="border-top:1px solid #e2e8f0; margin-top:16px; padding-top:7px; text-align:center; font-size:9px; color:#aaa;">Generated by PortAI • RCEP Certificate of Origin (Form RCEP) — 발급 전 초안 / Draft for review</div>
    </div>
  `;
}
