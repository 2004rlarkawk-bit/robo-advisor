/**
 * 내려받는 모든 서류의 파일 이름 규칙: PortAI_<문서명>_<월.일>[.확장자]
 * 예) PortAI_commercial.invoice_09.15.docx
 */
export const PORTAI_DOCUMENT_NAMES = {
  invoice: 'commercial.invoice',
  packing_list: 'packing.list',
  customs_dec: 'export.declaration',
  import_declaration: 'import.declaration',
  import_declaration_request: 'import.declaration.request',
  bl: 'bill.of.lading',
  transport_request: 'shipping.instruction',
  co: 'certificate.of.origin',
  insurance: 'insurance.policy',
  arrival_notice: 'arrival.notice',
} as const;

export type PortaiDocumentKey = keyof typeof PORTAI_DOCUMENT_NAMES;

export function portaiFileName(document: PortaiDocumentKey | string, extension = '', date: Date = new Date()): string {
  const name = PORTAI_DOCUMENT_NAMES[document as PortaiDocumentKey] ?? String(document).replace(/[_\s]+/g, '.');
  const mmdd = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const ext = extension.replace(/^\./, '');
  return `PortAI_${name}_${mmdd}${ext ? `.${ext}` : ''}`;
}
