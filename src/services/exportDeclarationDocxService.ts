import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { CustomsDeclarationData, TradeItem } from '../types';
import { tradeItemAmount } from '../utils/shipment';
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

/** 품목별 신고가격(FOB) 원화 — KRW면 금액 그대로, 외화면 관세청 수출환율로 환산, 환율 없으면 공란. */
function fobKrw(amount: number, currency: string, rate: number | null | undefined): string {
  if (amount <= 0) return '';
  if (currency === 'KRW') return `₩${Math.round(amount).toLocaleString()}`;
  if (rate && rate > 0) return `₩${Math.round(amount * rate).toLocaleString()}`;
  return ''; // 외화인데 환율 미확보 → 공란(자동 추정 안 함)
}

function mapItem(it: TradeItem, idx: number, total: number, ctx: {
  currency: string; rate: number | null | undefined; invoiceNo: string; origin: string;
}): ExportDeclItemSchema {
  const amt = tradeItemAmount(it);
  return {
    item_no: String(idx + 1),
    item_total: String(total),
    goods_name: s(it.description),
    trade_name: '',       // 소스 없음
    brand: '',            // 소스 없음
    model_spec: '',       // 소스 없음
    composition: '',      // 소스 없음
    qty_unit: Number(it.quantity) > 0 ? `${Number(it.quantity).toLocaleString()} ${s(it.unit)}`.trim() : '',
    unit_price: num(it.unitPrice),
    amount: num(amt),
    hs_code: s(it.hsCode),
    net_weight: wt(it.netWeight),
    fob_price: fobKrw(amt, ctx.currency, ctx.rate),
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
  const ctx = { currency, rate, invoiceNo, origin };

  const firstItem = items.length > 0 ? mapItem(items[0], 0, total, ctx) : EMPTY_ITEM;
  const extraItems = items.slice(1).map((it, i) => mapItem(it, i + 1, total, ctx));

  const invoiceAmount = Number(cd.invoiceAmount) || 0;
  const totalFobUsd = currency !== 'KRW' && invoiceAmount > 0 ? `$ ${invoiceAmount.toLocaleString()}` : '';
  const totalFobKrw = fobKrw(invoiceAmount, currency, rate).replace('₩', '₩ ');

  const exporterName = s(cd.exporter?.name);
  const exporterAddr = s(cd.ownerAddress) || s(cd.exporter?.address);

  return {
    decl_date: s(cd.declarationDate),
    // 수출대행자·수출화주 = 화주 상호(대행 별도 소스 없으면 동일). 통관고유부호·대표자·소재지는 소스 없음 → 공란.
    agent_name: exporterName, agent_code: '',
    owner_name: exporterName, owner_code: '', owner_addr: exporterAddr, owner_ceo: '', owner_location: '',
    owner_bizno: s(cd.ownerBizNo),
    dest_country: s(cd.destCountry) || s(cd.dischargePort),
    load_port: s(cd.loadPort),
    carrier: s(cd.carrier),
    vessel: s(cd.vessel),
    departure_date: s(cd.departureDate),
    bonded_area: '', transport_type: s(cd.transportType), inspect_date: '', goods_location: '',
    maker_name: s(cd.makerName), maker_code: '', maker_place: '', industrial_code: '',
    lc_no: s(cd.lcNo), return_reason: '',
    buyer_name: s(cd.buyerName), buyer_code: '',
    total_weight: wt(cd.totalWeight),
    total_packages: Number(cd.totalPackages) > 0 ? String(Number(cd.totalPackages).toLocaleString()) : '',
    total_fob_usd: totalFobUsd,
    total_fob_krw: totalFobKrw,
    freight: '', insurance: '',
    payment_amount: invoiceAmount > 0 ? `${currency} ${invoiceAmount.toLocaleString()}` : '',
    cargo_no: '', container_no: s(cd.containerNo),
    // (B) 관세사 기재 — 전부 공란
    decl_kind: '', declarant: '', exporter_type: '', trade_kind: '', decl_category: '',
    payment_method: '', goods_status: '', pre_open: '', refund_applicant: '', simple_refund: '',
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
