/** null이 아닌 객체인지 — 외부 응답(JSON)을 읽기 전에 좁힌다. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
