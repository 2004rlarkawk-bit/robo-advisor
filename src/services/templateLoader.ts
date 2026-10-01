/**
 * 서식 파일을 한 번만 내려받아 재사용하는 로더를 만든다.
 * 실패하면 `${label} 로드 실패 (상태코드)`로 던진다.
 */
export function createTemplateLoader(url: string, label: string): () => Promise<ArrayBuffer> {
  let cache: ArrayBuffer | null = null;
  return async () => {
    if (cache) return cache;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${label} 로드 실패 (${response.status})`);
    cache = await response.arrayBuffer();
    return cache;
  };
}
