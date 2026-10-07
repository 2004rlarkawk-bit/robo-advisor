import type { RefObject } from 'react';

/** 오류에서 사람이 읽을 원인 한 줄 — docxtemplater 묶음 오류는 첫 설명을 꺼낸다. */
export function describePreviewError(error: unknown): string {
  const nested = (error as { properties?: { errors?: Array<{ properties?: { explanation?: string } }> } })
    ?.properties?.errors?.[0]?.properties?.explanation;
  const message = nested || (error instanceof Error ? error.message : String(error ?? ''));
  return message.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

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
  const attempt = async () => {
    const blob = await getBlob();
    const host = hostRef.current;
    if (!blob || cancelled || !host) return;
    await render(blob, host);
  };
  (async () => {
    try {
      await attempt();
    } catch (firstError) {
      // 데이터가 바뀌어 새 미리보기가 시작됐으면, 지난 시도의 실패로 새 미리보기를 덮지 않는다.
      if (cancelled) return;
      console.warn(`[${label} 미리보기] 첫 시도 실패, 한 번 더 시도합니다:`, firstError);
      try {
        await attempt();
      } catch (error) {
        if (cancelled) return;
        console.error(`[${label} 미리보기] 생성 실패:`, error);
        const host = hostRef.current;
        if (host) {
          // 원인을 작게 함께 보여 준다 — 캡처 한 장으로 무엇이 막혔는지 알 수 있게.
          host.innerHTML = `<p style="padding:16px 16px 4px;color:#b91c1c;">${label} 미리보기 생성에 실패했습니다.</p>`
            + `<p style="padding:0 16px 16px;color:#64748b;font-size:12px;">원인: ${escapeHtml(describePreviewError(error)) || '알 수 없음'}</p>`;
        }
      }
    }
  })();
  return () => { cancelled = true; };
}
