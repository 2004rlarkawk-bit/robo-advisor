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

  it('순중량 미입력 시 추정하지 않고 0으로 둔다 (실측 신고값 — 총중량×0.9 금지)', async () => {
    const result = await runAgent({ grossWeight: 2400, netWeight: '' });

    const packingList = result.generatedDocs.packingList!;
    expect(packingList.netWeight).toBe(0);
    expect(packingList.totalNetWeight).toBe(0);
    // 총중량은 그대로 유지(순중량 추정과 무관)
    expect(packingList.grossWeight).toBe(2400);
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

  it('단가·총액 미입력 시 가격을 지어내지 않고 0으로 둔다 (추정 단가 금지)', async () => {
    // 통관 문서에 가짜 단가를 넣지 않는다 — 미입력은 0, 누락은 validatorEngine이 막는다.
    const result = await runAgent({ unitPrice: '', totalAmount: '' });

    const invoice = result.generatedDocs.invoice!;
    expect(invoice.items[0].unitPrice).toBe(0);
    expect(invoice.items[0].amount).toBe(0);
    expect(invoice.totalAmount).toBe(0);
  });
});

describe('DocumentAgent — 문서번호 건(shipment) 단위 파생·안정성', () => {
  const shipProfile: Partial<TradeProfile> = {
    tradeType: 'export',
    incoterms: 'CIF',
    documentNo: 'DOC-20260727-123456',
    countryOfOrigin: 'REPUBLIC OF KOREA',
  };

  it('모든 서류번호가 documentNo 시퀀스(2026-123456)에서 파생된다', async () => {
    const r = await runAgent(shipProfile);
    const inv = r.generatedDocs.invoice! as any;
    const pl = r.generatedDocs.packingList! as any;
    const co = r.generatedDocs.certificateOfOrigin! as any;
    const ins = r.generatedDocs.insurance! as any;

    expect(inv.invoiceNo).toBe('INV-2026-123456');
    expect(pl.plNo).toBe('PL-2026-123456');
    expect(co.coNo).toBe('CO-2026-123456');
    expect(co.certNo).toBe('CO-2026-123456');
    expect(ins.certNo).toBe('INS-2026-123456');
    // 교차참조도 같은 invoiceNo를 가리킨다
    expect(pl.invoiceNo).toBe(inv.invoiceNo);
  });

  it('같은 documentNo로 재생성해도 모든 번호가 유지된다', async () => {
    const a = await runAgent(shipProfile);
    const b = await runAgent(shipProfile);
    expect((b.generatedDocs.invoice as any).invoiceNo).toBe((a.generatedDocs.invoice as any).invoiceNo);
    expect((b.generatedDocs.packingList as any).plNo).toBe((a.generatedDocs.packingList as any).plNo);
    expect((b.generatedDocs.certificateOfOrigin as any).certNo).toBe((a.generatedDocs.certificateOfOrigin as any).certNo);
    expect((b.generatedDocs.insurance as any).certNo).toBe((a.generatedDocs.insurance as any).certNo);
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
