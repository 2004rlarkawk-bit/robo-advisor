import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;
const requestsByClient = new Map<string, number[]>();

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRateLimited(request: Request): boolean {
  const client = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('cf-connecting-ip')
    || 'unknown';
  const now = Date.now();
  const recent = (requestsByClient.get(client) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true;
  recent.push(now);
  requestsByClient.set(client, recent);
  return false;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  if (isRateLimited(request)) return jsonResponse({ error: 'too_many_requests' }, 429);

  let email: string;
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== 'object' || typeof (body as { email?: unknown }).email !== 'string') {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }
    email = normalizeEmail((body as { email: string }).email);
  } catch {
    return jsonResponse({ error: 'invalid_request' }, 400);
  }

  if (!isValidEmail(email) || email.length > 254) return jsonResponse({ error: 'invalid_email' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'server_configuration_error' }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('[check-email-exists] Auth lookup failed:', error.message);
      return jsonResponse({ error: 'lookup_failed' }, 500);
    }
    if (data.users.some((user) => normalizeEmail(user.email ?? '') === email)) return jsonResponse({ exists: true });
    if (data.users.length < perPage) return jsonResponse({ exists: false });
    page += 1;
  }
});
