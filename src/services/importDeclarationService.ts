import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type {
  ImportDocumentMeta,
  ImportDutyEstimate,
  ImportExtractedFields,
  ImportItem,
  ImportRisk,
} from '../types/importTrade';
// 고정 docx 템플릿(수입신고의뢰서) — 서식은 그대로 두고 {{placeholder}} 값만 주입한다.
import templateUrl from '../../templates/import_declaration_request_template.docx?url';
import { portaiFileName } from '../utils/documentFileName';

export interface ImportDeclarationData {
  fields: ImportExtractedFields;
  duty?: ImportDutyEstimate;
  dutyError?: string;
  risks?: ImportRisk[];
  /** 화주가 올린 서류 — 첨부 서류 체크에 쓴다 */
  documents?: ImportDocumentMeta[];
  /** 서류에서 수입자 상호를 못 읽었을 때 쓰는 회원 상호 */
  importerCompanyName?: string;
  /** 의뢰번호 뒷자리에 쓰는 거래 id */
  tradeId?: string;
  requestDate?: Date;
}

export interface ImportDeclarationItemSchema {
  no: string;
  name: string;
  spec: string;
  hs_code: string;
  qty_pkg: string;
  gross_weight: string;
  amount: string;
}

/** 템플릿 {{placeholder}}와 1:1. cb_* 는 체크박스(■ 선택 / □ 미선택). */
export interface ImportDeclarationSchema {
  request_no: string;
  request_date: string;
  importer_name: string;
  importer_bizno: string;
  contact_name: string;
  contact_tel: string;
  customs_broker: string;
  bl_no: string;
  do_no: string;
  exporter_name: string;
  invoice_no_date: string;
  shipping_country: string;
  origin_country: string;
  cb_fob: string;
  cb_cif: string;
  cb_cfr: string;
  cb_inco_other: string;
  inco_other: string;
  arrival_date: string;
  bonded_place: string;
  items: ImportDeclarationItemSchema[];
  cb_decl_general: string;
  cb_decl_pre: string;
  cb_decl_bonded: string;
  cb_decl_other: string;
  cb_fta_apply: string;
  cb_fta_no: string;
  cb_fta_check: string;
  cb_req_none: string;
  cb_req_food: string;
  cb_req_elec: string;
  cb_req_quar: string;
  cb_req_other: string;
  cb_tax_yes: string;
  cb_tax_no: string;
  cb_att_ci: string;
  cb_att_pl: string;
  cb_att_bl: string;
  cb_att_co: string;
  cb_att_do: string;
  cb_att_other: string;
  remarks: string;
}

const CHECKED = '■';
const UNCHECKED = '□';
const box = (checked: boolean) => (checked ? CHECKED : UNCHECKED);
const text = (value: unknown) => String(value ?? '').trim();
const joinFilled = (values: unknown[], separator: string) => values.map(text).filter(Boolean).join(separator);

function formatDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(text(value));
  if (Number.isNaN(date.getTime())) return text(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}. ${pad(date.getMonth() + 1)}. ${pad(date.getDate())}`;
}

function requestNo(date: Date, tradeId?: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const suffix = text(tradeId).replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
  return suffix ? `${ymd}-${suffix}` : ymd;
}

function mapItem(item: ImportItem, index: number, currency: string): ImportDeclarationItemSchema {
  const quantity = joinFilled([item.quantity, item.quantityUnit], ' ');
  const packages = joinFilled([item.packageCount, item.packageUnit], ' ');
  const amount = text(item.amount);
  return {
    no: String(index + 1),
    name: text(item.description) || text(item.koreanDescription),
    spec: joinFilled([item.modelName, item.specification, item.material || item.composition], ', '),
    hs_code: text(item.confirmedHSCode) || text(item.documentHSCode),
    qty_pkg: joinFilled([quantity, packages], ' / '),
    gross_weight: text(item.grossWeight) ? `${text(item.grossWeight)} kg` : '',
    amount: amount ? joinFilled([item.currency || currency, amount], ' ') : '',
  };
}

const EMPTY_ITEM: ImportDeclarationItemSchema = { no: '1', name: '', spec: '', hs_code: '', qty_pkg: '', gross_weight: '', amount: '' };

/**
 * 분석·확정된 수입 데이터 → 수입신고의뢰서 스키마.
 * 서류에서 확인되는 값만 채우고, 신고 구분·수입요건·관세사·D/O No.·반입장소처럼
 * 화주나 관세사가 정할 칸은 비워 둔다.
 */
export function mapImportDeclarationToSchema(data: ImportDeclarationData): ImportDeclarationSchema {
  const { fields } = data;
  const date = data.requestDate ?? new Date();
  const currency = text(fields.currency);
  const incoterm = text(fields.incoterms).toUpperCase().split(/[\s-]/)[0] ?? '';
  const knownIncoterm = ['FOB', 'CIF', 'CFR'].includes(incoterm);
  const types = new Set((data.documents ?? []).map((document) => document.type));
  const hasCertificateOfOrigin = types.has('certificate_of_origin') || fields.certificateOfOriginAvailable;
  const otherDocument = ['export_declaration', 'insurance_policy', 'transport_request', 'other']
    .some((type) => types.has(type as ImportDocumentMeta['type']));
  const origins = [...new Set([fields.originCountry, ...fields.items.map((item) => item.originCountry)].map(text).filter(Boolean))];
  const remarks = (data.risks ?? [])
    .filter((risk) => risk.level === 'high' || risk.level === 'medium')
    .map((risk) => text(risk.item))
    .filter(Boolean);
  const items = fields.items.map((item, index) => mapItem(item, index, currency));

  return {
    request_no: requestNo(date, data.tradeId),
    request_date: formatDate(date),
    importer_name: text(fields.importerDetails.name) || text(fields.importer) || text(data.importerCompanyName),
    importer_bizno: '',
    contact_name: text(fields.importerDetails.contactName),
    contact_tel: text(fields.importerDetails.phone) || text(fields.importerDetails.email),
    customs_broker: '',
    bl_no: text(fields.blNo),
    do_no: '',
    exporter_name: text(fields.exporterDetails.name) || text(fields.shipper),
    invoice_no_date: joinFilled([fields.invoiceNo, fields.invoiceDate], ' / '),
    shipping_country: text(fields.exporterDetails.country),
    origin_country: origins.join(', '),
    cb_fob: box(incoterm === 'FOB'),
    cb_cif: box(incoterm === 'CIF'),
    cb_cfr: box(incoterm === 'CFR'),
    cb_inco_other: box(Boolean(incoterm) && !knownIncoterm),
    inco_other: incoterm && !knownIncoterm ? ` (${incoterm})` : '',
    arrival_date: text(fields.estimatedArrivalDate) ? formatDate(fields.estimatedArrivalDate) : '',
    bonded_place: '',
    items: items.length > 0 ? items : [EMPTY_ITEM],
    cb_decl_general: UNCHECKED,
    cb_decl_pre: UNCHECKED,
    cb_decl_bonded: UNCHECKED,
    cb_decl_other: UNCHECKED,
    // 원산지증명서가 있으면 협정세율 신청, 없으면 적용 가능 여부를 관세사와 확인한다.
    cb_fta_apply: box(hasCertificateOfOrigin),
    cb_fta_no: UNCHECKED,
    cb_fta_check: box(!hasCertificateOfOrigin),
    cb_req_none: UNCHECKED,
    cb_req_food: UNCHECKED,
    cb_req_elec: UNCHECKED,
    cb_req_quar: UNCHECKED,
    cb_req_other: UNCHECKED,
    cb_tax_yes: UNCHECKED,
    cb_tax_no: UNCHECKED,
    cb_att_ci: box(types.has('commercial_invoice')),
    cb_att_pl: box(types.has('packing_list')),
    cb_att_bl: box(types.has('bill_of_lading')),
    cb_att_co: box(types.has('certificate_of_origin')),
    cb_att_do: UNCHECKED,
    cb_att_other: box(otherDocument),
    remarks: remarks.join(' · '),
  };
}

let templateCache: ArrayBuffer | null = null;
async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`수입신고의뢰서 템플릿 로드 실패 (${res.status})`);
  templateCache = await res.arrayBuffer();
  return templateCache;
}

/** 스키마 값을 고정 템플릿에 주입해 docx Blob을 만든다(품목 행은 반복). */
export async function buildImportDeclarationDocx(data: ImportDeclarationData): Promise<Blob> {
  const doc = new Docxtemplater(new PizZip(await loadTemplate()), {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(mapImportDeclarationToSchema(data) as unknown as Record<string, unknown>);
  const out = doc.getZip().generate({ type: 'arraybuffer' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** 미리보기 — 다운로드와 같은 docx를 그대로 렌더한다. */
export async function renderImportDeclarationPreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}

/** 파일 이름 규칙 PortAI_import.declaration.request_월.일 (확장자 제외) */
export function importDeclarationFileName(_fields?: ImportExtractedFields): string {
  return portaiFileName('import_declaration_request');
}

export async function downloadImportDeclarationDocx(data: ImportDeclarationData): Promise<void> {
  const blob = await buildImportDeclarationDocx(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${importDeclarationFileName(data.fields)}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PDF 저장 — 같은 docx를 인쇄용 iframe에 렌더해 브라우저 "PDF로 저장"으로 내보낸다(상업송장과 동일 방식). */
export async function printImportDeclarationAsPdf(data: ImportDeclarationData): Promise<void> {
  const blob = await buildImportDeclarationDocx(data);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow?.document;
  if (!idoc) {
    iframe.remove();
    throw new Error('PDF 인쇄 창을 만들지 못했습니다.');
  }
  idoc.open();
  idoc.write(
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + importDeclarationFileName(data.fields) + '</title>' +
    '<style>@page { size: A4; margin: 0; } html, body { margin: 0; padding: 0; background: #fff; }' +
    '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head>' +
    '<body><div id="pdf-host"></div></body></html>',
  );
  idoc.close();
  const host = idoc.getElementById('pdf-host');
  if (!host) { iframe.remove(); return; }
  await renderImportDeclarationPreview(blob, host);
  const win = iframe.contentWindow!;
  let cleaned = false;
  const cleanup = () => { if (cleaned) return; cleaned = true; iframe.remove(); };
  win.onafterprint = cleanup;
  win.focus();
  win.print();
  setTimeout(cleanup, 60000); // onafterprint 미발화 브라우저 대비
}
