/**
 * 배포 뒤 열려 있던 탭이 사라진 조각 파일(chunk)을 불러오다 실패하면 페이지를 한 번 새로고침한다.
 *
 * 화면별 코드는 따로 나뉜 조각 파일(예: exportDeclarationDocxService-해시.js)로 필요할 때 내려받는다.
 * 다시 배포하면 파일 이름의 해시가 바뀌고 옛 파일은 지워져서, 배포 전에 연 탭에서는
 * 미리보기·화면 이동이 '가끔' 실패한다. Vite가 이때 보내는 vite:preloadError를 받아
 * 새 index.html을 다시 받게 한다. 새로고침 직후 또 실패하면(진짜 네트워크 문제 등) 반복하지 않는다.
 */
const RELOAD_KEY = 'portai:stale-chunk-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

interface ReloadDeps {
  now: () => number;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  reload: () => void;
}

/** 새로고침했으면 true. 직전에 이미 새로고침했으면 false(오류를 그대로 흘려보낸다). */
export function reloadOnceForStaleChunk(deps: ReloadDeps): boolean {
  let last = 0;
  try {
    last = Number(deps.storage?.getItem(RELOAD_KEY) ?? 0) || 0;
  } catch {
    last = 0;
  }
  if (deps.now() - last < RELOAD_COOLDOWN_MS) return false;
  try {
    deps.storage?.setItem(RELOAD_KEY, String(deps.now()));
  } catch {
    // 저장소를 못 쓰면 반복 방지 없이 한 번만 새로고침한다.
  }
  deps.reload();
  return true;
}

export function installStaleChunkReload(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('vite:preloadError', (event) => {
    let storage: Storage | null = null;
    try {
      storage = window.sessionStorage;
    } catch {
      storage = null;
    }
    const reloaded = reloadOnceForStaleChunk({
      now: () => Date.now(),
      storage,
      reload: () => window.location.reload(),
    });
    if (reloaded) event.preventDefault();
  });
}
