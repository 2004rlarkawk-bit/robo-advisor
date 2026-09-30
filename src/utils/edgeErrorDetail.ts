/**
 * Edge Function 오류에서 진짜 사유를 꺼낸다.
 *
 * supabase-js는 함수가 2xx가 아니면 본문을 읽지 않고
 * "Edge Function returned a non-2xx status code"만 던진다. 정작 왜 실패했는지는
 * 본문 JSON의 error에 들어 있어, 화면에는 아무 단서도 남지 않는다.
 * 응답(context)을 직접 읽어 그 문장을 돌려준다.
 */

interface EdgeErrorLike {
  message?: unknown;
  context?: { json?: () => Promise<unknown>; text?: () => Promise<unknown> } | unknown;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  const candidate = (error as EdgeErrorLike | null)?.message;
  return typeof candidate === 'string' && candidate ? candidate : '알 수 없는 오류';
}

/**
 * 본문에 사유가 있으면 그 문장을, 없으면 원래 메시지를 돌려준다.
 * 본문은 한 번만 읽을 수 있으므로 실패해도 다시 시도하지 않는다.
 */
export async function readEdgeErrorDetail(error: unknown): Promise<string> {
  const fallback = messageOf(error);
  const context = (error as EdgeErrorLike | null)?.context as
    { json?: () => Promise<unknown>; text?: () => Promise<unknown> } | undefined;
  if (!context) return fallback;

  try {
    if (typeof context.json === 'function') {
      const body = await context.json();
      const detail = (body as { error?: unknown } | null)?.error;
      if (typeof detail === 'string' && detail.trim()) return detail.trim();
    }
  } catch {
    // JSON이 아니면 아래에서 본문 텍스트로 한 번 더 시도한다.
  }

  try {
    if (typeof context.text === 'function') {
      const text = await context.text();
      if (typeof text === 'string' && text.trim()) return text.trim().slice(0, 300);
    }
  } catch {
    // 본문을 이미 읽었거나 읽을 수 없는 경우 — 원래 메시지를 쓴다.
  }

  return fallback;
}
