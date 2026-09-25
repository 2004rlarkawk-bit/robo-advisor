/**
 * 포워더 담당자 특화 분야 목록. DB의 user_profiles.forwarder_specialties 체크 제약과 같은 키를 쓴다.
 * 프로필 서비스에서도 불러 쓰므로 이 파일은 다른 서비스에 의존하지 않는다.
 */

export const FORWARDER_SPECIALTIES = [
  { key: 'route_cn', group: 'route', label: '중국 항로' },
  { key: 'route_us', group: 'route', label: '미국 항로' },
  { key: 'route_jp', group: 'route', label: '일본 항로' },
  { key: 'route_vn', group: 'route', label: '베트남 항로' },
  { key: 'route_sea', group: 'route', label: '동남아 항로' },
  { key: 'route_twhk', group: 'route', label: '대만·홍콩 항로' },
  { key: 'route_in', group: 'route', label: '인도·서남아 항로' },
  { key: 'route_eu', group: 'route', label: '유럽 항로' },
  { key: 'route_me', group: 'route', label: '중동 항로' },
  { key: 'route_cis', group: 'route', label: '러시아·CIS 항로' },
  { key: 'route_latam', group: 'route', label: '중남미 항로' },
  { key: 'cargo_fcl', group: 'cargo', label: 'FCL 만재' },
  { key: 'cargo_lcl', group: 'cargo', label: 'LCL 콘솔' },
  { key: 'cargo_cold', group: 'cargo', label: '콜드체인' },
  { key: 'cargo_dg', group: 'cargo', label: '위험물' },
  { key: 'cargo_air', group: 'cargo', label: '항공 운송' },
  { key: 'cargo_oog', group: 'cargo', label: '중량물·특수화물' },
  { key: 'cargo_express', group: 'cargo', label: '특송·이커머스' },
] as const;

export type ForwarderSpecialtyKey = (typeof FORWARDER_SPECIALTIES)[number]['key'];
export type ForwarderSpecialtyGroup = (typeof FORWARDER_SPECIALTIES)[number]['group'];

export const FORWARDER_SPECIALTY_GROUP_LABEL: Record<ForwarderSpecialtyGroup, string> = {
  route: '항로',
  cargo: '화물',
};

const SPECIALTY_KEYS = new Set<string>(FORWARDER_SPECIALTIES.map((item) => item.key));

export function isForwarderSpecialtyKey(value: unknown): value is ForwarderSpecialtyKey {
  return typeof value === 'string' && SPECIALTY_KEYS.has(value);
}

/** DB·폼에서 온 값을 알려진 키만, 중복 없이, 정의 순서대로 남긴다. */
export function normalizeSpecialties(values: unknown): ForwarderSpecialtyKey[] {
  if (!Array.isArray(values)) return [];
  const picked = new Set(values.filter(isForwarderSpecialtyKey));
  return FORWARDER_SPECIALTIES.map((item) => item.key).filter((key) => picked.has(key));
}

export function specialtyLabel(key: string): string {
  return FORWARDER_SPECIALTIES.find((item) => item.key === key)?.label ?? key;
}

/**
 * 목록에 없는 분야를 담당자가 직접 적는 칸.
 *
 * 미리 만든 목록은 자동 배정에 쓰려고 키를 고정해 둔 것이라 마음대로 늘릴 수 없다.
 * 하지만 실제 업무는 목록보다 넓다(반송·삼국간 무역·전시화물처럼). 그래서 직접 쓴 분야는
 * 따로 저장해 화주에게 "그 외 취급 분야"로 보여준다 — 자동 배정 점수에는 들어가지 않는다.
 * 시스템은 거래 정보(항구·HS부호·적재 방식)에서 조건을 뽑아내는데, 직접 쓴 말은
 * 거래 정보에서 뽑아낼 방법이 없기 때문이다.
 */
export const CUSTOM_SPECIALTY_MAX_COUNT = 5;
export const CUSTOM_SPECIALTY_MAX_LENGTH = 20;

/** 공백 정리 → 빈 값·너무 긴 값 제거 → 대소문자 무시 중복 제거 → 개수 제한. */
export function normalizeCustomSpecialties(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    // 줄바꿈·연속 공백은 한 칸으로 —  칩 하나가 여러 줄로 늘어지지 않게.
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (!trimmed || trimmed.length > CUSTOM_SPECIALTY_MAX_LENGTH) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= CUSTOM_SPECIALTY_MAX_COUNT) break;
  }
  return result;
}
