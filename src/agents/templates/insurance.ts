import type { InsuranceData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

/**
 * 적하보험증권 (Certificate of Marine Cargo Insurance) — ①~⑳ 서식.
 * 참고 양식: 샘플 서류/적하보험증권(Cargo_Insurance_Policy)_예시.docx
 * 공식 흑백 서식 레이아웃을 그대로 재현. 값만 데이터로 치환한다.
 * 실제 증권은 보험사가 발급하며, 본 문서는 CIF 조건 부보 내역 "초안(Draft)"이다.
 */
export function renderInsuranceHTML(data: InsuranceData): string {
  const d = data as Record<string, any>;
  const fb = (v: any, fallback = '') => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    return s === '' ? `<span style="color:#b0b0b0;">${esc(fallback)}</span>` : esc(s);
  };
  const cur = esc(data.currency || 'USD');
  const amount = data.amountInsured ? `${cur} ${esc(data.amountInsured.toLocaleString())}` : fb('');
  const assured = data.assured || { name: '', address: '', contact: '' };

  const B = 'border:1px solid #000;';
  const label = 'font-size:9px; font-weight:700; color:#222; margin-bottom:2px; letter-spacing:.2px;';
  const value = 'font-size:11.5px; line-height:1.4; color:#000;';

  const box = (num: string, lbl: string, val: string, w = '50%') => `
    <td style="${B} padding:5px 7px; vertical-align:top; width:${w};">
      <div style="${label}">${num} ${lbl}</div>
      <div style="${value}">${val}</div>
    </td>`;

  return `
    <div style="font-family:'Times New Roman','Nanum Myeongjo','Malgun Gothic',serif; max-width:820px; margin:0 auto; padding:26px 30px 34px; background:#fff; color:#000;">
      <div style="text-align:center; font-size:12px; font-weight:700; margin-bottom:2px;">${esc((d.company as string) || 'INSURANCE CO., LTD.')}</div>
      <h1 style="text-align:center; font-size:19px; margin:0 0 14px; font-weight:700; letter-spacing:1px;">CERTIFICATE OF MARINE CARGO INSURANCE</h1>

      <table style="border-collapse:collapse; width:100%; ${B} table-layout:fixed;">
        <!-- ② Assured (full width) -->
        <tr>
          <td style="${B} padding:5px 7px; vertical-align:top;" colspan="2">
            <div style="${label}">② Assured(s), etc.</div>
            <div style="${value}"><b>${esc(assured.name || '')}</b>${assured.address ? '<br>' + esc(assured.address) : ''}</div>
          </td>
        </tr>
        <!-- ① Certificate No. | ③ Ref. No. -->
        <tr>
          ${box('①', 'Certificate No.', `<b>${fb(data.certNo)}</b>`)}
          ${box('③', 'Ref. No.', `Invoice No. ${fb(data.invoiceNo)}${d.lcNo ? '<br>L/C No. ' + esc(d.lcNo) : ''}`)}
        </tr>
        <!-- ⑥ Claim payable at | ④ Amount insured -->
        <tr>
          ${box('⑥', 'Claim, if any, payable at', fb(d.claimPayableAt))}
          ${box('④', 'Amount insured', `<b>${amount}</b>${d.insuredRate ? `<br><span style="color:#666; font-size:10px;">(${esc(d.insuredRate)})</span>` : ''}`)}
        </tr>
        <!-- ⑦ Survey approved by | ⑤ Conditions -->
        <tr>
          ${box('⑦', 'Survey should be approved by', fb(d.surveyApprovedBy, 'THE SAME AS ABOVE'))}
          ${box('⑤', 'Conditions', data.conditions ? esc(data.conditions) : '<span style="color:#b0b0b0;">INSTITUTE CARGO CLAUSE (A)</span>')}
        </tr>
        <!-- ⑧ Local Vessel | ⑨ From (interior) -->
        <tr>
          ${box('⑧', 'Local Vessel or Conveyance', fb(d.localVessel))}
          ${box('⑨', 'From (interior port or place of loading)', fb(d.fromInterior))}
        </tr>
        <!-- ⑩ Ship or Vessel | ⑪ Sailing on or about -->
        <tr>
          ${box('⑩', 'Ship or Vessel called the', `<b>${fb(data.vesselName)}</b>`)}
          ${box('⑪', 'Sailing on or about', fb(data.sailingOn))}
        </tr>
        <!-- ⑫ at and from | ⑬ transshipped at -->
        <tr>
          ${box('⑫', 'at and from', `<b>${fb(data.fromPort)}</b>`)}
          ${box('⑬', 'transshipped at', fb(d.transshippedAt))}
        </tr>
        <!-- ⑭ arrived at | ⑮ thence to -->
        <tr>
          ${box('⑭', 'arrived at', `<b>${fb(data.toPort)}</b>`)}
          ${box('⑮', 'thence to', fb(d.thenceTo))}
        </tr>
        <!-- ⑯ Goods and Merchandise (full width) -->
        <tr>
          <td style="${B} padding:5px 7px; vertical-align:top;" colspan="2">
            <div style="${label}">⑯ Goods and Merchandise</div>
            <div style="${value}"><b>${esc(data.goods || '')}</b></div>
          </td>
        </tr>
      </table>

      <div style="font-size:9.5px; color:#333; line-height:1.5; margin-top:8px; padding:8px 10px; ${B}">
        Subject to the following Clauses as per back hereof: Institute Cargo Clauses, Institute War Clauses (Cargo), Institute Strikes Riots and Civil Commotions Clauses, Institute Classification Clauses. In the event of loss or damage arising under this insurance, no claims will be admitted unless a survey has been held with the approval of this Company's office or Agents specified in this Certificate.
      </div>

      <table style="width:100%; border-collapse:collapse; margin-top:14px;">
        <tr>
          <td style="width:55%; vertical-align:bottom;">
            <div style="${label}">⑰ Place and Date signed &nbsp;·&nbsp; ⑱ No. of Certificates issued</div>
            <div style="${value} margin-top:4px;">${fb(d.placeAndDateSigned)} &nbsp;/&nbsp; ${fb(d.noOfCertificates, 'TWO')}</div>
          </td>
          <td style="width:45%; text-align:center; vertical-align:bottom;">
            <div style="${label}">⑲ Authorized Signatory</div>
            <div style="border-bottom:1px solid #000; font-family:'Times New Roman',serif; font-style:italic; font-size:14px; padding:18px 4px 4px; color:#000;">${esc(data.signedBy || (d.company as string) || '')}</div>
          </td>
        </tr>
      </table>
    </div>
  `;
}
