import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

if (!isSupabaseConfigured) {
  const missing = [
    !supabaseUrl && 'VITE_SUPABASE_URL',
    !supabasePublishableKey && 'VITE_SUPABASE_PUBLISHABLE_KEY',
  ].filter(Boolean).join(', ');
  console.error(
    `[Supabase] 환경변수 미설정: ${missing}. .env 파일 또는 GitHub Actions Secrets에 값을 등록하세요. ` +
    `현재 세션은 인증·DB 기능 없이 실행됩니다.`
  );
}

function createStub(): SupabaseClient {
  const notConfiguredError = () =>
    Promise.reject(new Error('Supabase 미설정: VITE_SUPABASE_URL 및 VITE_SUPABASE_PUBLISHABLE_KEY 를 확인하세요.'));
  const chain: unknown = new Proxy(function () {}, {
    get: () => chain,
    apply: notConfiguredError,
  });
  return chain as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabasePublishableKey!)
  : createStub();