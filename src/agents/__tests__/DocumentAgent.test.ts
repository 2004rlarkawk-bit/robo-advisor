import { describe, it, expect } from 'vitest';
import { DocumentAgent } from '../DocumentAgent';
import { escapeHtml } from '../templates/escapeHtml';
import { HSCodeResult, AgentLog } from '../types';
import { TradeProfile } from '../../types';

const hsResult: HSCodeResult = {
  topCode: '8471.30',
  candidates: [],
  status: 'valid',
  formattedCode: '8471.30',
  validationMessage: '유효한 HS CODE 형식입니다.'
};

const baseProfile: TradeProfile = {
  tradeType: 'export',
  itemName: '노트북',
  hsCode: '8471300000',
  loadPort: '부산항',
  dischargePort: 'LA항',
  incoterms: 'FOB',
  quantity: 100,
  weight: 2400,
  departureDate: '2026-07-10',
  arrivalDate: '2026-07-25',
  companyName: '인천테크',
  contact: '010-0000-0000'
};

async function runAgent(overrides: Partial<TradeProfile> = {}) {
  const logs: AgentLog[] = [];
  const agent = new DocumentAgent();
  return agent.run({
    profile: { ...baseProfile, ...overrides },
    hsResult,
    useLLM: false,
    logs
  });
}

describe('DocumentAgent — 인보이스·패킹리스트 중량 일관성', () => {
  it('grossWeight가 빈 문자열이면 weight로 폴백해 두 문서의 총중량이 일치한다', async () => {
    // 앱 초기 상태(App.tsx)에서 grossWeight 기본값은 '' — 과거에는 ??로 인해 PL 총중량이 0이 됐다
    const result = await runAgent({ grossWeight: '', netWeight: '' });

    const invoice = result.generatedDocs.invoice!;
    const packingList = result.generatedDocs.packingList!;

    expect(packingList.grossWeight).toBe(2400);
    expect(packingList.totalGrossWeight).toBe(2400);
    expect(invoice.items[0].grossWeight).toBe(2400);
    expect(packingList.grossWeight).toBe(invoice.items[0].grossWeight);
  });

  it('사용자가 입력한 순중량이 패킹리스트에 그대로 반영된다 (0.9 추정치로 대체 금지)', async () => {
    const result = await runAgent({ grossWeight: '', netWeight: 2200 });

    const invoice = result.generatedDocs.invoice!;
    const packingList = result.generatedDocs.packingList!;

    expect(packingList.netWeight).toBe(2200);
    expect(packingList.totalNetWeight).toBe(2200);
    expect(invoice.items[0].netWeight).toBe(2200);
  });

  it('순중량 미입력 시에만 총중량 × 0.9 추정치를 사용한다', async () => {
    const result = await runAgent({ grossWeight: 2400, netWeight: '' });

    const packingList = result.generatedDocs.packingList!;
    expect(packingList.netWeight).toBe(2160); // 2400 × 0.9
  });
});

describe('DocumentAgent — 인보이스 금액 일관성', () => {
  it('단가만 입력하고 총액을 비우면 금액 = 단가 × 수량', async () => {
    // 과거에는 단가는 사용자 값, 금액은 중량 기반 추정치가 들어가 "단가 × 수량 ≠ 금액"이었다
    const result = await runAgent({ unitPrice: 55, totalAmount: '' });

    const invoice = result.generatedDocs.invoice!;
    expect(invoice.items[0].unitPrice).toBe(55);
    expect(invoice.items[0].amount).toBe(5500); // 55 × 100
    expect(invoice.totalAmount).toBe(5500);
  });

  it('사용자가 총액을 입력하면 그대로 사용한다', async () => {
    const result = await runAgent({ unitPrice: 55, totalAmount: 6000 });

    const invoice = result.generatedDocs.invoice!;
    expect(invoice.totalAmount).toBe(6000);
    expect(invoice.items[0].amount).toBe(6000);
  });

  it('단가·총액 미입력 시 추정 단가로 금액을 일관 계산한다', async () => {
    const result = await runAgent({ unitPrice: '', totalAmount: '' });

    const invoice = result.generatedDocs.invoice!;
    const expectedUnitPrice = Math.round((2400 * 2.5) / 100 * 100) / 100; // 60
    expect(invoice.items[0].unitPrice).toBe(expectedUnitPrice);
    expect(invoice.totalAmount).toBe(expectedUnitPrice * 100);
  });
});

describe('DocumentAgent — Buyer 영문 국가 연결', () => {
  it('Buyer 국가를 같은 buyer 객체와 인보이스 HTML에 전달한다', async () => {
    const result = await runAgent({
      buyerName: 'Global Import LLC',
      buyerAddress: '250 Market Street, Los Angeles, CA',
      buyerCountry: 'United States',
    });

    expect(result.generatedDocs.invoice?.buyer?.country).toBe('United States');
    expect(result.htmlTemplates?.invoice).toContain('United States');
  });
});

describe('문서 템플릿 XSS 방어', () => {
  it('escapeHtml이 HTML 특수문자를 모두 치환한다', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml(`"quote" & 'apos'`)).toBe('&quot;quote&quot; &amp; &#39;apos&#39;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(1234)).toBe('1234');
  });

  it('품목명에 스크립트를 넣어도 생성된 HTML에서 이스케이프된다', async () => {
    const result = await runAgent({ itemName: '<script>alert("xss")</script>' });

    const html = result.htmlTemplates?.invoice ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('회사명·주소에 HTML 태그를 넣어도 이스케이프된다', async () => {
    const result = await runAgent({
      companyName: '<img src=x onerror=alert(1)>테크',
      companyAddress: '"서울" & <부산>'
    });

    const invoiceHtml = result.htmlTemplates?.invoice ?? '';
    const plHtml = result.htmlTemplates?.packing_list ?? '';

    for (const html of [invoiceHtml, plHtml]) {
      expect(html).not.toContain('<img src=x');
      expect(html).toContain('&lt;img src=x');
    }
  });
});
