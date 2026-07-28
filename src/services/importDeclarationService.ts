import type { ImportDutyEstimate, ImportExtractedFields, ImportHSCodeSuggestion } from '../types/importTrade';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ImportDeclarationData {
  fields: ImportExtractedFields;
  hsCode?: ImportHSCodeSuggestion;
  duty?: ImportDutyEstimate;
}

export function generateImportDeclarationRequest(data: ImportDeclarationData): string {
  const { fields } = data;
  return [
    '수입신고 의뢰서',
    `수입자: ${fields.importer}`,
    `수출자: ${fields.shipper}`,
    `Invoice 번호: ${fields.invoiceNo}`,
    `B/L 번호: ${fields.blNo}`,
    `품명: ${fields.productDescription}`,
    `HS Code: ${data.hsCode?.code ?? ''}`,
    `수량: ${fields.quantity} / 중량: ${fields.grossWeight}`,
    `금액: ${fields.currency} ${fields.totalAmount}`,
    `원산지: ${fields.originCountry}`,
    `적재항/양륙항: ${fields.loadPort} / ${fields.dischargePort}`,
    `컨테이너 번호: ${fields.containerNo}`,
    `예상 관세: ${data.duty?.totalTax.toLocaleString('ko-KR') ?? '-'}원`,
  ].join('\n');
}

export async function downloadImportDeclarationRequest(data: ImportDeclarationData): Promise<void> {
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;padding:64px;background:#fff;color:#111;font:16px/1.8 sans-serif;white-space:pre-wrap;';
  sheet.textContent = generateImportDeclarationRequest(data);
  document.body.appendChild(sheet);
  try {
    const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff' });
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imageHeight = canvas.height * pageWidth / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, imageHeight);
    pdf.save(`import_declaration_request_${data.fields.blNo || 'draft'}.pdf`);
  } finally {
    sheet.remove();
  }
}
