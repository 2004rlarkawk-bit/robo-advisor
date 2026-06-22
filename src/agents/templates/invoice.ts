import type { InvoiceData } from '../../types';

export function renderInvoiceHTML(data: InvoiceData): string {
  const itemsHTML = data.items.map(item => `
    <tr>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${item.no}</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>${item.description}</strong></td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${item.quantity.toLocaleString()}</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: center;">${item.unit}</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right;">${data.currency} ${item.unitPrice.toFixed(2)}</td>
      <td style="padding: 10px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">${data.currency} ${item.amount.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; border: 1px solid #e2e8f0; background: #ffffff; color: #1e293b; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
      <!-- Header -->
      <div style="text-align: center; border-bottom: 3px double #2563eb; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: 0.05em; color: #1e3a8a;">COMMERCIAL INVOICE</h1>
        <p style="margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em;">International Trade & Customs Document</p>
      </div>

      <!-- Metadata & Info Grid -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
            <div style="font-size: 11px; font-weight: bold; color: #4f46e5; text-transform: uppercase; margin-bottom: 5px;">Exporter / Shipper</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">${data.exporter.name}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 3px;">${data.exporter.address}</div>
            <div style="font-size: 12px; color: #475569;">Contact: ${data.exporter.contact}</div>
          </td>
          <td style="width: 50%; vertical-align: top; border-left: 1px solid #e2e8f0; padding-left: 20px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b; width: 45%;">Invoice No:</td>
                <td style="padding: 4px 0; font-weight: bold; color: #0f172a;">${data.invoiceNo}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Date:</td>
                <td style="padding: 4px 0; color: #0f172a;">${data.date}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Incoterms:</td>
                <td style="padding: 4px 0; color: #2563eb; font-weight: bold;">${data.incoterms}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; font-weight: bold; color: #64748b;">Payment Terms:</td>
                <td style="padding: 4px 0; color: #0f172a;">${data.paymentTerms}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">

      <!-- Consignee Info -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding-right: 20px;">
            <div style="font-size: 11px; font-weight: bold; color: #4f46e5; text-transform: uppercase; margin-bottom: 5px;">Consignee / Importer</div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; margin-bottom: 3px;">${data.importer.name}</div>
            <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 3px;">${data.importer.address}</div>
            <div style="font-size: 12px; color: #475569;">Contact: ${data.importer.contact}</div>
          </td>
          <td style="width: 50%; vertical-align: top; border-left: 1px solid #e2e8f0; padding-left: 20px;">
            <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">Shipping Routing</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.5;">
              <tr>
                <td style="padding: 2px 0; font-weight: bold; color: #64748b; width: 45%;">Port of Loading:</td>
                <td style="padding: 2px 0; color: #0f172a;">${data.loadPort}</td>
              </tr>
              <tr>
                <td style="padding: 2px 0; font-weight: bold; color: #64748b;">Port of Discharge:</td>
                <td style="padding: 2px 0; color: #0f172a;">${data.dischargePort}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 13px;">
        <thead>
          <tr style="background-color: #1e3a8a; color: #ffffff;">
            <th style="padding: 12px 10px; text-align: center; font-weight: 600; width: 8%; border: 1px solid #1e3a8a;">No.</th>
            <th style="padding: 12px 10px; text-align: left; font-weight: 600; width: 48%; border: 1px solid #1e3a8a;">Description of Goods</th>
            <th style="padding: 12px 10px; text-align: right; font-weight: 600; width: 12%; border: 1px solid #1e3a8a;">Qty</th>
            <th style="padding: 12px 10px; text-align: center; font-weight: 600; width: 10%; border: 1px solid #1e3a8a;">Unit</th>
            <th style="padding: 12px 10px; text-align: right; font-weight: 600; width: 12%; border: 1px solid #1e3a8a;">Unit Price</th>
            <th style="padding: 12px 10px; text-align: right; font-weight: 600; width: 10%; border: 1px solid #1e3a8a;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
          <tr style="background-color: #f8fafc; font-weight: bold; font-size: 14px;">
            <td colspan="4" style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: right; color: #475569;">TOTAL AMOUNT:</td>
            <td colspan="2" style="padding: 12px 10px; border: 1px solid #cbd5e1; text-align: right; color: #1e3a8a; font-size: 16px;">${data.currency} ${data.totalAmount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <!-- Signoff section -->
      <div style="margin-top: 50px; display: flex; justify-content: flex-end;">
        <div style="text-align: center; width: 250px;">
          <div style="height: 60px; display: flex; align-items: flex-end; justify-content: center; font-family: 'Courier New', Courier, monospace; font-size: 18px; color: #475569; font-style: italic; border-bottom: 1px solid #94a3b8; margin-bottom: 8px; padding-bottom: 5px;">
            ${data.exporter.name.split(' ')[0]}
          </div>
          <div style="font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; letter-spacing: 0.05em;">Authorized Signature</div>
        </div>
      </div>
      
      <!-- Footer Note -->
      <div style="border-top: 1px solid #e2e8f0; margin-top: 50px; padding-top: 10px; text-align: center; font-size: 9px; color: #94a3b8;">
        Generated automatically by PortAI Smart Customs Platform • A4 Document Page 1 of 1
      </div>
    </div>
  `;
}
