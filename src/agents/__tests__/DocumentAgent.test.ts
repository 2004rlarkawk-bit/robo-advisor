import { describe, it, expect, vi } from 'vitest';
// 수출신고서 FOB용 관세청 환율 호출은 결정론적으로 mock (네트워크 미접촉).
// importActual로 customsApiService의 다른 export(calcDutiableValue 등)는 real 유지.
vi.mock('../../services/customsApiService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/customsApiService')>()),
  getCustomsExchangeRate: vi.fn().mockResolvedValue({
    rate: 1478.44, currency: 'USD', source: 'simulation', tradeType: 'export', effectiveDate: '2026-07-26',
  }),
}));
import { DocumentAgent } from '../DocumentAgent';
import { checkPackingInvoiceConsistency } from '../complianceRules';
import { escapeHtml } from '../templates/escapeHtml';
import { HSCodeResult, AgentLog } from '../types';
import { TradeProfile, TradeItem } from '../../types';
import { mapPackingListToSchema, renderPackingListPreviewHtml } from '../../services/packingListXlsxService';
import { mapPackingListToDocxSchema } from '../../services/packingListDocxService';
import { mapInvoiceToSchema } from '../../services/invoiceDocxService';

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
  // items를 비워 넘기면 DocumentAgent가 프로필 단일 품목으로 폴백한다(레거시 단일품목 경로 검증).
  return agent.run({
    shipment: { profile: { ...baseProfile, ...overrides }, items: [] },
    hsResult,
    useLLM: false,
    logs
  });
}

const mkItem = (o: Partial<TradeItem> = {}): TradeItem => ({
  description: 'ITEM', hsCode: '8471300000', quantity: 10, unit: 'EA', unitPrice: 5,
  extractedAmount: undefined, netWeight: 0, grossWeight: 0, measurement: '',
  packageCount: 0, packageUnit: '', shippingMarks: undefined, ...o,
});
async function runMulti(items: TradeItem[], overrides: Partial<TradeProfile> = {}) {
  return new DocumentAgent().run({
    shipment: { profile: { ...baseProfile, ...overrides }, items },
    hsResult, useLLM: false, logs: [],
  });
}

describe('DocumentAgent — 다품목(C2) 파이프라인', () => {
  it('품목 단위는 한국어 라벨 없이 영문 저장값 그대로 문서에 전달한다', async () => {
    const result = await runMulti([
      mkItem({ unit: 'PAIR' }),
      mkItem({ unit: 'DOZ' }),
    ]);

    expect(result.generatedDocs.invoice?.items.map((item) => item.unit)).toEqual(['PAIR', 'DOZ']);
    expect(result.generatedDocs.packingList?.items.map((item) => item.unit)).toEqual(['PAIR', 'DOZ']);
  });

  it('여러 품목이 인보이스·패킹리스트에 모두 반영된다(폼 입력 유실 없음)', async () => {
    const r = await runMulti([
      mkItem({ description: 'A', quantity: 10, unitPrice: 5 }),
      mkItem({ description: 'B', quantity: 3, unitPrice: 100 }),
      mkItem({ description: 'C', quantity: 2, unitPrice: 50 }),
    ]);
    expect(r.generatedDocs.invoice!.items.length).toBe(3);
    expect(r.generatedDocs.packingList!.items.length).toBe(3);
    // 총액 = Σ(수량×단가) = 50 + 300 + 100 = 450 (amount는 저장 않고 계산)
    expect(r.generatedDocs.invoice!.totalAmount).toBe(450);
    expect(r.generatedDocs.invoice!.items.map(i => i.description)).toEqual(['A', 'B', 'C']);
  });

  it('extractedAmount가 있으면 그 값을, 없으면 수량×단가를 amount로 쓴다', async () => {
    const r = await runMulti([
      mkItem({ quantity: 10, unitPrice: 5, extractedAmount: 999 }), // 추출값 우선
      mkItem({ quantity: 4, unitPrice: 25 }),                        // 계산 100
    ]);
    expect(r.generatedDocs.invoice!.items[0].amount).toBe(999);
    expect(r.generatedDocs.invoice!.items[1].amount).toBe(100);
    expect(r.generatedDocs.invoice!.totalAmount).toBe(1099);
  });

  it('물류필드(순/총중량·용적)는 입력 경로 전까지 공란 — 문서레벨·첫품목 값으로 채우지 않는다', async () => {
    // 프로필엔 중량이 있어도 canonical 품목이 공란이면 공란 유지(junk 기본값 재발 방지)
    const r = await runMulti([mkItem({ netWeight: 0, grossWeight: 0 })], { netWeight: 2200, grossWeight: 2400 });
    expect(r.generatedDocs.packingList!.items[0].netWeight).toBe(0);
    expect(r.generatedDocs.packingList!.items[0].grossWeight).toBe(0);
  });
});

describe('DocumentAgent — 인보이스·패킹리스트 중량 일관성', () => {
  it('포장종류는 한국어 라벨 없이 영문 저장값 그대로 Packing List에 전달한다', async () => {
    const result = await runAgent({ packageCount: 4, packageType: 'SACK' });

    expect(result.generatedDocs.invoice?.packageType).toBe('SACK');
    expect(result.generatedDocs.packingList?.packageType).toBe('SACK');
    expect(mapPackingListToDocxSchema(result.generatedDocs.packingList!).items[0].packages).toBe('4 SACK');
  });

  it('박스당 수량(eaPerBox) 입력 시 boxes×eaPerBox가 인보이스 수량과 대조되어 R10이 실제로 발동한다', async () => {
    // 포장 수량(packageCount=박스 수) 4 × 박스당 수량(eaPerBox) 20 = 80 ≠ 인보이스 수량 100
    const result = await runAgent({ quantity: 100, packageCount: 4, eaPerBox: 20 });

    // 화주 폼 입력이 패킹리스트 품목까지 흘러간다(죽은 필드였던 경로 활성화)
    expect(result.generatedDocs.packingList?.items[0].packageCount).toBe(4);
    expect(result.generatedDocs.packingList?.items[0].eaPerBox).toBe(20);

    // 패킹리스트 XLSX G열(eaPerBox)·H열(boxes)도 실값으로 채워진다
    const schema = mapPackingListToSchema(result.generatedDocs.packingList!);
    expect(schema.items[0].eaPerBox).toBe(20);
    expect(schema.items[0].boxes).toBe(4);

    // R10: 80 ≠ 100 → 경고 발동
    const issues = checkPackingInvoiceConsistency(result.generatedDocs.invoice!, result.generatedDocs.packingList!);
    expect(issues.map((i) => i.id)).toContain('r10-packing-qty-mismatch');
  });

  it('eaPerBox 미입력이면 R10 대조는 여전히 건너뛴다(오탐 방지 유지)', async () => {
    const result = await runAgent({ quantity: 100, packageCount: 4 }); // eaPerBox 없음

    const issues = checkPackingInvoiceConsistency(result.generatedDocs.invoice!, result.generatedDocs.packingList!);
    expect(issues.map((i) => i.id)).not.toContain('r10-packing-qty-mismatch');
  });

  it('수출 Invoice Date는 레거시 입력값이 아니라 실제 생성일을 사용한다', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 14, 9, 30, 0));

    const result = await runAgent({ invoiceDate: '2020-01-01' });

    expect(result.generatedDocs.invoice?.invoiceDate).toBe('2026-08-14');
    expect(result.generatedDocs.packingList?.invoiceDate).toBe('2026-08-14');
    expect(result.generatedDocs.customsDeclaration?.invoiceDate).toBe('2026-08-14');
    vi.useRealTimers();
  });

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

describe('DocumentAgent — L/C 필드 파생 가드 + 주소 유추 금지', () => {
  it('비신용장(T/T) 결제면 profile.lcNo가 있어도 인보이스·패킹 L/C를 강제 공란 처리한다', async () => {
    const r = await runAgent({ paymentTerms: 'T/T', lcNo: 'LC-88-2026', lcBank: 'KEB HANA BANK', lcDate: '2026-07-15' });
    const inv = r.generatedDocs.invoice! as any;
    const pl = r.generatedDocs.packingList! as any;
    expect(inv.lcNo).toBe('');
    expect(pl.lcNo).toBe('');
    expect(pl.lcBank).toBe('');
    expect(pl.lcDate).toBe('');
  });

  it('L/C 결제면 profile.lcNo가 그대로 파생된다', async () => {
    const r = await runAgent({ paymentTerms: 'L/C AT SIGHT', lcNo: 'LC-2026-0001', lcBank: 'WOORI BANK' });
    const pl = r.generatedDocs.packingList! as any;
    expect(pl.lcNo).toBe('LC-2026-0001');
    expect(pl.lcBank).toBe('WOORI BANK');
  });

  it('consignee 주소는 입력값(partnerAddress)만 쓰고 도착항을 섞지 않는다', async () => {
    const r = await runAgent({
      tradeType: 'export',
      dischargePort: 'OSAKA, JAPAN',
      partnerName: 'TOKYO IMPORT LTD',
      partnerAddress: '5-2 TSUKIJI, CHUO-KU, TOKYO',
    });
    const consignee = (r.generatedDocs.invoice as any).consignee;
    expect(consignee.address).toBe('5-2 TSUKIJI, CHUO-KU, TOKYO');
    expect(consignee.address).not.toContain('OSAKA'); // 도착항 유추 유입 없음
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

    expect(inv.invoiceNo).toBe('INV-2026-123456');
    expect(pl.plNo).toBe('PL-2026-123456');
    // 교차참조도 같은 invoiceNo를 가리킨다
    expect(pl.invoiceNo).toBe(inv.invoiceNo);
    // C/O는 상공회의소, 적하보험증권은 보험사 발급 — 화주가 생성하지 않는다.
    expect(r.generatedDocs.certificateOfOrigin).toBeUndefined();
    expect(r.generatedDocs.insurance).toBeUndefined();
  });

  it('같은 documentNo로 재생성해도 모든 번호가 유지된다', async () => {
    const a = await runAgent(shipProfile);
    const b = await runAgent(shipProfile);
    expect((b.generatedDocs.invoice as any).invoiceNo).toBe((a.generatedDocs.invoice as any).invoiceNo);
    expect((b.generatedDocs.packingList as any).plNo).toBe((a.generatedDocs.packingList as any).plNo);
  });
});

describe('DocumentAgent — Buyer 영문 국가 연결', () => {
  it('Buyer 국가를 같은 buyer 객체와 인보이스 DOCX payload에 전달한다', async () => {
    const result = await runAgent({
      buyerName: 'Global Import LLC',
      buyerAddress: '250 Market Street, Los Angeles, CA',
      buyerCountry: 'United States',
    });

    expect(result.generatedDocs.invoice?.buyer?.country).toBe('United States');
    // 인보이스는 DOCX 고정 템플릿을 사용하므로
    // Buyer 국가가 DOCX 스키마까지 전달되는지 확인한다.
    const schema = mapInvoiceToSchema(result.generatedDocs.invoice!);
    expect(schema.buyer_address3).toBe('United States');
  });
});

describe('DocumentAgent — 수출 화주 신규 문서 필드', () => {
  it('수출 운송의뢰서를 화주 입력값으로 만들고 포워더 확정 정보는 포함하지 않는다', async () => {
    const result = await runMulti([
      mkItem({ description: 'Cotton Shirts', hsCode: '6105100000', quantity: 20, unit: 'PCS', packageCount: 2, packageUnit: 'CARTON', netWeight: 18, grossWeight: 20, measurement: '0.25' }),
    ], {
      companyName: 'KOREA EXPORT CO.', companyAddress: 'Seoul, Korea', contactName: 'KIM', contact: 'export@example.com',
      partnerName: 'GLOBAL BUYER', partnerAddress: 'Tokyo, Japan', notifyPartyName: 'NOTIFY LTD.',
      businessRegistrationNo: '123-45-67890', paymentTerms: 'T/T', invoiceNo: 'INV-REF-1',
      loadPort: 'BUSAN', dischargePort: 'TOKYO', departureDate: '2026-08-20', loadingMode: 'LCL',
      bookingNo: 'SHOULD-NOT-APPEAR', vesselOrFlight: 'SHOULD-NOT-APPEAR', blNo: 'SHOULD-NOT-APPEAR',
      containerNo: 'SHOULD-NOT-APPEAR', sealNo: 'SHOULD-NOT-APPEAR',
      shipperSupplemental: { incotermsPlace: 'BUSAN' } as any,
    });

    const tr = result.generatedDocs.transportRequest!;
    expect(tr.requestNo).toMatch(/^TR-/);
    expect(tr.exporter.name).toBe('KOREA EXPORT CO.');
    expect(tr.consignee.name).toBe('GLOBAL BUYER');
    expect(tr.items[0]).toMatchObject({ description: 'Cotton Shirts', unit: 'PCS', packageType: 'CARTON' });
    expect(tr.loadingMode).toBe('LCL');
    expect(tr.incotermsPlace).toBe('BUSAN');
    expect(tr).not.toHaveProperty('bookingNo');
    expect(tr).not.toHaveProperty('vesselName');
    expect(tr).not.toHaveProperty('blNo');
    expect(tr).not.toHaveProperty('containerNo');
    expect(result.htmlTemplates?.transport_request).toContain('EXPORT TRANSPORT REQUEST');
    expect(result.htmlTemplates?.transport_request).not.toContain('SHOULD-NOT-APPEAR');
  });

  it('영문 품명·기타 참조번호·Vessel·서명자를 C/I와 P/L에 함께 전달한다', async () => {
    const result = await runAgent({
      signedBy: 'KIM JIMIN',
      otherReferences: 'PO-2026-77',
      vesselOrFlight: 'OCEAN STAR V.1001',
      shipperItems: [{
        id: 'primary-item',
        itemName: 'Cotton T-shirts',
        hsCode: '6109100000',
        quantity: 20,
        unit: 'EA',
        unitPrice: 15,
        currency: 'USD',
      }, {
        id: 'second-item',
        itemName: 'Stainless Steel Kitchen Tongs',
        hsCode: '8215990000',
        quantity: 10,
        unit: 'EA',
        unitPrice: 8,
        currency: 'USD',
      }],
    });

    const invoice = result.generatedDocs.invoice!;
    const packingList = result.generatedDocs.packingList!;

    expect(invoice.items[0].description).toBe('Cotton T-shirts');
    expect(invoice.items[1].description).toBe('Stainless Steel Kitchen Tongs');
    expect(packingList.items[0].description).toBe('Cotton T-shirts');
    expect(packingList.items[1].description).toBe('Stainless Steel Kitchen Tongs');

    expect((invoice as any).otherReferences).toBe('PO-2026-77');
    expect((packingList as any).otherReferences).toBe('PO-2026-77');
    expect((invoice as any).vessel).toBe('OCEAN STAR V.1001');
    expect((packingList as any).vessel).toBe('OCEAN STAR V.1001');

    // 서명란은 자동 채움하지 않고 공란으로 둔다(실제 서명자가 직접 기재).
    expect(invoice.signedBy).toBe('');
    expect((packingList as any).signedBy).toBe('');
  });

  it('단일 itemName 값을 문서 품명으로 그대로 사용한다', async () => {
    const result = await runAgent({
      shipperItems: [{
        id: 'primary-item',
        itemName: 'Sample Goods',
        hsCode: '8471300000',
        quantity: 1,
        unit: 'EA',
        unitPrice: 10,
        currency: 'USD',
      }],
    });

    expect(result.generatedDocs.invoice?.items[0].description).toBe('Sample Goods');
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

  // 상업송장(docx)·패킹리스트(xlsx)는 고정 템플릿이라 HTML XSS 대상이 아니다.
  // 패킹리스트 미리보기 HTML은 다운로드 xlsx와 같은 스키마로 렌더되므로, 그 미리보기에서 이스케이프를 검증한다.
  const packingPreview = (pl: any) => renderPackingListPreviewHtml(mapPackingListToSchema(pl));

  it('품목명에 스크립트를 넣어도 패킹리스트 미리보기 HTML에서 이스케이프된다', async () => {
    const result = await runAgent({ itemName: '<script>alert("xss")</script>' });

    const html = packingPreview(result.generatedDocs.packingList!);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('회사명·주소에 HTML 태그를 넣어도 패킹리스트 미리보기 HTML에서 이스케이프된다', async () => {
    const result = await runAgent({
      companyName: '<img src=x onerror=alert(1)>테크',
      companyAddress: '"서울" & <부산>'
    });

    const plHtml = packingPreview(result.generatedDocs.packingList!);
    expect(plHtml).not.toContain('<img src=x');
    expect(plHtml).toContain('&lt;img src=x');
  });
});
