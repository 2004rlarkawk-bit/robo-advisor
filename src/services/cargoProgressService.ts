import { getCargoProgress } from './unipassService';
import type { CargoTrackingResult } from '../types/importTrade';

const STEPS = ['입항', '하선신고', '보세구역 반입', '수입신고', '검사 또는 심사', '수입신고 수리', '반출'];

export async function lookupImportCargo(blNo: string): Promise<CargoTrackingResult> {
  const result = await getCargoProgress(blNo);
  if (!result) {
    return {
      lookupStatus: 'empty',
      cargoNo: '',
      status: '조회 결과 없음',
      detail: '입력한 B/L 번호로 조회된 화물 통관 정보가 없습니다.',
      arrivalPort: '',
      timeline: STEPS.map((label) => ({ label, completed: false, current: false })),
    };
  }
  const currentIndex = Math.max(0, STEPS.findIndex((step) => result.status.includes(step)));
  return {
    lookupStatus: 'success',
    cargoNo: result.cargoNo,
    status: result.status,
    detail: result.progressDetail,
    arrivalPort: result.arrivalPort,
    source: result.source,
    timeline: STEPS.map((label, index) => ({ label, completed: index <= currentIndex, current: index === currentIndex })),
  };
}
