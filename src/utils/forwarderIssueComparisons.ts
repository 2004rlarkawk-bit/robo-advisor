import type { ForwarderCaseIssue } from '../types/forwarderCase';
import type { ImportComparisonRow } from '../types/importTrade';

const aliases: Record<string, string> = { grossWeight: '총중량', netWeight: '순중량', blNo: 'B/L 번호', invoiceNo: '송장 번호', vesselName: '선박명', packageCount: '포장 수량', originCountry: '원산지', hsCode: 'HS코드', quantity: '수량' };
const key = (value: string) => (aliases[value] ?? value).replace(/^IR\d+\.\s*/i, '').replace(/\s*(불일치|일치|확인|누락)$/, '').replace(/[\s/_-]/g, '').toLowerCase();

/** Only link the same named field; document overlap alone is not evidence. */
export function getIssueComparisons(issue: ForwarderCaseIssue, rows: ImportComparisonRow[]) {
  return rows.filter(row => key(row.field) !== '' && key(row.field) === key(issue.title));
}
