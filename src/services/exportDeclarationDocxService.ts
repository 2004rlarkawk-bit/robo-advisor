import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { CustomsDeclarationData, TradeItem } from '../types';
import { tradeItemAmount } from '../utils/shipment';
import { isFobIncoterms } from '../utils/exportDeclarationFob';

export { exportDeclarationFobNotice } from '../utils/exportDeclarationFob';
// 고정 docx 템플릿(수출신고서 갑지·을지) — XML/서식 무수정, {{placeholder}} 값만 주입.
import templateUrl from '../../templates/export_declaration_template.docx?url';

/** 수출신고서 품목 1란 스키마 — 갑지(firstItem)·을지(extraItems) 공통. */
export interface ExportDeclItemSchema {
  item_no: string;
  item_total: string;
  goods_name: string;
  trade_name: string;
  brand: string;
  model_spec: string;
  composition: string;
  qty_unit: string;
  unit_price: string;
  amount: string;
  hs_code: string;
  net_weight: string;
  fob_price: string;
  invoice_no: string;
  import_decl_no: string;
  origin: string;
  package: string;
  req_doc1: string;
  req_doc2: string;
  req_doc3: string;
  req_doc4: string;
  price_currency: string;
}

/** 수출신고서 docx 스키마 — 템플릿 {{placeholder}}와 1:1.
 *  (A) 세관 기재는 템플릿에 "신고 후 확정" 리터럴로 박혀 있어 여기에 없다.
 *  (B) 관세사 기재는 항상 ''(공란) — 관세청 코드값이라 추정 금지. */
export interface ExportDeclarationDocxSchema {
  // (C) 화주 데이터
  decl_date: string;
  agent_name: string; agent_code: string;
  owner_name: string; owner_code: string; owner_addr: string; owner_ceo: string; owner_location: string; owner_bizno: string;
  dest_country: string; load_port: string; carrier: string; vessel: string; departure_date: string;
  bonded_area: string; transport_type: string; inspect_date: string; goods_location: string;
  maker_name: string; maker_code: string; maker_place: string; industrial_code: string;
  lc_no: string; return_reason: string; buyer_name: string; buyer_code: string;
  total_weight: string; total_packages: string; total_fob_usd: string; total_fob_krw: string;
  freight: string; insurance: string; payment_amount: string; cargo_no: string; container_no: string;
  // (B) 관세사 기재 — 공란
  decl_kind: string; declarant: string; exporter_type: string; trade_kind: string; decl_category: string;
  payment_method: string; goods_status: string; pre_open: string; refund_applicant: string; simple_refund: string;
  declarant_note: string; transport_declarant: string; staff: string;
  // 품목: 갑지 1란(firstItem, 항상 1회) + 을지 루프(extraItems)
  firstItem: ExportDeclItemSchema;
  extraItems: ExportDeclItemSchema[];
  hasExtraItems: boolean;
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const num = (n: unknown) => (Number(n) > 0 ? Number(n).toLocaleString() : '');
const wt = (n: unknown) => (Number(n) > 0 ? `${Number(n).toLocaleString()} KG` : '');
const pkg = (count: unknown, unit: string) => (Number(count) > 0 ? `${Number(count).toLocaleString()} ${unit}`.trim() : '');

/** 품목별 신고가격(FOB) 원화 — FOB 조건만. KRW면 금액 그대로, 외화면 관세청 수출환율로 환산. 값이 없거나 잘못되면 공란(0원·NaN 금지). */
function fobKrw(amount: number, currency: string, rate: number | null | undefined, incoterms: string | undefined): string {
  if (!isFobIncoterms(incoterms)) return '';
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (currency === 'KRW') return `₩${Math.round(amount).toLocaleString()}`;
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) return `₩${Math.round(amount * rate).toLocaleString()}`;
  return ''; // 외화인데 환율 미확보 → 공란(자동 추정 안 함)
}

/**
 * 결제조건 → 결제방법 부호. 작성요령 예시(TT)·통계부호표(LS·LU·DA·DP) 기준.
 * L/C는 일람출급/기한부를 모르면 부호가 정해지지 않으므로 공란.
 */
export function paymentMethodCode(paymentTerms: string | undefined, lcPaymentType?: string): string {
  switch ((paymentTerms || '').trim().toUpperCase()) {
    case 'T/T': return 'TT';
    case 'D/A': return 'DA';
    case 'D/P': return 'DP';
    case 'L/C': return lcPaymentType === 'SIGHT' ? 'LS' : lcPaymentType === 'USANCE' ? 'LU' : '';
    default: return '';
  }
}

/** 운송방식 → 운송형태(운송수단 10 선박 + 운송용기 FC/LC). 미정이면 공란. */
export function transportTypeCode(loadingMode: string | undefined): string {
  const mode = (loadingMode || '').trim().toUpperCase();
  if (mode === 'FCL') return '10FC';
  if (mode === 'LCL') return '10LC';
  return '';
}

const krw = (n: unknown) => (Number(n) > 0 ? Math.round(Number(n)).toLocaleString() : '');

function mapItem(it: TradeItem, idx: number, total: number, ctx: {
  currency: string; rate: number | null | undefined; invoiceNo: string; origin: string; incoterms: string;
}): ExportDeclItemSchema {
  const amt = tradeItemAmount(it);
  return {
    item_no: String(idx + 1),
    item_total: String(total),
    goods_name: s(it.description),
    trade_name: '',       // 소스 없음
    brand: s(it.brand),
    model_spec: s(it.detail),  // 상세 정보(색상·재질·규격) — 품명은 기본 품명 유지
    composition: s(it.composition),
    qty_unit: Number(it.quantity) > 0 ? `${Number(it.quantity).toLocaleString()} ${s(it.unit)}`.trim() : '',
    unit_price: num(it.unitPrice),
    amount: num(amt),
    hs_code: s(it.hsCode),
    net_weight: wt(it.netWeight),
    fob_price: fobKrw(amt, ctx.currency, ctx.rate, ctx.incoterms),
    invoice_no: ctx.invoiceNo,
    import_decl_no: '',   // 소스 없음
    origin: ctx.origin,
    package: pkg(it.packageCount, s(it.packageUnit)),
    req_doc1: '', req_doc2: '', req_doc3: '', req_doc4: '',
    price_currency: s(ctx.currency),
  };
}

const EMPTY_ITEM: ExportDeclItemSchema = {
  item_no: '', item_total: '', goods_name: '', trade_name: '', brand: '', model_spec: '', composition: '',
  qty_unit: '', unit_price: '', amount: '', hs_code: '', net_weight: '', fob_price: '', invoice_no: '',
  import_decl_no: '', origin: '', package: '', req_doc1: '', req_doc2: '', req_doc3: '', req_doc4: '', price_currency: '',
};

/**
 * CustomsDeclarationData → 수출신고서 docx 스키마.
 * 갑지=items[0], 을지=items.slice(1). (A)는 템플릿 리터럴, (B)는 공란, (C)만 매핑.
 */
export function mapExportDeclarationToDocxSchema(cd: CustomsDeclarationData): ExportDeclarationDocxSchema {
  const items = (cd.items || []) as TradeItem[];
  const currency = s(cd.currency) || 'USD';
  const rate = cd.fobRate ?? null;
  const invoiceNo = s(cd.invoiceNo);
  const origin = s(cd.countryOfOrigin);
  const total = items.length;
  const incoterms = s(cd.incoterms);
  const ctx = { currency, rate, invoiceNo, origin, incoterms };

  const firstItem = items.length > 0 ? mapItem(items[0], 0, total, ctx) : EMPTY_ITEM;
  const extraItems = items.slice(1).map((it, i) => mapItem(it, i + 1, total, ctx));

  const invoiceAmount = Number(cd.invoiceAmount) || 0;
  // 총신고가격(FOB)도 FOB 조건일 때만 송장금액으로 채운다.
  const totalFobUsd = isFobIncoterms(incoterms) && currency !== 'KRW' && invoiceAmount > 0 ? `$ ${invoiceAmount.toLocaleString()}` : '';
  const totalFobKrw = fobKrw(invoiceAmount, currency, rate, incoterms).replace('₩', '₩ ');

  const exporterName = s(cd.exporter?.name);
  const exporterAddr = s(cd.ownerAddress) || s(cd.exporter?.address);
  const ed = cd.exportDeclaration ?? {};
  const customsCode = s(ed.customsCode);
  const postalCode = s(ed.postalCode);
  const general = ed.tradeKind === 'GENERAL';
  // 제조자: 직접 제조(A)면 수출화주 정보, 완제품 공급(C)이면 입력한 제조자, 미선택이면 기존 기본값.
  const maker = ed.exporterType === 'A'
    ? { name: exporterName, code: customsCode, place: postalCode }
    : ed.exporterType === 'C'
      ? { name: s(ed.makerName), code: s(ed.makerCustomsCode), place: s(ed.makerPostalCode) }
      : { name: s(cd.makerName), code: '', place: '' };

  return {
    decl_date: s(cd.declarationDate),
    // 수출대행자·수출화주 = 화주 상호(대행 별도 소스 없으면 동일). 통관고유부호·대표자·소재지는 화주 입력값.
    agent_name: exporterName, agent_code: customsCode,
    owner_name: exporterName, owner_code: customsCode, owner_addr: exporterAddr, owner_ceo: s(ed.ownerCeoName), owner_location: postalCode,
    owner_bizno: s(cd.ownerBizNo),
    dest_country: s(cd.destCountry) || s(cd.dischargePort),
    load_port: s(cd.loadPort),
    carrier: s(cd.carrier),
    vessel: s(cd.vessel),
    departure_date: s(cd.departureDate),
    bonded_area: '', transport_type: transportTypeCode(cd.transportType), inspect_date: '', goods_location: '',
    maker_name: maker.name, maker_code: maker.code, maker_place: maker.place, industrial_code: s(ed.industrialComplexCode),
    lc_no: s(cd.lcNo), return_reason: '',
    buyer_name: s(cd.buyerName), buyer_code: s(ed.buyerCustomsCode),
    total_weight: wt(cd.totalWeight),
    total_packages: Number(cd.totalPackages) > 0 ? String(Number(cd.totalPackages).toLocaleString()) : '',
    total_fob_usd: totalFobUsd,
    total_fob_krw: totalFobKrw,
    freight: krw(ed.freightKrw), insurance: krw(ed.insuranceKrw),
    payment_amount: invoiceAmount > 0 ? `${currency} ${invoiceAmount.toLocaleString()}` : '',
    cargo_no: '', container_no: s(cd.containerNo),
    // (B) 코드란 — 화주가 고른 값에서 하나로 정해지는 부호만 채우고, 나머지는 관세사가 기재(공란).
    decl_kind: '', declarant: '', exporter_type: s(ed.exporterType),
    trade_kind: general ? '11' : '', decl_category: general ? 'A' : '',
    payment_method: paymentMethodCode(cd.paymentTerms, ed.lcPaymentType),
    goods_status: s(ed.goodsCondition), pre_open: '', refund_applicant: '', simple_refund: '',
    declarant_note: '', transport_declarant: '', staff: '',
    firstItem,
    extraItems,
    hasExtraItems: extraItems.length > 0,
  };
}

let templateCache: ArrayBuffer | null = null;
async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`수출신고서 템플릿 로드 실패 (${res.status})`);
  templateCache = await res.arrayBuffer();
  return templateCache;
}

/** 스키마 데이터를 고정 docx 템플릿에 주입해 docx Blob을 반환한다(을지 조건부 + 품목 루프). */
export async function exportExportDeclarationDocx(data: ExportDeclarationDocxSchema): Promise<Blob> {
  const content = await loadTemplate();
  const doc = new Docxtemplater(new PizZip(content), {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(data as unknown as Record<string, unknown>);
  const out = doc.getZip().generate({ type: 'arraybuffer' }) as ArrayBuffer;
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** CustomsDeclarationData → docx Blob (매핑 + 주입) */
export async function buildExportDeclarationDocx(cd: CustomsDeclarationData): Promise<Blob> {
  return exportExportDeclarationDocx(mapExportDeclarationToDocxSchema(cd));
}

/** 생성된 docx Blob을 브라우저에 렌더(미리보기) — 미리보기=다운로드 동일 바이너리. */
export async function renderExportDeclarationDocxPreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}
