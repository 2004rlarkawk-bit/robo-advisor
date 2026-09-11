import { describe, expect, it } from 'vitest';
import { comparisonStatus, firstDocumentValue, formatForwarderDate, forwarderDateKey } from './forwarderPresentation';
import type { ImportComparisonRow } from '../types/importTrade';

describe('forwarder presentation integrity', () => {
  it('keeps complete OCR dates and never invents an incomplete year', () => {
    expect(formatForwarderDate('SEP. 20, 2026')).toBe('2026-09-20');
    expect(formatForwarderDate('2026-09-11T13:00:00Z')).toBe('2026-09-11');
    expect(formatForwarderDate('SEP. 20, 2')).toBe('SEP. 20, 2');
    expect(forwarderDateKey('SEP. 20, 2')).toBeNull();
    expect(forwarderDateKey('2026-02-30')).toBeNull();
    expect(forwarderDateKey('2028-02-29')).toBe('2028-02-29');
  });
  it('skips OCR placeholder names without treating a consignee as the importer', () => {
    expect(firstDocumentValue('-', '  ', 'INCHEON TECH')).toBe('INCHEON TECH');
    expect(firstDocumentValue('N/A', '—')).toBe('');
  });
  it('does not call a single-source or absent value a match', () => {
    const row: ImportComparisonRow = { field: 'currency', invoice: 'USD', packingList: '', billOfLading: '-', matches: true, detail: '' };
    expect(comparisonStatus(row)).toBe('single');
    expect(comparisonStatus({ ...row, invoice: 'N/A' })).toBe('missing');
    expect(comparisonStatus({ ...row, packingList: 'USD' })).toBe('match');
    expect(comparisonStatus({ ...row, packingList: 'EUR', matches: false })).toBe('mismatch');
  });
});
