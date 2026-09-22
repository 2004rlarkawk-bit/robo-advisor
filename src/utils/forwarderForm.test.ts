import { describe, expect, it } from 'vitest';
import {
  createEmptyForwarderFormState,
  forwarderFormToTradeProfile,
  isEtaBeforeEtd,
  missingBookingFields,
  tradeProfileToForwarderFormState,
} from './forwarderForm';

describe('포워더 입력 검증과 저장 매핑', () => {
  it('Booking No.·선박명·항차번호가 모두 있어야 부킹 완료로 본다', () => {
    expect(forwarderFormToTradeProfile({
      ...createEmptyForwarderFormState(), bookingNo: '', bookingStatus: 'confirmed',
    }).bookingStatus).toBe('requested');
    // 선박명·항차번호가 없으면 Booking No.만으로는 완료가 아니다.
    expect(forwarderFormToTradeProfile({
      ...createEmptyForwarderFormState(), bookingNo: 'BK-100', bookingStatus: 'confirmed',
    }).bookingStatus).toBe('requested');
    expect(forwarderFormToTradeProfile({
      ...createEmptyForwarderFormState(), bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: '0012E', bookingStatus: 'requested',
    }).bookingStatus).toBe('confirmed');
  });

  it('부킹 완료에 필요한데 비어 있는 항목만 돌려준다', () => {
    expect(missingBookingFields({ bookingNo: '', vesselOrFlight: '', voyageNo: '' }))
      .toEqual(['Booking No.', '선박명(Vessel)', '항차번호(Voyage No.)']);
    expect(missingBookingFields({ bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: ' ' }))
      .toEqual(['항차번호(Voyage No.)']);
    expect(missingBookingFields({ bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: '0012E' }))
      .toEqual([]);
  });

  it('ETA가 ETD보다 빠르면 오류다', () => {
    expect(isEtaBeforeEtd('2026-08-10', '2026-08-09')).toBe(true);
    expect(isEtaBeforeEtd('2026-08-10', '2026-08-11')).toBe(false);
  });

  it('운송의뢰·예약·컨테이너·화물 필드를 TradeProfile 경계에서 왕복 보존한다', () => {
    const state = {
      ...createEmptyForwarderFormState(),
      companyName: 'Forwarder Customer',
      itemName: 'Machine Parts',
      exportDeclarationNo: 'EXP-1',
      invoiceNo: 'INV-1',
      incoterms: 'FOB' as const,
      requestedDepartureDate: '2026-08-20',
      shippingMarks: 'ABC / BUSAN',
      bookingNo: 'BK-1',
      vesselOrFlight: 'HMM ALGECIRAS',
      voyageNo: '0012E',
      bookingStatus: 'confirmed' as const,
      loadingMode: 'LCL' as const,
      containerSize: '40HC' as const,
      containerQuantity: 2,
    };
    const restored = tradeProfileToForwarderFormState(forwarderFormToTradeProfile(state));
    expect(restored).toMatchObject({
      ...state,
      cargoItems: [expect.objectContaining({
        descriptionOfGoods: 'Machine Parts',
        marksAndNumbers: 'ABC / BUSAN',
      })],
    });
  });

  it('구버전 프로필에 신규 필드가 없어도 안전한 기본값으로 복원한다', () => {
    const profile = forwarderFormToTradeProfile(createEmptyForwarderFormState());
    delete profile.requestedDepartureDate;
    delete profile.loadingMode;
    delete profile.shippingMarks;
    expect(tradeProfileToForwarderFormState(profile)).toMatchObject({
      requestedDepartureDate: '', loadingMode: '', shippingMarks: '',
    });
  });

  it('구버전 컨테이너 데이터에 운송방식이 없으면 FCL로 복원한다', () => {
    const profile = forwarderFormToTradeProfile(createEmptyForwarderFormState());
    delete profile.loadingMode;
    profile.containerNo = 'CONT-1';
    expect(tradeProfileToForwarderFormState(profile).loadingMode).toBe('FCL');
  });
});
