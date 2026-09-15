import { describe, expect, it } from 'vitest';
import type { ShipperItem } from '../types';
import { findMissingShipperRequiredInputs, missingShipperInputsMessage } from './shipperForm';

const item = (o: Partial<ShipperItem> = {}): ShipperItem => ({
  id: 'i1', itemName: 'Coat', hsCode: '', quantity: 2, unit: 'EA', unitPrice: 10, currency: 'USD', ...o,
});
const filled = { companyName: 'ABC', contact: '010', partnerName: 'Buyer', incoterms: 'FOB' as const };

describe('필요 서류 자동 생성 전 필수 입력 확인', () => {
  it('아무것도 입력하지 않으면 폼 순서대로 빈 항목을 모으고 첫 항목 외 N개로 안내한다', () => {
    const missing = findMissingShipperRequiredInputs(
      { companyName: '', contact: '', partnerName: '', incoterms: '' as never },
      [item({ itemName: '', quantity: '', unitPrice: '' })],
    );
    expect(missing.map((m) => m.field)).toEqual(['companyName', 'contact', 'partnerName', 'itemName', 'quantity', 'unitPrice', 'incoterms']);
    expect(missingShipperInputsMessage(missing)).toBe('회사명 외 6개 항목을 입력해 주세요.');
  });

  it('하나만 비면 그 항목 이름으로, 모두 채우면 빈 목록', () => {
    const one = findMissingShipperRequiredInputs({ ...filled, contact: ' ' }, [item()]);
    expect(missingShipperInputsMessage(one)).toBe('회사 연락처 항목을 입력해 주세요.');
    expect(findMissingShipperRequiredInputs(filled, [item()])).toEqual([]);
    expect(missingShipperInputsMessage([])).toBe('');
  });
});
