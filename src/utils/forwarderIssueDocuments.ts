import type { ForwarderCaseIssue } from '../types/forwarderCase';
import type { ImportDocumentMeta } from '../types/importTrade';

const ALIASES: Record<string, string[]> = {
  commercial_invoice: ['C/I', 'CI', 'Commercial Invoice', '상업송장'],
  packing_list: ['P/L', 'PL', 'Packing List', '포장명세서'],
  bill_of_lading: ['B/L', 'BL', 'Bill of Lading', '선하증권'],
  certificate_of_origin: ['C/O', 'CO', 'Certificate of Origin', '원산지증명서'],
  transport_request: ['Transport Request', 'Shipment Request', '운송의뢰서'],
  export_declaration: ['Export Declaration', '수출신고서'],
  insurance_policy: ['Insurance Policy', 'Insurance Certificate', '보험증권'],
};
const normalize = (value: string) => value.trim().toLowerCase().replace(/[\s/_-]/g, '');

/** Match explicit references only; unrelated attachments must not be called evidence. */
export function getIssueDocuments(issue: ForwarderCaseIssue, documents: ImportDocumentMeta[]): ImportDocumentMeta[] {
  const references = new Set(issue.documents.filter(Boolean).map(normalize));
  return documents.filter((document) => [document.id, document.sourceId, document.name, document.type, ...(ALIASES[document.type] ?? [])]
    .some((value) => value && references.has(normalize(value))));
}
