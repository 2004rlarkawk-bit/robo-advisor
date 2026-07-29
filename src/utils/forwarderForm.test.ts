import { describe, expect, it } from 'vitest';
import {
  createEmptyForwarderFormState,
  forwarderFormToTradeProfile,
  isBookingNumberRequired,
  isEtaBeforeEtd,
  tradeProfileToForwarderFormState,
} from './forwarderForm';

describe('포워더 입력 검증', () => {
  it('부킹 확정 상태에서 Booking No.가 없으면 필수 오류다', () => {
    expect(isBookingNumberRequired({ ...createEmptyForwarderFormState(), bookingStatus: 'confirmed' })).toBe(true);
    expect(isBookingNumberRequired({ ...createEmptyForwarderFormState(), bookingStatus: 'confirmed', bookingNo: 'BK-100' })).toBe(false);
  });

  it('부킹 요청 상태에서는 Booking No.가 없어도 된다', () => {
    expect(isBookingNumberRequired(createEmptyForwarderFormState())).toBe(false);
  });

  it('ETA가 ETD보다 빠르면 오류다', () => {
    expect(isEtaBeforeEtd('2026-08-10', '2026-08-09')).toBe(true);
    expect(isEtaBeforeEtd('2026-08-10', '2026-08-11')).toBe(false);
  });

  it('부킹·적재 필드를 TradeProfile 경계에서 왕복 보존한다', () => {
    const state = {
      ...createEmptyForwarderFormState(),
      companyName: 'Forwarder Customer',
      itemName: 'Machine Parts',
      exportDeclarationNo: 'EXP-1',
      bookingNo: 'BK-1',
      bookingStatus: 'confirmed' as const,
      loadingMode: 'LCL' as const,
      containerSize: '40HC' as const,
      containerQuantity: 2,
    };
    expect(tradeProfileToForwarderFormState(forwarderFormToTradeProfile(state))).toMatchObject(state);
  });
});
