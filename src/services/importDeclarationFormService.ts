/**
 * 수입신고서(초안) 생성 — 관세법 시행규칙 [별지 제1호의3서식] 원본 서식에 값만 채운다.
 *
 * 세관 제출본이 아니다. 신고번호·세관기재란처럼 신고 후 확정되는 칸과,
 * 관세사가 통계부호표를 보고 적는 부호칸(징수형태·통관계획·신고구분·거래구분·종류 등)은
 * 추정하지 않고 빈칸으로 둔다.
 */
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { ImportDutyEstimate, ImportExtractedFields, ImportItem } from '../types/importTrade';
import { portaiFileName } from '../utils/documentFileName';
import { parseTradeNumber } from '../utils/number';
// 고정 템플릿 — 관보 서식 이미지 위에 {{placeholder}}를 좌표로 얹은 파일.
// 서식을 고치려면 scripts/generate-import-declaration-template.ts 를 고쳐 다시 뽑는다.
import templateUrl from '../../templates/import_declaration_template.docx?url';

export interface ImportDeclarationFormData {
  fields: ImportExtractedFields;
  duty?: ImportDutyEstimate | null;
  /** 서류에서 상호를 못 읽었을 때 쓰는 회원 상호 */
  importerCompanyName?: string;
  /** 납세의무자 연락처 — 회원 프로필 값 */
  importerTel?: string;
  importerEmail?: string;
  importerAddress?: string;
  importerContactName?: string;
  declarationDate?: Date;
}

const text = (value: unknown): string => String(value ?? '').trim();
const money = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) && value !== 0 ? Math.round(value).toLocaleString('ko-KR') : '';
const numberText = (value: string): string => {
  const parsed = parseTradeNumber(value);
  return parsed === null ? text(value) : parsed.toLocaleString('en-US');
};
const dateText = (value: Date): string =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;

/** 수량+단위 한 칸 표기 — "1,200 EA" */
function quantityText(item: ImportItem | undefined): string {
  if (!item) return '';
  return [numberText(item.quantity), text(item.quantityUnit)].filter(Boolean).join(' ');
}

/** 포장 수량+단위 — ㉒총포장갯수 */
function packagesText(fields: ImportExtractedFields): string {
  const count = fields.cargoTotals?.numberOfPackages || fields.totalPackageCount;
  return [numberText(text(count)), text(fields.packageUnit)].filter(Boolean).join(' ');
}

/** ㊳품목번호 — 확정 HSK를 우선 쓰고, 없으면 서류 HS Code를 그대로 적는다. */
function hsCodeText(item: ImportItem | undefined): string {
  if (!item) return '';
  return text(item.confirmedHSCode) || text(item.documentHSCode);
}

/** (52)결제금액 — "인도조건-통화종류-금액-결제방법" */
function paymentAmountText(fields: ImportExtractedFields): string {
  return [
    text(fields.incoterms).split(/\s+/)[0],
    text(fields.currency),
    numberText(text(fields.totalAmount)),
    text(fields.paymentTerms),
  ].filter(Boolean).join('-');
}

export function mapImportDeclarationForm(data: ImportDeclarationFormData): Record<string, string> {
  const { fields, duty } = data;
  const item = fields.items[0];
  const itemCount = fields.items.length;
  const declarationDate = data.declarationDate ?? new Date();
  // 품목이 여러 건이면 갑지에는 1란만 들어간다 — 나머지는 을지(관세사 작성)라 건수만 표시한다.
  const goodsName = [text(item?.description), itemCount > 1 ? `외 ${itemCount - 1}건` : ''].filter(Boolean).join(' ');
  const dutyItem = duty?.items?.find((entry) => entry.itemId === item?.id) ?? duty?.items?.[0];

  return {
    // ①~⑨ — 신고번호·세관·징수형태는 신고 후 확정되거나 관세사가 적는다.
    decl_no: '',
    decl_date: dateText(declarationDate),
    customs_office: '',
    arrival_date: text(fields.estimatedArrivalDate),
    bl_no: text(fields.blNo),
    cargo_control_no: '',
    warehouse_in_date: '',
    collect_type: '',
    // ⑩~⑭ 당사자
    declarant: '',
    importer: text(fields.importerDetails.name) || text(data.importerCompanyName),
    taxpayer_address: text(fields.importerDetails.address) || text(data.importerAddress),
    taxpayer_company: text(fields.importerDetails.name) || text(data.importerCompanyName),
    taxpayer_tel: text(fields.importerDetails.phone) || text(data.importerTel),
    taxpayer_email: text(fields.importerDetails.email) || text(data.importerEmail),
    taxpayer_name: text(fields.importerDetails.contactName) || text(data.importerContactName),
    forwarder: '',
    overseas_partner: text(fields.exporterDetails.name) || text(fields.shipper),
    master_bl: '',
    carrier_code: '',
    inspect_place: '',
    // ⑮~㉖ 통관·운송 (부호칸은 관세사 작성)
    clearance_plan: '',
    decl_kind: '',
    trade_kind: '',
    goods_kind: '',
    co_yn: fields.certificateOfOriginAvailable ? 'Y' : '',
    price_decl_yn: '',
    total_weight: [numberText(text(fields.grossWeight)), text(fields.grossWeightUnit) || 'KG'].filter(Boolean).join(' '),
    total_packages: packagesText(fields),
    arrival_port: text(fields.dischargePort),
    transport_type: '',
    shipping_country: text(fields.originCountry) || text(item?.originCountry),
    vessel_name: text(fields.vesselName),
    // ㉚~㊺ 품목 1란
    first_goods_name: goodsName,
    first_trade_goods_name: text(item?.koreanDescription) || text(item?.description),
    first_brand: '',
    first_model_spec: [text(item?.modelName), text(item?.specification)].filter(Boolean).join(' '),
    first_composition: text(item?.composition) || text(item?.material),
    first_spec_qty: quantityText(item),
    first_unit_price: numberText(text(item?.unitPrice)),
    first_amount: numberText(text(item?.amount)),
    first_hs_code: hsCodeText(item),
    first_net_weight: numberText(text(item?.netWeight) || text(fields.netWeight)),
    first_post_check_org: '',
    first_customs_value_usd: numberText(text(fields.totalAmount)),
    first_customs_value_krw: money(dutyItem?.customsValue ?? duty?.customsValue),
    first_qty: quantityText(item),
    first_refund_qty: '',
    first_origin: text(item?.originCountry) || text(fields.originCountry),
    first_special_tax_basis: '',
    first_tax_type: duty ? '관세' : '',
    first_tax_rate: dutyItem ? `${dutyItem.basicRate}%` : '',
    first_reduction_rate: '',
    first_tax_amount: money(dutyItem?.basicDuty),
    // (52)~(62) 금액
    payment_amount: paymentAmountText(fields),
    exchange_rate: duty ? duty.exchangeRate.toLocaleString('ko-KR') : '',
    total_customs_value_usd: numberText(text(fields.totalAmount)),
    total_customs_value_krw: money(duty?.customsValue),
    freight: numberText(text(fields.freight)),
    insurance: numberText(text(fields.insurance)),
    addition_amount: numberText(text(fields.otherAdditions)),
    deduction_amount: '',
    total_vat_base: duty ? money(duty.customsValue + duty.basicDuty) : '',
    // (59)(61) 세액 — 계산한 관세·부가세만 채우고 나머지 내국세는 비운다.
    tax_customs: money(duty?.basicDuty),
    tax_excise: '',
    tax_traffic: '',
    tax_liquor: '',
    tax_education: '',
    tax_rural: '',
    tax_vat: money(duty?.vat),
    tax_late_penalty: '',
    tax_no_decl_penalty: '',
    total_tax: money(duty?.totalTax),
  };
}

let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error(`수입신고서 템플릿 로드 실패 (${response.status})`);
  templateCache = await response.arrayBuffer();
  return templateCache;
}

export async function buildImportDeclarationFormDocx(data: ImportDeclarationFormData): Promise<Blob> {
  const doc = new Docxtemplater(new PizZip(await loadTemplate()), {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(mapImportDeclarationForm(data));
  const out = doc.getZip().generate({ type: 'arraybuffer' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** 미리보기 — 다운로드와 같은 docx를 그대로 렌더한다. */
export async function renderImportDeclarationFormPreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}

export function importDeclarationFormFileName(): string {
  return portaiFileName('import_declaration');
}

export async function downloadImportDeclarationFormDocx(data: ImportDeclarationFormData): Promise<void> {
  const blob = await buildImportDeclarationFormDocx(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${importDeclarationFormFileName()}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
