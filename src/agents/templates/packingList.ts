import type { PackingListData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

export function renderPackingListHTML(data: PackingListData): string {
  const itemsHTML = data.items.map(item => `
    <tr>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${esc(item.no)}</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>${esc(item.description)}</strong></td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${esc(item.quantity.toLocaleString())}</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${esc(item.netWeight.toFixed(1))} kg</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${esc(item.grossWeight.toFixed(1))} kg</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center; color: #475569;">${esc(item.dimensions)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; background: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
      <!-- Header -->
      <div style="text-align: center; border-bottom: 3px double #10b981; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.05em; color: #065f46;">PACKING LIST</h1>
        <p style="margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em;">Shipping / Cargo Packing Details</p>
      </div>

      <!-- Metadata & Info Grid -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
            <div style="font-size: 11px; font-weight: bold; color: #059669; text-transform: uppercase; margin-bottom: 5px;">Exporter / Shipper</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">${esc(data.exporter.name)}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 3px;">${esc(data.exporter.address)}</div>
            <div style="font-size: 12px; color: #475569;">Contact: ${esc(data.exporter.contact)}</div>
          </td>
          <td style="width: 50%; vertical-align: top; border-left: 1px solid #e2e8f0; padding-left: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b; width: 45%;">P/L No:</td>
                <td style="padding: 4px 0; font-weight: bold; color: #0f172a;">${esc(data.plNo)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Date:</td>
                <td style="padding: 4px 0; color: #0f172a;">${esc(data.date)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Invoice Ref No:</td>
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
            <div style="font-size: 11px; font-weight: bold; color: #059669; text-transform: uppercase; margin-bottom: 5px;">Consignee / Importer</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">${esc(data.importer.name)}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 3px;">${esc(data.importer.address)}</div>
            <div style="font-size: 12px; color: #475569;">Contact: ${esc(data.importer.contact)}</div>
          </td>
        </tr>
      </table>
      <!-- Shipping Marks -->
      <div style="margin-bottom: 25px; padding: 14px 16px; border: 1px solid #cbd5e1; background-color: #f8fafc;">
        <div style="font-size: 11px; font-weight: bold; color: #059669; text-transform: uppercase; margin-bottom: 6px;">Shipping Marks</div>
        <div style="font-size: 13px; color: #0f172a; line-height: 1.5; white-space: pre-line;">${esc(data.shippingMarks || 'N/A')}</div>
      </div>
      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px;">
        <thead>
          <tr style="background-color: #047857; color: #ffffff;">
            <th style="padding: 12px 10px; text-align: center; font-weight: 600; width: 8%; border: 1px solid #047857;">No.</th>
            <th style="padding: 12px 10px; text-align: left; font-weight: 600; width: 44%; border: 1px solid #047857;">Description of Goods</th>
            <th style="padding: 12px 10px; text-align: right; font-weight: 600; width: 10%; border: 1px solid #047857;">Qty (PCS)</th>
            <th style="padding: 12px 10px; text-align: right; font-weight: 600; width: 13%; border: 1px solid #047857;">Net Weight</th>
            <th style="padding: 12px 10px; text-align: right; font-weight: 600; width: 13%; border: 1px solid #047857;">Gross Weight</th>
            <th style="padding: 12px 10px; text-align: center; font-weight: 600; width: 12%; border: 1px solid #047857;">Dimensions</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
          <tr style="background-color: #f0fdf4; font-weight: bold; font-size: 14px;">
            <td colspan="2" style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: right; color: #0f5132;">TOTALS:</td>
            <td style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: right; color: #0f5132;">${esc(data.totalPackages.toLocaleString())}</td>
            <td style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: right; color: #0f5132;">${esc(data.totalNetWeight.toFixed(1))} kg</td>
            <td style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: right; color: #0f5132; font-size: 15px;">${esc(data.totalGrossWeight.toFixed(1))} kg</td>
            <td style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: center; color: #64748b;">-</td>
          </tr>
        </tbody>
      </table>

      <!-- Signoff section -->
      <div style="margin-top: 50px; display: flex; justify-content: flex-end;">
        <div style="text-align: center; width: 250px;">
          <div style="height: 60px; display: flex; align-items: flex-end; justify-content: center; font-family: 'Courier New', Courier, monospace; font-size: 18px; color: #475569; font-style: italic; border-bottom: 1px solid #94a3b8; margin-bottom: 8px; padding-bottom: 5px;">
            ${esc(data.signedBy || data.exporter?.name || data.seller?.name || '')}
          </div>
          <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.05em;">Checked & Approved By</div>
        </div>
      </div>

      <!-- Footer Note -->
      <div style="border-top: 1px solid #e2e8f0; margin-top: 50px; padding-top: 10px; text-align: center; font-size: 9px; color: #94a3b8;">
        Generated automatically by PortAI Smart Customs Platform • A4 Document Page 1 of 1
      </div>
    </div>
  `;
}
