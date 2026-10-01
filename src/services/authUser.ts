import { supabase } from '../lib/supabase';

/** 로그인한 사용자의 id. 세션이 없으면 던진다. */
export async function getRequiredUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const userId = data.user?.id;
  if (!userId) throw new Error('로그인이 필요합니다.');
  return userId;
}
