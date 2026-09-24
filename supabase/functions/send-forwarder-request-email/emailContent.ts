import type { DeliveryKind } from './validation.ts';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function emailSubject(kind: DeliveryKind, company: string): string {
  if (kind === 'shipment_notice') return `[선적 완료 안내] ${company || '포워더'} 선적 관련 서류`;
  if (kind === 'shipping_advice') return `[Shipping Advice] ${company || '포워더'} 선적 정보 및 서류`;
  return `[포워딩 의뢰] ${company || '화주'} 해상운송 의뢰 건`;
}

export function buildEmailHtml(params: {
  deliveryKind: DeliveryKind;
  requesterCompany: string;
  direction: 'export' | 'import';
  loadPort: string;
  dischargePort: string;
  itemName: string;
  message: string;
}): string {
  const directionLabel = params.direction === 'export' ? '수출' : '수입';
  const rows = [
    ['거래 유형', directionLabel], ['출발항', params.loadPort || '-'],
    ['도착항', params.dischargePort || '-'], ['품목', params.itemName || '-'],
  ].map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b;">${label}</td><td style="padding:4px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`).join('');
  const intro = params.deliveryKind === 'shipment_notice'
    ? `<p><strong>${escapeHtml(params.requesterCompany || '담당 포워더')}</strong>에서 선적 완료와 관련 서류를 안내드립니다.</p>`
    : params.deliveryKind === 'shipping_advice'
      ? `<p><strong>${escapeHtml(params.requesterCompany || '담당 포워더')}</strong>에서 Shipping Advice와 관련 서류를 전달드립니다.</p>`
      : `<p><strong>${escapeHtml(params.requesterCompany || '화주')}</strong>에서 아래 화물의 해상운송을 의뢰드립니다.</p>`;
  const documentNote = params.deliveryKind === 'forwarder_request'
    ? '자세한 내용은 첨부된 의뢰서 및 거래서류를 확인해 주세요.'
    : '선적 정보와 첨부된 H/B/L을 확인해 주세요.';
  return `
    <div style="font-family: -apple-system, sans-serif; color:#1e293b; line-height:1.6;">
      <p>안녕하세요.</p>
      ${intro}
      <table style="margin:16px 0;border-collapse:collapse;">${rows}</table>
      ${params.message ? `<p style="white-space:pre-wrap;">${escapeHtml(params.message)}</p>` : ''}
      <p>${documentNote}</p>
      <p>감사합니다.</p>
    </div>
  `;
}
