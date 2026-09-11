/**
 * ACK 2026 논문용 정량 실험.
 *
 * 실험 1 — 오류 주입 검출률: 정상(perfect) 거래 프로파일에 실무에서 흔한 오류를
 *   1건씩 주입한 시나리오를 만들고, 검증 파이프라인(필수 입력 검증 + 서류 검증 +
 *   컴플라이언스 규칙 + 서류 간 교차검증 + HS 분류 대조)이 각 오류를 검출하는지 측정한다.
 *   오탐 확인을 위해 정상 프로파일의 검출 건수(=0이어야 함)도 함께 기록한다.
 *
 * 실험 2 — 수입 서류 자동 분류 정확도: 실무 파일명 변형에 대해
 *   classifyImportDocumentName의 분류 정확도를 측정한다.
 *
 * 실행: npx vitest run src/test/ack2026Experiment.test.ts
 * 결과는 콘솔 표로 출력된다(논문 <표> 작성용).
 */
import { describe, it, expect } from 'vitest';
import type { TradeProfile, InvoiceData, PackingListData, ValidationIssue } from '../types';
import { createPerfectTestProfile } from '../services/devTestDataService';
import { validateRequiredInputs, validateTradeDocuments } from '../harness/validatorEngine';
import {
  runComplianceRules,
  checkPackingInvoiceConsistency,
  checkHsChapterMismatch,
} from '../agents/complianceRules';
import { classifyImportDocumentName } from '../services/importDocumentAnalysisService';
import { HSCodeAgent } from '../agents/HSCodeAgent';
import type { ImportDocumentType } from '../types/importTrade';

function baseProfile(): TradeProfile {
  return createPerfectTestProfile({} as TradeProfile, new Date('2026-08-20T09:00:00+09:00'));
}

function runDetectors(p: TradeProfile): ValidationIssue[] {
  const seen = new Set<string>();
  const all = [
    ...validateRequiredInputs(p),
    ...validateTradeDocuments(p),
    ...runComplianceRules(p),
  ];
  return all.filter(i => {
    const k = `${i.id}|${i.field}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

interface Scenario {
  category: string;
  name: string;
  mutate: (p: TradeProfile) => void;
  /** 검출로 인정할 조건: 주입 필드/규칙과 관련된 이슈가 있어야 한다 */
  match: (issues: ValidationIssue[]) => boolean;
}

const byField = (...fields: string[]) => (issues: ValidationIssue[]) =>
  issues.some(i => fields.includes(String(i.field)));
const byRule = (...ids: string[]) => (issues: ValidationIssue[]) =>
  issues.some(i => ids.some(id => i.id.startsWith(id)));

const SCENARIOS: Scenario[] = [
  // A. 필수 항목 누락
  { category: '필수 항목 누락', name: '품명 누락', mutate: p => { p.itemName = ''; p.shipperItems = []; }, match: byField('itemName') },
  { category: '필수 항목 누락', name: '수량 누락', mutate: p => { p.quantity = '' as any; if (p.shipperItems?.[0]) p.shipperItems[0].quantity = '' as any; }, match: byField('quantity') },
  { category: '필수 항목 누락', name: '중량 누락', mutate: p => { p.weight = '' as any; p.grossWeight = '' as any; p.netWeight = '' as any; }, match: byField('weight', 'grossWeight', 'netWeight') },
  { category: '필수 항목 누락', name: '선적항 누락', mutate: p => { p.loadPort = ''; }, match: byField('loadPort', 'ports') },
  { category: '필수 항목 누락', name: '도착항 누락(CIF 거래)', mutate: p => { p.incoterms = 'CIF' as any; p.insuranceConfirmed = true; p.dischargePort = ''; if (p.shipperSupplemental) p.shipperSupplemental.incotermsPlace = 'Los Angeles Port'; }, match: byField('dischargePort', 'ports') },
  { category: '필수 항목 누락', name: '수출자 상호 누락', mutate: p => { p.companyName = ''; }, match: byField('companyName') },
  { category: '필수 항목 누락', name: '인코텀즈 누락', mutate: p => { p.incoterms = '' as any; }, match: byField('incoterms', 'ports') },
  { category: '필수 항목 누락', name: '단가 누락', mutate: p => { p.unitPrice = '' as any; if (p.shipperItems?.[0]) p.shipperItems[0].unitPrice = '' as any; }, match: byField('unitPrice', 'totalAmount', 'invoiceAmount') },

  // B. 금액·논리 오류
  { category: '금액·논리 오류', name: '금액 산술 불일치(수량×단가≠총액)', mutate: p => { p.totalAmount = 20000 as any; p.invoiceAmount = 20000 as any; }, match: byRule('r8-amount-arithmetic') },
  { category: '금액·논리 오류', name: '총중량<순중량 역전', mutate: p => { p.grossWeight = 400 as any; p.netWeight = 450 as any; p.weight = 400 as any; }, match: byField('grossWeight', 'netWeight', 'weight') },
  { category: '금액·논리 오류', name: '출항일 연도 오타(2030년)', mutate: p => { p.departureDate = '2030-08-27'; p.arrivalDate = '2030-09-10'; }, match: byRule('r2-departure') },
  { category: '금액·논리 오류', name: '선적항=도착항 동일', mutate: p => { p.dischargePort = 'Busan Port'; p.placeOfDelivery = 'Busan, Korea'; p.finalDestination = 'Busan, Korea'; }, match: byRule('r13-identical-ports', 'r5-same-country-ports') },
  { category: '금액·논리 오류', name: '수출 원산지가 외국(복붙 실수)', mutate: p => { p.countryOfOrigin = 'China'; }, match: byRule('r15-origin-not-korea') },
  { category: '금액·논리 오류', name: '포괄 품명("Goods")', mutate: p => { p.itemName = 'Goods'; if (p.shipperItems?.[0]) p.shipperItems[0].itemName = 'Goods'; }, match: byRule('r16-generic-item-name', 'r1-itemname') },

];

describe('ACK 2026 실험 1 — 오류 주입 검출률', () => {
  it('정상 프로파일 오탐(false positive) 측정', () => {
    const issues = runDetectors(baseProfile());
    const errors = issues.filter(i => i.severity === 'error');
    console.log(`\n[기준선] 정상 프로파일 검출 이슈: error ${errors.length}건, ` +
      `전체 ${issues.length}건 ${issues.map(i => i.id).join(', ') || '(없음)'}`);
    expect(errors.length).toBe(0);
  });

  it('오류 주입 시나리오 검출률', async () => {
    const rows: { 분류: string; 시나리오: string; 검출: string; 검출규칙: string }[] = [];
    const perCat = new Map<string, { hit: number; total: number }>();

    for (const s of SCENARIOS) {
      const p = baseProfile();
      s.mutate(p);
      const issues = runDetectors(p);
      const hit = s.match(issues);
      const fired = issues.map(i => i.id).slice(0, 4).join(', ');
      rows.push({ 분류: s.category, 시나리오: s.name, 검출: hit ? 'O' : 'X', 검출규칙: fired });
      const c = perCat.get(s.category) || { hit: 0, total: 0 };
      c.total += 1; if (hit) c.hit += 1;
      perCat.set(s.category, c);
    }

    // D. 서류 간 교차검증(수량·품명) — 생성된 서류 데이터 기반
    const invoice = {
      seller: { name: 'Test Export Co., Ltd.', address: '', contact: '' },
      consignee: { name: 'Test Import Company', address: '', contact: '' },
      invoiceNo: 'INV-2026-001', invoiceDate: '2026-08-20', currency: 'USD',
      incoterms: 'FOB', loadPort: 'Busan Port', dischargePort: 'Los Angeles Port',
      departureDate: '2026-08-27', arrivalDate: '2026-09-10', totalAmount: 25000,
      items: [{ description: "Women's Cashmere Coats", quantity: 100, unitPrice: 250, amount: 25000 }],
    } as unknown as InvoiceData;
    const mkPl = (eaPerBox: number, desc: string): PackingListData => ({
      seller: invoice.seller, consignee: invoice.consignee, invoiceNo: 'INV-2026-001',
      date: '2026-08-20', shippingMarks: '', packageCount: 10, packageType: 'Carton',
      netWeight: 450, grossWeight: 500, measurement: '4.2 CBM',
      items: [{ description: desc, quantity: 100, boxes: 10, eaPerBox } as any],
    } as unknown as PackingListData);

    const crossCases: Array<{ name: string; pl: PackingListData; rule: string }> = [
      { name: 'C/I·P/L 수량 불일치(100 vs 90)', pl: mkPl(9, "Women's Cashmere Coats"), rule: 'r10-packing-qty-mismatch' },
      { name: 'C/I·P/L 품명 불일치', pl: mkPl(10, 'Cotton Jackets'), rule: 'r10-packing-desc-mismatch' },
    ];
    for (const c of crossCases) {
      const issues = checkPackingInvoiceConsistency(invoice, c.pl);
      const hit = issues.some(i => i.id === c.rule);
      rows.push({ 분류: '서류 간 교차검증', 시나리오: c.name, 검출: hit ? 'O' : 'X', 검출규칙: issues.map(i => i.id).join(', ') });
      const cat = perCat.get('서류 간 교차검증') || { hit: 0, total: 0 };
      cat.total += 1; if (hit) cat.hit += 1;
      perCat.set('서류 간 교차검증', cat);
    }
    // 교차검증 정상 케이스(오탐 확인)
    const okIssues = checkPackingInvoiceConsistency(invoice, mkPl(10, "Women's Cashmere Coats"));
    console.log(`[교차검증 기준선] 정상 C/I·P/L 오탐: ${okIssues.length}건`);

    // C. HS코드 형식 오류 — 담당 컴포넌트인 HSCode 에이전트(LLM 미사용)로 측정
    const hsAgent = new HSCodeAgent();
    const hsFormatCases: Array<{ name: string; code: string }> = [
      { name: 'HS코드 자리수 오류(2자리)', code: '62' },
      { name: 'HS코드 형식 오류(문자 포함)', code: '62A1B4' },
      { name: 'HS코드 존재하지 않는 류(99류)', code: '990211' },
    ];
    for (const c of hsFormatCases) {
      const r = await hsAgent.run({ itemName: "Women's Cashmere Coats", hsCode: c.code, useLLM: false, logs: [] } as any);
      const hit = r.status === 'invalid';
      rows.push({ 분류: 'HS코드 오류', 시나리오: c.name, 검출: hit ? 'O' : 'X', 검출규칙: hit ? `hscode-invalid (${r.validationMessage || ''})`.slice(0, 60) : '' });
      const cat = perCat.get('HS코드 오류') || { hit: 0, total: 0 };
      cat.total += 1; if (hit) cat.hit += 1;
      perCat.set('HS코드 오류', cat);
    }

    // E. HS 챕터 대조 — 품명(의류 62류)과 다른 류(03류 어류) 코드 입력
    const p = baseProfile();
    p.hsCode = '030342';
    const hsIssues = checkHsChapterMismatch(p, {
      status: 'completed',
      candidates: [{ code: '620211', description: '여성용 캐시미어 코트(모직물)' }],
    });
    const hsHit = hsIssues.some(i => i.id === 'r17-hs-chapter-mismatch');
    rows.push({ 분류: 'HS코드 오류', 시나리오: '품명·HS 분류 불일치(62류 품명에 03류 코드)', 검출: hsHit ? 'O' : 'X', 검출규칙: hsIssues.map(i => i.id).join(', ') });
    { const hc = perCat.get('HS코드 오류') || { hit: 0, total: 0 }; hc.total += 1; if (hsHit) hc.hit += 1; perCat.set('HS코드 오류', hc); }

    console.table(rows);
    let hit = 0, total = 0;
    console.log('\n=== <표 1> 오류 유형별 검출 결과 ===');
    for (const [cat, c] of perCat) {
      console.log(`${cat}: ${c.hit}/${c.total} (${((c.hit / c.total) * 100).toFixed(1)}%)`);
      hit += c.hit; total += c.total;
    }
    console.log(`전체: ${hit}/${total} (${((hit / total) * 100).toFixed(1)}%)`);
    expect(total).toBeGreaterThan(0);
  });
});

describe('ACK 2026 실험 2 — 수입 서류 파일명 분류 정확도', () => {
  it('실무 파일명 변형 분류', () => {
    const cases: Array<[string, ImportDocumentType]> = [
      // 상업송장
      ['Commercial Invoice.pdf', 'commercial_invoice'],
      ['상업송장_최종본.pdf', 'commercial_invoice'],
      ['CI_2026_0815.pdf', 'commercial_invoice'],
      ['(주)한성무역 인보이스.pdf', 'commercial_invoice'],
      ['invoice-draft2.pdf', 'commercial_invoice'],
      // 포장명세서
      ['Packing List.pdf', 'packing_list'],
      ['패킹리스트(P/L).pdf', 'packing_list'],
      ['포장명세서 8월.pdf', 'packing_list'],
      ['PL_shipment01.pdf', 'packing_list'],
      ['포장내역서.pdf', 'packing_list'],
      // 선하증권
      ['Bill of Lading.pdf', 'bill_of_lading'],
      ['선하증권 사본.pdf', 'bill_of_lading'],
      ['BL_HDMU1234567.pdf', 'bill_of_lading'],
      ['B-L draft.pdf', 'bill_of_lading'],
      ['해상선하증권.pdf', 'bill_of_lading'],
      // 원산지증명서
      ['Certificate of Origin.pdf', 'certificate_of_origin'],
      ['원산지증명서.pdf', 'certificate_of_origin'],
      ['CO_form_a.pdf', 'certificate_of_origin'],
      // 운송의뢰서
      ['수출 운송의뢰서.pdf', 'transport_request'],
      ['Shipping Request 0815.pdf', 'transport_request'],
      ['선적의뢰서_v2.pdf', 'transport_request'],
      // 수출신고필증
      ['수출신고필증.pdf', 'export_declaration'],
      ['Export Declaration.pdf', 'export_declaration'],
      ['수출신고서 스캔.pdf', 'export_declaration'],
    ];
    const rows: { 파일명: string; 정답: string; 판정: string; 일치: string }[] = [];
    const perType = new Map<string, { hit: number; total: number }>();
    for (const [name, answer] of cases) {
      const got = classifyImportDocumentName(name);
      const ok = got === answer;
      rows.push({ 파일명: name, 정답: answer, 판정: got, 일치: ok ? 'O' : 'X' });
      const c = perType.get(answer) || { hit: 0, total: 0 };
      c.total += 1; if (ok) c.hit += 1;
      perType.set(answer, c);
    }
    console.table(rows);
    let hit = 0, total = 0;
    console.log('\n=== <표 2> 서류 유형별 파일명 분류 정확도 ===');
    for (const [t, c] of perType) {
      console.log(`${t}: ${c.hit}/${c.total} (${((c.hit / c.total) * 100).toFixed(1)}%)`);
      hit += c.hit; total += c.total;
    }
    console.log(`전체: ${hit}/${total} (${((hit / total) * 100).toFixed(1)}%)`);
    expect(total).toBe(cases.length);
  });
});
