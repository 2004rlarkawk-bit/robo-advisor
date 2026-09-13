// vitest 공통 셋업 — 모든 테스트 파일 로드 전에 실행된다.
// vitest의 happy-dom 환경이 localStorage 전역을 제공하지 않아, 컴포넌트·서비스가
// import 시점이나 beforeEach에서 localStorage를 쓰면 undefined로 죽는다.
// 테스트 파일별 vi.hoisted 폴리필 중복을 없애기 위해 여기서 한 번만 주입한다.
const store = new Map<string, string>();

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
