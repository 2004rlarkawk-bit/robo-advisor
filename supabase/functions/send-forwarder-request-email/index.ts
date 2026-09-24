import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { findMissingDocumentTypes, parseSendRequest } from './validation.ts';
import { buildEmailHtml, emailSubject } from './emailContent.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';

interface TradeRow {
  id: string;
  user_id: string;
  direction: 'export' | 'import';
  role: 'shipper' | 'forwarder';
  status: string;
  workflow_data: { exportForwarderCase?: { completedAt?: string | null } } | null;
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
    .select('id, user_id, direction, role, status, workflow_data, form_data, document_data')
    .eq('id', parsed.tradeId)
    .eq('user_id', requesterId)
    .maybeSingle<TradeRow>();
  if (tradeError) {
    console.error('[send-forwarder-request-email] trade 조회 실패:', tradeError.message);
    return jsonResponse({ error: 'send_failed' }, 500);
  }
  if (!trade) return jsonResponse({ error: 'trade_not_found' }, 404);
  if (parsed.deliveryKind !== 'forwarder_request' && (trade.direction !== 'export' || trade.role !== 'forwarder' || trade.status !== 'submitted' || !trade.workflow_data?.exportForwarderCase?.completedAt)) {
    return jsonResponse({ error: 'shipment_not_completed' }, 400);
  }

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

  const historyTable = parsed.deliveryKind === 'forwarder_request'
    ? 'external_forwarder_requests' : 'forwarder_document_deliveries';
  const historyRow = {
    trade_id: trade.id,
    recipient_email: parsed.recipientEmail,
    recipient_company: parsed.recipientCompany || null,
    recipient_name: parsed.recipientName || null,
    message: parsed.message || null,
    sent_document_types: parsed.documents.map((d) => d.documentType),
    status: 'pending',
    ...(parsed.deliveryKind === 'forwarder_request'
      ? { requester_user_id: requesterId }
      : { sender_user_id: requesterId, delivery_kind: parsed.deliveryKind }),
  };
  const { data: insertedRow, error: insertError } = await admin
    .from(historyTable)
    .insert(historyRow)
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
    deliveryKind: parsed.deliveryKind,
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
        subject: emailSubject(parsed.deliveryKind, requesterCompany),
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
      .from(historyTable)
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', insertedRow.id);

    return jsonResponse({ ok: true, id: insertedRow.id });
  } catch (err) {
    console.error('[send-forwarder-request-email] Resend 발송 실패:', err instanceof Error ? err.message : err);
    await admin
      .from(historyTable)
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        error_message: 'email_provider_error',
      })
      .eq('id', insertedRow.id);
    return jsonResponse({ error: 'send_failed' }, 502);
  }
});
