import type { InsuranceData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 적하보험증권 (Certificate of Marine Cargo Insurance) — ①~⑳ 서식.
 * 참고 양식: 적하보험증권(Cargo Insurance Policy)_예시.docx
 * 실제 증권은 보험사가 발급하며, 본 문서는 CIF 조건 부보 내역을 정리한 "초안(Draft)"이다.
 */
export function renderInsuranceHTML(data: InsuranceData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '—') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#94a3b8;">${esc(fallback)}</span>` : esc(s);
  };
  const cur = esc(data.currency || 'USD');
  const amount = data.amountInsured ? `${cur} ${esc(data.amountInsured.toLocaleString())}` : fb('');
  const assured = data.assured || { name: '', address: '', contact: '' };

  const box = (num: string, label: string, value: string, w = '50%') => `
    <td style="border:1px solid #222; padding:5px 7px; vertical-align:top; width:${w};">
      <div style="font-size:9.5px; color:#3730a3; font-weight:700; margin-bottom:2px;">${num} ${label}</div>
      <div style="font-size:11.5px; line-height:1.4;">${value}</div>
    </td>`;

  return `
    <div style="font-family:'Malgun Gothic','Inter','Helvetica Neue',Arial,sans-serif; max-width:800px; margin:0 auto; padding:26px 30px 34px; background:#fff; color:#111;">
      <h1 style="text-align:center; font-size:19px; margin:0 0 2px; font-weight:700; letter-spacing:1px;">CERTIFICATE OF MARINE CARGO INSURANCE</h1>
      <div style="text-align:center; font-size:10px; color:#555; letter-spacing:2px; margin-bottom:12px; text-transform:uppercase;">Cargo Insurance Policy</div>

      <table style="border-collapse:collapse; width:100%; border:1px solid #222;">
        <tr>
          ${box('②', "Assured(s), etc.", `<b>${esc(assured.name || '')}</b>${assured.address ? '<br>' + esc(assured.address) : ''}`)}
          ${box('①', 'Certificate No.', `<b>${esc(data.certNo || '')}</b>`)}
        </tr>
        <tr>
          ${box('③', 'Ref. No.', `Invoice No. ${esc(data.invoiceNo || '')}${d.lcNo ? '<br>L/C No. ' + esc(d.lcNo) : ''}`)}
          ${box('④', 'Amount insured', `<b>${amount}</b>${d.insuredRate ? `<br><span style="color:#94a3b8; font-size:10px;">(${esc(d.insuredRate)})</span>` : ''}`)}
        </tr>
        <tr>
          ${box('⑥', 'Claim, if any, payable at', fb(d.claimPayableAt))}
          ${box('⑤', 'Conditions', data.conditions ? esc(data.conditions) : '<span style="color:#94a3b8;">INSTITUTE CARGO CLAUSE (A)</span>')}
        </tr>
        <tr>
          ${box('⑦', 'Survey should be approved by', fb(d.surveyApprovedBy, 'THE SAME AS ABOVE'))}
          ${box('⑧', 'Local Vessel or Conveyance', fb(d.localVessel))}
        </tr>
        <tr>
          ${box('⑩', 'Ship or Vessel called the', `<b>${fb(data.vesselName)}</b>`)}
          ${box('⑨', 'From (interior port or place of loading)', fb(d.fromInterior))}
        </tr>
        <tr>
          ${box('⑫', 'At and from', `<b>${fb(data.fromPort)}</b>`)}
          ${box('⑪', 'Sailing on or about', fb(data.sailingOn))}
        </tr>
        <tr>
          ${box('⑭', 'Arrived at', `<b>${fb(data.toPort)}</b>`)}
          ${box('⑬', 'Transshipped at', fb(d.transshippedAt))}
        </tr>
        <tr>
          <td style="border:1px solid #222; padding:5px 7px; vertical-align:top;" colspan="2">
            <div style="font-size:9.5px; color:#3730a3; font-weight:700; margin-bottom:2px;">⑯ Goods and Merchandise</div>
            <div style="font-size:11.5px; line-height:1.4;"><b>${esc(data.goods || '')}</b></div>
          </td>
        </tr>
      </table>

      <div style="font-size:9.5px; color:#555; line-height:1.5; margin-top:10px; padding:8px 10px; border:1px solid #e2e8f0; background:#fafafa;">
        Subject to the following Clauses as per back hereof: Institute Cargo Clauses, Institute War Clauses (Cargo), Institute Strikes Riots and Civil Commotions Clauses, Institute Classification Clauses. In the event of loss or damage, no claims will be admitted unless a survey has been held with the approval of this Company's office or Agents specified in this Certificate.
      </div>

      <table style="width:100%; border-collapse:collapse; margin-top:14px;">
        <tr>
          <td style="width:55%; vertical-align:bottom;">
            <div style="font-size:9.5px; color:#3730a3; font-weight:700;">⑰ Place and Date signed &nbsp;·&nbsp; ⑱ No. of Certificates issued</div>
            <div style="font-size:11.5px; margin-top:4px;">${fb(d.placeAndDateSigned)} &nbsp;/&nbsp; ${fb(d.noOfCertificates, 'TWO')}</div>
          </td>
          <td style="width:45%; text-align:center; vertical-align:bottom;">
            <div style="font-size:9.5px; color:#3730a3; font-weight:700; margin-bottom:20px;">⑲ Authorized Signatory</div>
            <div style="border-bottom:1px solid #333; font-family:'Courier New',monospace; font-style:italic; font-size:14px; padding-bottom:4px; color:#333;">${esc(data.signedBy || (d.company as string) || '')}</div>
          </td>
        </tr>
      </table>

      <div style="border-top:1px solid #e2e8f0; margin-top:16px; padding-top:7px; text-align:center; font-size:9px; color:#aaa;">Generated by PortAI • Marine Cargo Insurance Certificate — 부보 내역 초안 / Draft (실제 증권은 보험사 발급)</div>
    </div>
  `;
}
