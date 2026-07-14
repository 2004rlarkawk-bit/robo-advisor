import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const jwt = authorization.slice('Bearer '.length).trim();
  if (!jwt) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'server_configuration_error' }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: verificationError } = await admin.auth.getUser(jwt);
  if (verificationError || !userData.user) return jsonResponse({ error: 'unauthorized' }, 401);

  // 삭제 대상은 요청 body가 아니라 검증된 JWT에서만 가져옵니다.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    console.error('[delete-account] Auth user deletion failed:', deleteError.message);
    return jsonResponse({ error: 'delete_failed' }, 500);
  }
  return jsonResponse({ deleted: true });
});
