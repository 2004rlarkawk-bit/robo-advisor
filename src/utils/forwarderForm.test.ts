import { describe, expect, it } from 'vitest';
import { createEmptyForwarderFormState, isBookingNumberRequired, isEtaBeforeEtd } from './forwarderForm';

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
});
