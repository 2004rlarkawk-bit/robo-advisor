import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { PackingListData, InvoiceItem } from '../types';
// 고정 템플릿(무역협회 표준 포장명세서) — XML/서식 무수정, {{placeholder}} 값만 주입.
import templateUrl from '../../templates/packing_list_template.docx?url';

/** 포장명세서 docx 템플릿 스키마 — 템플릿의 {{placeholder}}(문서레벨 + items 루프)와 1:1. */
export interface PackingItemRow {
  shipping_marks: string;
  packages: string;
  goods_description: string;
  quantity_or_net_weight: string;
  gross_weight: string;
  measurement: string;
}
export interface PackingListDocxSchema {
  seller: string;
  consignee: string;
  buyer: string;
  departure_date: string;
  vessel: string;
  from_port: string;
  to_port: string;
  invoice_no: string;
  invoice_date: string;
  other_references: string;
  signed_by: string;
  items: PackingItemRow[];
}

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
/** 당사자: 상호·주소·연락처를 줄바꿈으로(linebreaks:true가 <w:br/>로 변환). */
function party(p?: { name?: string; address?: string; contact?: string }): string {
  if (!p) return '';
  return [s(p.name), s(p.address), p.contact ? `TEL: ${s(p.contact)}` : ''].filter(Boolean).join('\n');
}
/** 수치가 있을 때만 "값 단위", 없으면 공란(0/빈값은 공란 — junk 방지). */
const wt = (n: unknown) => (Number(n) > 0 ? `${Number(n).toLocaleString()} KG` : '');
const pkg = (count: unknown, unit: string) => (Number(count) > 0 ? `${Number(count).toLocaleString()} ${unit}`.trim() : '');

/**
 * DocumentAgent가 조립한 PackingListData → 포장명세서 docx 스키마.
 * 당사자·항구·인보이스번호는 문서레벨에서 가져오고, 품목은 items 배열을 그대로 매핑한다.
 * 물류필드(순/총중량·용적)가 공란이면 공란 유지 — 검증이 미입력을 잡는다.
 */
export function mapPackingListToDocxSchema(pl: PackingListData): PackingListDocxSchema {
  const d = pl as Record<string, any>;
  const items = (pl.items || []) as InvoiceItem[];
  const inc = s(d.incoterms).toUpperCase();
  const otherRefs = [inc, s(d.paymentTerms)].filter(Boolean).join(' / ');

  const rows: PackingItemRow[] = items.map((it, i) => {
    const r = it as Record<string, any>;
    return {
      // 결정2: 화인은 문서레벨이 정본. 품목 override(marks)가 있으면 그것을, 없으면 첫 행만 문서레벨 상속.
      shipping_marks: s(r.marks) || (i === 0 ? s(pl.shippingMarks) : ''),
      packages: pkg(r.packageCount, s(r.packageType)),
      goods_description: s(r.description),
      quantity_or_net_weight: wt(r.netWeight),
      gross_weight: wt(r.grossWeight),
      measurement: s(r.dimensions),
    };
  });

  return {
    seller: party(pl.seller),
    consignee: party(pl.consignee),
    buyer: party(d.buyer),
    departure_date: s(d.departureDate),
    vessel: s(d.vessel) || s(d.carrier),
    from_port: s(d.loadPort),
    to_port: s(d.dischargePort),
    invoice_no: s(pl.invoiceNo),
    invoice_date: s(d.invoiceDate) || s(pl.date),
    other_references: otherRefs,
    signed_by: s(pl.signedBy),
    items: rows,
  };
}

let templateCache: ArrayBuffer | null = null;
async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`포장명세서 템플릿 로드 실패 (${res.status})`);
  templateCache = await res.arrayBuffer();
  return templateCache;
}

/** 스키마 데이터를 고정 docx 템플릿에 주입해 docx Blob을 반환한다(품목은 {{#items}} 루프로 반복). */
export async function exportPackingListDocx(data: PackingListDocxSchema): Promise<Blob> {
  const content = await loadTemplate();
  const doc = new Docxtemplater(new PizZip(content), {
    delimiters: { start: '{{', end: '}}' }, // 인보이스와 통일
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

/** PackingListData → docx Blob (매핑 + 주입) */
export async function buildPackingListDocx(pl: PackingListData): Promise<Blob> {
  return exportPackingListDocx(mapPackingListToDocxSchema(pl));
}

/** 생성된 docx Blob을 브라우저에 렌더(미리보기) — 미리보기=다운로드 동일 바이너리. */
export async function renderPackingListDocxPreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}
