/**
 * 로그인한 사용자의 요청인지 확인한다.
 *
 * config.toml의 verify_jwt만으로는 부족하다 — anon 키 자체가 이 프로젝트가 서명한 유효한 JWT이고,
 * 그 키는 프론트엔드 번들에 그대로 실려 공개된다. 즉 URL과 anon 키만 알면 verify_jwt=true도 통과한다.
 * 그래서 Auth API에 토큰을 물어 "실제 사용자 토큰"인지까지 확인한다(anon 키는 사용자가 없어 401).
 *
 * supabase-js(npm:)를 쓰지 않고 fetch만 쓰는 이유: 이 폴더의 함수들은 vitest로 테스트하는데
 * npm: 지정자는 그 환경에서 해석되지 않는다.
 */

export interface VerifiedUser {
  id: string;
  email: string | null;
}

/** 검증 성공이면 사용자, 실패면 null. 네트워크·설정 오류도 null(= 차단)로 본다. */
export async function verifyRequestUser(request: Request): Promise<VerifiedUser | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !apiKey) {
    console.error('[auth] SUPABASE_URL 또는 키가 없어 사용자 검증을 할 수 없습니다.');
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: apiKey },
    });
    if (!response.ok) return null;
    const user = await response.json() as { id?: unknown; email?: unknown };
    if (typeof user.id !== 'string' || !user.id) return null;
    return { id: user.id, email: typeof user.email === 'string' ? user.email : null };
  } catch (error) {
    console.error('[auth] 사용자 검증 실패:', error instanceof Error ? error.message : error);
    return null;
  }
}
