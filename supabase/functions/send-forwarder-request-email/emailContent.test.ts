import { describe, expect, it } from 'vitest';
import { buildEmailHtml, emailSubject } from './emailContent';

const content = { requesterCompany: '테스트 포워더', direction: 'export' as const,
  loadPort: 'Busan', dischargePort: 'Shanghai', itemName: '장비', message: '<확인 요청>' };

describe('메일 종류별 제목과 본문', () => {
  it('기존 운송의뢰 문구를 유지한다', () => {
    expect(emailSubject('forwarder_request', '화주')).toContain('포워딩 의뢰');
    expect(buildEmailHtml({ ...content, deliveryKind: 'forwarder_request' })).toContain('해상운송을 의뢰드립니다');
  });
  it('선적완료 알림은 운송의뢰라고 표시하지 않는다', () => {
    const html = buildEmailHtml({ ...content, deliveryKind: 'shipment_notice' });
    expect(emailSubject('shipment_notice', '포워더')).toContain('선적 완료 안내');
    expect(html).toContain('선적 완료와 관련 서류');
    expect(html).not.toContain('해상운송을 의뢰드립니다');
    expect(html).toContain('&lt;확인 요청&gt;');
  });
  it('Shipping Advice를 별도 제목과 본문으로 보낸다', () => {
    expect(emailSubject('shipping_advice', '포워더')).toContain('Shipping Advice');
    expect(buildEmailHtml({ ...content, deliveryKind: 'shipping_advice' })).toContain('Shipping Advice와 관련 서류');
  });
});
