import { describe, expect, it } from 'vitest';
import type { ShipperItem } from '../types';
import {
  calculateShipperItemAmount,
  EMPTY_GOODS_DESCRIPTION_MESSAGE,
  getGoodsDescriptionValidationMessage,
  isGrossWeightBelowNet,
  NON_ENGLISH_GOODS_DESCRIPTION_MESSAGE,
  summarizeShipperItems,
} from './shipperForm';

const item = (currency: ShipperItem['currency'], quantity: number, unitPrice: number): ShipperItem => ({
  id: `${currency}-${quantity}`,
  itemName: '테스트 품목',
  hsCode: '',
  quantity,
  unit: 'EA',
  unitPrice,
  currency,
});

describe('화주 품목 금액 계산', () => {
  it('수량과 단가를 곱해 품목 금액을 계산한다', () => {
    expect(calculateShipperItemAmount(item('USD', 3, 12.5))).toBe(37.5);
  });

  it('통화가 같으면 Invoice 총액을 계산한다', () => {
    expect(summarizeShipperItems([item('USD', 2, 10), item('USD', 3, 20)])).toEqual({
      mixedCurrencies: false,
      currency: 'USD',
      total: 80,
    });
  });

  it('통화가 섞이면 단순 합산하지 않는다', () => {
    expect(summarizeShipperItems([item('USD', 2, 10), item('KRW', 3, 20)])).toEqual({
      mixedCurrencies: true,
      currency: null,
      total: null,
    });
  });

  it('총중량이 순중량보다 작으면 경고 대상으로 판정한다', () => {
    expect(isGrossWeightBelowNet(90, 100)).toBe(true);
    expect(isGrossWeightBelowNet(100, 90)).toBe(false);
  });

  it('모든 품목의 영문 품명을 문서 생성 전에 검증한다', () => {
    expect(getGoodsDescriptionValidationMessage([
      item('USD', 1, 1),
      { ...item('USD', 1, 1), id: 'empty', itemName: '' },
    ])).toBe(EMPTY_GOODS_DESCRIPTION_MESSAGE);
    expect(getGoodsDescriptionValidationMessage([
      { ...item('USD', 1, 1), itemName: 'Cotton 티셔츠' },
    ])).toBe(NON_ENGLISH_GOODS_DESCRIPTION_MESSAGE);
    expect(getGoodsDescriptionValidationMessage([
      { ...item('USD', 1, 1), itemName: 'Cotton T-shirts' },
      { ...item('USD', 1, 1), id: 'second', itemName: 'Kitchen Tongs' },
    ])).toBeNull();
  });
});
