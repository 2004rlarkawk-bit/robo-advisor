import { describe, it, expect } from 'vitest';
import { composeDetailedDescription, shipperItemToTradeItem } from './shipment';
import type { ShipperItem } from '../types';

const item = (overrides: Partial<ShipperItem> = {}): ShipperItem => ({
  id: '1',
  itemName: 'Ballpoint Pen',
  hsCode: '9608101000',
  quantity: 100,
  unit: 'EA',
  unitPrice: 1.5,
  currency: 'USD',
  ...overrides,
});

describe('composeDetailedDescription', () => {
  it('상세 정보를 품명 뒤에 붙인다', () => {
    expect(composeDetailedDescription('Ballpoint Pen', 'Blue Ink')).toBe('Ballpoint Pen, Blue Ink');
  });

  it('상세 정보가 없으면 품명을 그대로 쓴다', () => {
    expect(composeDetailedDescription('Ballpoint Pen', '')).toBe('Ballpoint Pen');
    expect(composeDetailedDescription('Ballpoint Pen', undefined)).toBe('Ballpoint Pen');
    expect(composeDetailedDescription('Ballpoint Pen', '   ')).toBe('Ballpoint Pen');
  });

  it('앞뒤 쉼표·공백은 정리한다', () => {
    expect(composeDetailedDescription('Ballpoint Pen', ' , Blue Ink , ')).toBe('Ballpoint Pen, Blue Ink');
  });

  it('품명에 이미 들어 있는 상세 정보는 중복해서 붙이지 않는다', () => {
    expect(composeDetailedDescription('Blue Ink Ballpoint Pen', 'Blue Ink')).toBe('Blue Ink Ballpoint Pen');
    expect(composeDetailedDescription('Blue Ink Ballpoint Pen', 'blue ink')).toBe('Blue Ink Ballpoint Pen');
  });

  it('품명이 비면 상세 정보만 남긴다', () => {
    expect(composeDetailedDescription('', 'Blue Ink')).toBe('Blue Ink');
  });
});

describe('shipperItemToTradeItem', () => {
  it('기본 품명과 상세 품명을 함께 만든다', () => {
    const converted = shipperItemToTradeItem(item({ detail: 'Blue Ink' }));
    // 포장명세서·선하증권용
    expect(converted.description).toBe('Ballpoint Pen');
    // 상업송장용
    expect(converted.detailedDescription).toBe('Ballpoint Pen, Blue Ink');
  });

  it('상세 정보가 없으면 두 품명이 같다', () => {
    const converted = shipperItemToTradeItem(item());
    expect(converted.description).toBe('Ballpoint Pen');
    expect(converted.detailedDescription).toBe('Ballpoint Pen');
  });
});
