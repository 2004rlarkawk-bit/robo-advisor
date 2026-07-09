import type { CertificateOfOriginData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

export function renderCertificateOfOriginHTML(data: CertificateOfOriginData): string {
  return `
    <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; background: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
      <!-- Header -->
      <div style="text-align: center; border-bottom: 3px double #d97706; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.05em; color: #b45309;">CERTIFICATE OF ORIGIN</h1>
        <p style="margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em;">Origin Certification & Customs Declaration Document</p>
      </div>

      <!-- Metadata & Info Grid -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
            <div style="font-size: 11px; font-weight: bold; color: #d97706; text-transform: uppercase; margin-bottom: 5px;">Exporter / Manufacturer</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">${esc(data.exporter.name)}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 3px;">${esc(data.exporter.address)}</div>
            <div style="font-size: 12px; color: #475569;">Contact: ${esc(data.exporter.contact)}</div>
          </td>
          <td style="width: 50%; vertical-align: top; border-left: 1px solid #e2e8f0; padding-left: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b; width: 45%;">C/O No:</td>
                <td style="padding: 4px 0; font-weight: bold; color: #0f172a;">${esc(data.coNo)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Date:</td>
                <td style="padding: 4px 0; color: #0f172a;">${esc(data.date)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Invoice Ref:</td>
                <td style="padding: 4px 0; color: #0f172a; font-family: monospace;">${esc(data.invoiceRef)}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

      <!-- Consignee Info -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <tr>
          <td style="width: 100%; vertical-align: top;">
            <div style="font-size: 11px; font-weight: bold; color: #d97706; text-transform: uppercase; margin-bottom: 5px;">Consignee / Importer</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">${esc(data.importer.name)}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 3px;">${esc(data.importer.address)}</div>
            <div style="font-size: 12px; color: #475569;">Contact: ${esc(data.importer.contact)}</div>
          </td>
        </tr>
      </table>

      <!-- Origin Details Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 35px; font-size: 13px; border: 1px solid #cbd5e1;">
        <thead>
          <tr style="background-color: #d97706; color: #ffffff;">
            <th style="padding: 10px; text-align: left; font-weight: 600; width: 35%; border-right: 1px solid #cbd5e1;">Declaration Item Field</th>
            <th style="padding: 10px; text-align: left; font-weight: 600; width: 65%;">Certified Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; font-weight: bold; color: #475569; background-color: #fafaf9;">Description of Goods</td>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${esc(data.itemDescription)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; font-weight: bold; color: #475569; background-color: #fafaf9;">HS CODE (6 digits or more)</td>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; font-family: monospace; font-size: 14px; color: #0f172a;">${esc(data.hsCode)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; font-weight: bold; color: #475569; background-color: #fafaf9;">Quantity / Packing unit</td>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; color: #0f172a;">${esc(data.quantity)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; font-weight: bold; color: #475569; background-color: #fafaf9;">Country of Origin</td>
            <td style="padding: 10px; border-bottom: 1px solid #cbd5e1; color: #b45309; font-weight: bold; font-size: 14px;">${esc(data.originCountry)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-right: 1px solid #cbd5e1; font-weight: bold; color: #475569; background-color: #fafaf9;">Invoice Reference</td>
            <td style="padding: 10px; color: #0f172a; font-family: monospace;">${esc(data.invoiceRef)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Certifying declarations -->
      <div style="background-color: #fef3c7; border: 1px solid #fde68a; padding: 15px; border-radius: 6px; font-size: 11.5px; line-height: 1.5; color: #78350f; font-style: italic; margin-bottom: 40px;">
        "The undersigned exporter hereby declares that the details declared above are true and correct, and that all the goods originate in the country shown above in accordance with the rules of origin of international customs regulations."
      </div>

      <!-- Authorities signatures -->
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr>
          <td style="width: 50%; padding-right: 25px; text-align: center; vertical-align: bottom;">
            <div style="border-bottom: 1px solid #94a3b8; height: 50px; font-family: monospace; font-size: 15px; color: #475569; font-style: italic; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 5px;">
              ${esc(data.exporter.name.split(' ')[0])}
            </div>
            <div style="margin-top: 8px; font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Signature of Exporter</div>
          </td>
          <td style="width: 50%; padding-left: 25px; text-align: center; vertical-align: bottom;">
            <div style="border: 2px dashed #b45309; border-radius: 50%; width: 90px; height: 90px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 8px; font-weight: bold; color: #b45309; line-height: 1.3;">
              <span>CHAMBER OF</span>
              <span>COMMERCE</span>
              <span style="font-size: 6px; border-top: 1.5px solid #b45309; margin-top: 3px; padding-top: 2px;">REPUBLIC OF KOREA</span>
            </div>
            <div style="margin-top: 8px; font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">Stamp of Certifying Authority</div>
          </td>
        </tr>
      </table>

      <!-- Footer Note -->
      <div style="border-top: 1px solid #e2e8f0; margin-top: 50px; padding-top: 10px; text-align: center; font-size: 9px; color: #94a3b8;">
        Generated automatically by PortAI Smart Customs Platform • A4 Document Page 1 of 1
      </div>
    </div>
  `;
}
