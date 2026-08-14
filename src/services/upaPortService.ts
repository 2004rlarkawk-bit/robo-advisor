/**
 * 울산항만공사(UPA) 공공데이터 — 울산항 선박 입출항 현황.
 * Edge Function(upa-port-schedule) 경유로 호출하고, 미배포·키 미설정 시엔
 * 시뮬레이션 데이터로 폴백한다(카드에 '시뮬레이션' 배지 표기).
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type UpaDataSource = 'api' | 'simulation';

export interface UpaVesselRow {
  vesselName: string;
  schedule: string;    // 입항(예정) 일시 등 원문 그대로
  prevPort: string;    // 직전 기항지
  tonnage: string;     // 총톤수 등 규모 정보
  source: UpaDataSource;
}

interface UpaFunctionResponse {
  success?: boolean;
  items?: Record<string, unknown>[];
  error?: unknown;
}

// 데이터셋마다 태그명이 달라 후보 키 목록으로 관대하게 매핑한다.
const pick = (item: Record<string, unknown>, keys: string[]): string => {
  for (const k of keys) {
    const v = item[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const NAME_KEYS = ['vsslNm', 'shipNm', 'vesselNm', 'shipNam', 'vsslNam', 'sname', 'shipName'];
const TIME_KEYS = ['etaDt', 'entrDt', 'ibPrtDt', 'inDt', 'etryDt', 'eta', 'arvlDt', 'noticeDt', 'aplyDt'];
const PORT_KEYS = ['prevPortNm', 'befPrtNm', 'lastPortNm', 'prtNm', 'fromPort', 'startPortNm'];
const TON_KEYS = ['grsTonnage', 'gt', 'tonnage', 'grossTon', 'grtWt'];

function normalize(items: Record<string, unknown>[]): UpaVesselRow[] {
  return items
    .map((item) => ({
      vesselName: pick(item, NAME_KEYS),
      schedule: pick(item, TIME_KEYS),
      prevPort: pick(item, PORT_KEYS),
      tonnage: pick(item, TON_KEYS),
      source: 'api' as const,
    }))
    .filter((row) => row.vesselName !== '');
}

// 데모·개발용 시뮬레이션 — 실제 울산항 취항 선형을 참고한 가상 데이터
function simulatedRows(): UpaVesselRow[] {
  const base = new Date();
  const day = (offset: number) => {
    const d = new Date(base.getTime() + offset * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  return [
    { vesselName: 'HYUNDAI SINGAPORE', schedule: `${day(0)} 14:00 입항 예정`, prevPort: 'SINGAPORE', tonnage: '94,511t', source: 'simulation' },
    { vesselName: 'KOTC ULSAN PIONEER', schedule: `${day(1)} 06:30 입항 예정`, prevPort: 'KUWAIT', tonnage: '58,300t', source: 'simulation' },
    { vesselName: 'PAN OCEAN GRACE', schedule: `${day(1)} 21:00 입항 예정`, prevPort: 'QINGDAO, CHINA', tonnage: '32,714t', source: 'simulation' },
    { vesselName: 'STOLT SAKURA', schedule: `${day(2)} 09:15 입항 예정`, prevPort: 'YOKOHAMA, JAPAN', tonnage: '25,213t', source: 'simulation' },
    { vesselName: 'GAS VITALITY', schedule: `${day(3)} 11:40 입항 예정`, prevPort: 'HOUSTON, USA', tonnage: '113,000t', source: 'simulation' },
  ];
}

/** 울산항 입출항 현황 조회 — 실패 시 시뮬레이션 폴백(항상 데이터를 돌려준다). */
export async function getUpaPortSchedule(numOfRows = 8): Promise<UpaVesselRow[]> {
  if (!isSupabaseConfigured) return simulatedRows();
  try {
    const { data, error } = await supabase.functions.invoke<UpaFunctionResponse>(
      'upa-port-schedule',
      { body: { numOfRows } }
    );
    if (error) throw error;
    if (!data || data.success !== true || !Array.isArray(data.items)) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'UPA 응답 형식 오류');
    }
    const rows = normalize(data.items);
    if (rows.length === 0) throw new Error('UPA 응답에 선박 정보 없음');
    return rows.slice(0, numOfRows);
  } catch (err) {
    console.warn('[UPA] 울산항 입출항 조회 실패 — 시뮬레이션 폴백:', err);
    return simulatedRows();
  }
}
