import type { RefObject } from 'react';

/**
 * 생성된 docx Blob을 미리보기 영역에 그린다 — 다운로드와 같은 Blob을 쓴다.
 * useEffect 안에서 호출하고 반환값을 정리 함수로 돌려준다.
 */
export function renderDocxPreview(
  getBlob: () => Promise<Blob | null>,
  hostRef: RefObject<HTMLElement>,
  render: (blob: Blob, host: HTMLElement) => Promise<void>,
  label: string,
): () => void {
  let cancelled = false;
  (async () => {
    try {
      const blob = await getBlob();
      const host = hostRef.current;
      if (!blob || cancelled || !host) return;
      await render(blob, host);
    } catch (error) {
      // 원인을 알 수 있게 콘솔에 남긴다(화면에는 짧은 안내만).
      console.error(`[${label} 미리보기] 생성 실패:`, error);
      const host = hostRef.current;
      if (host) host.innerHTML = `<p style="padding:16px;color:#b91c1c;">${label} 미리보기 생성에 실패했습니다.</p>`;
    }
  })();
  return () => { cancelled = true; };
}
