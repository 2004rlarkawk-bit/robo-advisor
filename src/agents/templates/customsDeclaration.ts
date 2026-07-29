/**
 * @deprecated docx로 대체됨 (exportDeclarationDocxService + templates/export_declaration_template.docx).
 * 통관신고 서류는 수출신고서(초안) docx 방식으로 전환됨 — 이 HTML 렌더러는 참조 0.
 * (packingListXlsxService와 동일하게 삭제하지 않고 휴면 상태로 둔다.)
 */
import type { CustomsDeclarationData } from '../../types';
import { escapeHtml as esc } from './escapeHtml';

export function renderCustomsDeclarationHTML(data: CustomsDeclarationData): string {
  const exporter = data.exporter || { name: '', address: '', contact: '' };
  const importer = data.importer || { name: '', address: '', contact: '' };

  const money = (value: number | undefined) =>
    typeof value === 'number' && !Number.isNaN(value)
      ? value.toLocaleString()
      : '0';

  return `
    <div style="font-family: 'Inter', 'Malgun Gothic', Arial, sans-serif; max-width: 820px; margin: 0 auto; padding: 36px; background: #ffffff; color: #111827; border: 1px solid #d1d5db;">
      <div style="text-align: center; border-bottom: 3px double #374151; padding-bottom: 18px; margin-bottom: 24px;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 0.08em;">CUSTOMS DECLARATION</h1>
        <p style="margin: 6px 0 0; font-size: 12px; color: #6b7280;">통관신고 관련 서류 초안</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 13px;">
        <tr>
          <td style="width: 50%; padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Declaration No.</div>
            <div>${esc(data.declarationNo)}</div>
          </td>
          <td style="width: 50%; padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Declaration Date</div>
            <div>${esc(data.declarationDate)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Trade Type</div>
            <div>${esc(data.tradeType === 'export' ? 'Export' : 'Import')}</div>
          </td>
          <td style="padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Incoterms</div>
            <div>${esc(data.incoterms || '')}</div>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 13px;">
        <tr>
          <td style="width: 50%; vertical-align: top; padding: 12px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 800; color: #1f2937; margin-bottom: 8px;">Exporter</div>
            <div style="font-weight: 700;">${esc(exporter.name)}</div>
            <div style="color: #4b5563; margin-top: 4px;">${esc(exporter.address)}</div>
            <div style="color: #4b5563; margin-top: 4px;">${esc(exporter.contact)}</div>
          </td>
          <td style="width: 50%; vertical-align: top; padding: 12px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 800; color: #1f2937; margin-bottom: 8px;">Importer / Consignee</div>
            <div style="font-weight: 700;">${esc(importer.name)}</div>
            <div style="color: #4b5563; margin-top: 4px;">${esc(importer.address)}</div>
            <div style="color: #4b5563; margin-top: 4px;">${esc(importer.contact)}</div>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 13px;">
        <thead>
          <tr style="background: #374151; color: #ffffff;">
            <th style="padding: 10px; border: 1px solid #374151; text-align: left;">Item</th>
            <th style="padding: 10px; border: 1px solid #374151; text-align: center;">HS Code</th>
            <th style="padding: 10px; border: 1px solid #374151; text-align: right;">Qty</th>
            <th style="padding: 10px; border: 1px solid #374151; text-align: right;">Weight</th>
            <th style="padding: 10px; border: 1px solid #374151; text-align: right;">Invoice Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border: 1px solid #d1d5db; font-weight: 700;">${esc(data.itemName)}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: center;">${esc(data.hsCode)}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: right;">${money(data.quantity)} ${esc(data.unit)}</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: right;">${money(data.weight)} kg</td>
            <td style="padding: 10px; border: 1px solid #d1d5db; text-align: right;">${esc(data.currency)} ${money(data.invoiceAmount)}</td>
          </tr>
        </tbody>
      </table>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 13px;">
        <tr>
          <td style="width: 50%; padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Port of Loading</div>
            <div>${esc(data.loadPort)}</div>
          </td>
          <td style="width: 50%; padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Port of Discharge</div>
            <div>${esc(data.dischargePort)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Country of Origin</div>
            <div>${esc(data.countryOfOrigin || '')}</div>
          </td>
          <td style="padding: 10px; border: 1px solid #d1d5db;">
            <div style="font-size: 11px; font-weight: 700; color: #374151; margin-bottom: 6px;">Customs Value</div>
            <div>${esc(data.currency)} ${money(data.customsValue ?? data.invoiceAmount)}</div>
          </td>
        </tr>
      </table>

      <div style="font-size: 11px; color: #6b7280; line-height: 1.5; border-top: 1px solid #d1d5db; padding-top: 10px; margin-bottom: 36px;">
        This draft is generated for customs preparation support. Final customs declaration must be reviewed and submitted through the appropriate customs system or licensed customs broker.
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <div style="width: 250px; text-align: center;">
          <div style="height: 54px; border-bottom: 1px solid #9ca3af; font-family: 'Times New Roman', serif; font-style: italic; font-size: 17px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 6px;">
            ${esc(data.signedBy || '')}
          </div>
          <div style="font-size: 11px; color: #6b7280; font-weight: 700; margin-top: 8px;">Prepared / Reviewed By</div>
        </div>
      </div>
    </div>
  `;
}
