import { getCargoProgress } from './unipassService';
import type { CargoTrackingResult } from '../types/importTrade';

const STEPS = ['입항', '하선신고', '보세구역 반입', '수입신고', '검사 또는 심사', '수입신고 수리', '반출'];

// 시연·테스트 서류 세트의 B/L — 실제 UNI-PASS에 존재하지 않는 번호이므로
// 해당 번호에 한해 시뮬레이션 진행 현황을 돌려준다(화면에 시뮬레이션 배지 표시).
const DEMO_PROGRESS: Record<string, { cargoNo: string; status: string; detail: string; arrivalPort: string }> = {
  SNKO026KR12345: {
    cargoNo: 'KRPU2026091100821',
    status: '수입신고 수리',
    detail: '수입신고가 수리되어 보세구역 반출을 기다리고 있습니다.',
    arrivalPort: '인천항',
  },
};

function buildTimeline(status: string) {
  const currentIndex = Math.max(0, STEPS.findIndex((step) => status.includes(step)));
  return STEPS.map((label, index) => ({ label, completed: index <= currentIndex, current: index === currentIndex }));
}

export async function lookupImportCargo(blNo: string): Promise<CargoTrackingResult> {
  const demo = DEMO_PROGRESS[blNo.trim().toUpperCase()];
  if (demo) {
    return {
      lookupStatus: 'simulation',
      cargoNo: demo.cargoNo,
      status: demo.status,
      detail: demo.detail,
      arrivalPort: demo.arrivalPort,
      source: 'simulation',
      timeline: buildTimeline(demo.status),
    };
  }

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
  return {
    lookupStatus: 'success',
    cargoNo: result.cargoNo,
    status: result.status,
    detail: result.progressDetail,
    arrivalPort: result.arrivalPort,
    source: result.source,
    timeline: buildTimeline(result.status),
  };
}
