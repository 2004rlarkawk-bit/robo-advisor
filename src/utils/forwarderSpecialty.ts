/**
 * 포워더 담당자 특화 분야 목록. DB의 user_profiles.forwarder_specialties 체크 제약과 같은 키를 쓴다.
 * 프로필 서비스에서도 불러 쓰므로 이 파일은 다른 서비스에 의존하지 않는다.
 */

export const FORWARDER_SPECIALTIES = [
  { key: 'route_cn', group: 'route', label: '중국 항로' },
  { key: 'route_us', group: 'route', label: '미국 항로' },
  { key: 'route_jp', group: 'route', label: '일본 항로' },
  { key: 'route_vn', group: 'route', label: '베트남 항로' },
  { key: 'route_eu', group: 'route', label: '유럽 항로' },
  { key: 'cargo_lcl', group: 'cargo', label: 'LCL 콘솔' },
  { key: 'cargo_cold', group: 'cargo', label: '콜드체인' },
  { key: 'cargo_dg', group: 'cargo', label: '위험물' },
  { key: 'cargo_air', group: 'cargo', label: '항공 운송' },
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
