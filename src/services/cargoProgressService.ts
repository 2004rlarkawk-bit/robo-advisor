import { getCargoProgress } from './unipassService';
import type { CargoTrackingResult } from '../types/importTrade';

const STEPS = ['입항', '하선신고', '보세구역 반입', '수입신고', '검사 또는 심사', '수입신고 수리', '반출'];

export async function lookupImportCargo(blNo: string): Promise<CargoTrackingResult> {
  const result = await getCargoProgress(blNo);
  if (!result) {
    return {
      lookupStatus: 'simulation',
      cargoNo: '',
      status: '보세구역 반입',
      detail: '실제 조회 결과가 없어 화면 검증용 시뮬레이션 진행 정보를 표시합니다.',
      arrivalPort: '부산항',
      source: 'simulation',
      timeline: STEPS.map((label, index) => ({ label, completed: index <= 2, current: index === 2 })),
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
