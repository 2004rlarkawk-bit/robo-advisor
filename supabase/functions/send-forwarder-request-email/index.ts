import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { findMissingDocumentTypes, parseSendRequest } from './validation.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface TradeRow {
  id: string;
  user_id: string;
  direction: 'export' | 'import';
  form_data: Record<string, unknown> | null;
  document_data: { generatedDocuments?: Record<string, unknown> } | null;
}

function jsonPath(value: unknown, path: string[]): string {
  let current: unknown = value;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildEmailHtml(params: {
  requesterCompany: string;
  direction: 'export' | 'import';
  loadPort: string;
  dischargePort: string;
  itemName: string;
  message: string;
}): string {
  const directionLabel = params.direction === 'export' ? '수출' : '수입';
  const rows = [
    ['거래 유형', directionLabel],
    ['출발항', params.loadPort || '-'],
    ['도착항', params.dischargePort || '-'],
    ['품목', params.itemName || '-'],
  ]
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">${label}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`)
    .join('');

  return `
    <div style="font-family: -apple-system, sans-serif; color:#1e293b; line-height:1.6;">
      <p>안녕하세요.</p>
      <p><strong>${escapeHtml(params.requesterCompany || '화주')}</strong>에서 아래 화물의 해상운송을 의뢰드립니다.</p>
      <table style="margin:16px 0;border-collapse:collapse;">${rows}</table>
      ${params.message ? `<p style="white-space:pre-wrap;">${escapeHtml(params.message)}</p>` : ''}
      <p>자세한 내용은 첨부된 의뢰서 및 거래서류를 확인해 주세요.</p>
      <p>감사합니다.</p>
    </div>
  `;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const jwt = authorization.slice('Bearer '.length).trim();
  if (!jwt) return jsonResponse({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('FORWARDER_REQUEST_FROM_EMAIL');
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    console.error('[send-forwarder-request-email] 서버 환경변수 누락');
    return jsonResponse({ error: 'server_configuration_error' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: verificationError } = await admin.auth.getUser(jwt);
  if (verificationError || !userData.user) return jsonResponse({ error: 'unauthorized' }, 401);
  const requesterId = userData.user.id;

  let parsed;
  try {
    const body = await request.json();
    parsed = parseSendRequest(body);
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : 'invalid_request' }, 400);
  }

  // 소유권 확인: 클라이언트가 보낸 trade_id를 그대로 믿지 않고, 현재 인증된 사용자가
  // 실제로 소유한 거래인지 service-role 조회로 재검증한다.
  const { data: trade, error: tradeError } = await admin
    .from('trades')
    .select('id, user_id, direction, form_data, document_data')
    .eq('id', parsed.tradeId)
    .eq('user_id', requesterId)
    .maybeSingle<TradeRow>();
  if (tradeError) {
    console.error('[send-forwarder-request-email] trade 조회 실패:', tradeError.message);
    return jsonResponse({ error: 'send_failed' }, 500);
  }
  if (!trade) return jsonResponse({ error: 'trade_not_found' }, 404);

  // 요청된 각 문서가 실제 이 거래에 존재하는지 서버 데이터 기준으로 재확인한다
  // (클라이언트가 첨부했다고 주장하는 것을 그대로 믿지 않는다).
  const generatedDocuments = trade.document_data?.generatedDocuments ?? null;
  const missing = findMissingDocumentTypes(parsed.documents, generatedDocuments);
  if (missing.length > 0) {
    return jsonResponse({ error: 'document_not_found_for_trade' }, 400);
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('company_name, contact_name')
    .eq('id', requesterId)
    .maybeSingle<{ company_name: string | null; contact_name: string | null }>();

  const { data: insertedRow, error: insertError } = await admin
    .from('external_forwarder_requests')
    .insert({
      trade_id: trade.id,
      requester_user_id: requesterId,
      recipient_email: parsed.recipientEmail,
      recipient_company: parsed.recipientCompany || null,
      recipient_name: parsed.recipientName || null,
      message: parsed.message || null,
      sent_document_types: parsed.documents.map((d) => d.documentType),
      status: 'pending',
    })
    .select('id')
    .single<{ id: string }>();
  if (insertError || !insertedRow) {
    console.error('[send-forwarder-request-email] 이력 저장 실패:', insertError?.message);
    return jsonResponse({ error: 'send_failed' }, 500);
  }

  const loadPort = jsonPath(trade.form_data, ['shipment', 'loadPort']);
  const dischargePort = jsonPath(trade.form_data, ['shipment', 'dischargePort']);
  const itemName = jsonPath(trade.form_data, ['items', '0', 'description']);
  const requesterCompany = profile?.company_name?.trim() || '';

  const html = buildEmailHtml({
    requesterCompany,
    direction: trade.direction,
    loadPort,
    dischargePort,
    itemName,
    message: parsed.message,
  });

  try {
    const resendResponse = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [parsed.recipientEmail],
        subject: `[포워딩 의뢰] ${requesterCompany || '화주'} 해상운송 의뢰 건`,
        html,
        attachments: parsed.documents.map((document) => ({
          filename: document.fileName,
          content: document.dataUrl.slice(document.dataUrl.indexOf(',') + 1),
        })),
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      throw new Error(`resend_http_${resendResponse.status}: ${errorText.slice(0, 500)}`);
    }

    await admin
      .from('external_forwarder_requests')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', insertedRow.id);

    return jsonResponse({ ok: true, id: insertedRow.id });
  } catch (err) {
    console.error('[send-forwarder-request-email] Resend 발송 실패:', err instanceof Error ? err.message : err);
    await admin
      .from('external_forwarder_requests')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: 'email_provider_error',
      })
      .eq('id', insertedRow.id);
    return jsonResponse({ error: 'send_failed' }, 502);
  }
});
