import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { TransportRequestData } from '../types';
// 고정 템플릿(Shipping Instruction 표준 양식) — XML/서식 무수정, {{placeholder}} 값만 주입.
import templateUrl from '../../templates/shipping_instruction_template.docx?url';

/**
 * 수출 운송의뢰서(Shipping Instruction) 템플릿 스키마.
 * 참고 양식의 칸과 1:1 대응하며, 빈 값은 빈 문자열('')로 둔다 — "N/A" 치환 금지.
 */
export interface ShippingInstructionSchema {
  exporter: string;
  reference: string;
  buyer_reference: string;
  export_declaration_no: string;
  consignee: string;
  carrier: string;
  notify_party: string;
  method_of_dispatch: string;
  type_of_shipment: string;
  country_of_origin: string;
  country_of_final_destination: string;
  vessel: string;
  voyage_no: string;
  place_of_receipt: string;
  port_of_loading: string;
  date_of_departure: string;
  freight_charges: string;
  document_instructions: string;
  port_of_discharge: string;
  final_destination: string;
  incoterms: string;
  declared_value: string;
  marks: string;
  packages: string;
  description_of_goods: string;
  gross_weight: string;
  measurement: string;
  total_this_page: string;
  consignment_total: string;
  hazardous: string;
  letter_of_credit: string;
  special_instructions: string;
  place_and_date_of_issue: string;
  signatory_company: string;
  authorized_signatory: string;
}

const text = (value: unknown): string => String(value ?? '').trim();
const joinLines = (values: (string | undefined)[]): string => values.map(text).filter(Boolean).join('\n');
const numberText = (value: number): string =>
  Number.isFinite(value) && value > 0 ? value.toLocaleString('en-US') : '';

/** 마지막 쉼표 뒤를 국가로 본다 — 주소만 있을 때 원산지/목적국을 채우는 보조값. */
function countryFromAddress(address: string): string {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

/** FCL 컨테이너 표기 — "2 x 40HC". 규격이나 수량이 없으면 있는 값만 적는다. */
function containerText(sr: TransportRequestData): string {
  const quantity = Number(sr.containerQuantity) || 0;
  const size = text(sr.containerSize);
  if (!size) return '';
  return quantity > 0 ? `${quantity} x ${size}` : size;
}

/**
 * Special Instructions — 포워더가 선복·적재·부대업무를 잡을 때 필요한 내용만 적는다.
 * 값이 없는 항목은 줄 자체를 만들지 않는다("없음"을 적지 않는다).
 */
function specialInstructions(sr: TransportRequestData): string {
  const lines: string[] = [];
  if (sr.dangerousGoods) {
    lines.push(`Dangerous goods: YES${text(sr.dangerousGoodsDetail) ? ` (${text(sr.dangerousGoodsDetail)})` : ''}`);
  }
  if (text(sr.temperatureControl)) lines.push(`Temperature control: ${text(sr.temperatureControl)}`);
  const services = [
    sr.services?.insurance ? 'cargo insurance' : '',
    sr.services?.customsClearance ? 'export customs clearance' : '',
    sr.services?.inlandHaulage ? 'inland haulage' : '',
  ].filter(Boolean);
  if (services.length) lines.push(`Please arrange: ${services.join(', ')}.`);
  if (text(sr.paymentTerms)) lines.push(`Payment terms: ${text(sr.paymentTerms)}`);
  return joinLines(lines);
}

export function mapTransportRequestToSchema(sr: TransportRequestData): ShippingInstructionSchema {
  const totalPackages = sr.items.reduce((sum, item) => sum + (Number(item.packageCount) || 0), 0);
  const totalGross = sr.items.reduce((sum, item) => sum + (Number(item.grossWeight) || 0), 0);
  const totalCbm = sr.items.reduce((sum, item) => sum + (Number(item.measurement) || 0), 0);

  const packageLines = sr.items.map((item) => {
    const count = numberText(item.packageCount);
    return [count, item.packageType].map(text).filter(Boolean).join(' ');
  });
  // 품명 아래에 HS Code·수량을 덧붙여 한 칸에 담는다(참고 양식의 Description 칸 관행).
  const descriptionLines = sr.items.map((item) => {
    const detail = [
      item.hsCode ? `HS ${item.hsCode}` : '',
      numberText(item.quantity) ? `${numberText(item.quantity)} ${text(item.unit)}`.trim() : '',
    ].filter(Boolean).join(' / ');
    return detail ? `${text(item.description)} (${detail})` : text(item.description);
  });

  const summary = [
    totalPackages > 0 ? `${totalPackages.toLocaleString('en-US')} PKGS` : '',
    totalGross > 0 ? `${totalGross.toLocaleString('en-US')} KGS` : '',
    totalCbm > 0 ? `${totalCbm.toLocaleString('en-US')} M3` : '',
  ].filter(Boolean).join(' / ');

  const incoterms = [sr.incoterms, sr.incotermsPlace].map(text).filter(Boolean).join(' ');

  return {
    exporter: joinLines([
      sr.exporter.name,
      sr.exporter.address,
      sr.exporter.contact ? `Tel: ${text(sr.exporter.contact)}` : '',
      sr.businessRegistrationNo ? `Business No.: ${text(sr.businessRegistrationNo)}` : '',
    ]),
    reference: text(sr.requestNo),
    buyer_reference: text(sr.invoiceNo),
    export_declaration_no: '',
    consignee: joinLines([sr.consignee.name, sr.consignee.address, sr.consignee.contact]),
    // 운송인은 포워더가 부킹 후 확정하므로 화주 단계에서는 비워 둔다.
    carrier: '',
    notify_party: joinLines([sr.notifyParty?.name, sr.notifyParty?.address, sr.notifyParty?.contact]),
    method_of_dispatch: sr.methodOfDispatch === 'AIR' ? 'AIR' : 'SEA',
    // FCL이면 컨테이너 규격·수량까지 한 줄로 적는다(예: FCL / 2 x 40HC).
    type_of_shipment: [text(sr.loadingMode), containerText(sr)].filter(Boolean).join(' / '),
    country_of_origin: countryFromAddress(text(sr.exporter.address)),
    country_of_final_destination: countryFromAddress(
      text(sr.placeOfDelivery) || text(sr.consignee.address),
    ),
    vessel: '',
    voyage_no: '',
    place_of_receipt: text(sr.placeOfReceipt),
    port_of_loading: text(sr.loadPort),
    date_of_departure: text(sr.requestedDepartureDate),
    freight_charges: text(sr.freightTerms),
    document_instructions: '',
    port_of_discharge: text(sr.dischargePort),
    final_destination: text(sr.placeOfDelivery),
    incoterms,
    declared_value: '',
    marks: joinLines([...new Set(sr.items.map((item) => text(item.marksAndNumbers)))]) || text(sr.shippingMarks),
    packages: joinLines(packageLines),
    description_of_goods: joinLines(descriptionLines),
    gross_weight: totalGross > 0 ? totalGross.toLocaleString('en-US') : '',
    measurement: totalCbm > 0 ? totalCbm.toLocaleString('en-US') : '',
    total_this_page: summary,
    consignment_total: summary,
    hazardous: sr.dangerousGoods ? 'YES' : 'NO',
    letter_of_credit: /l\/?c/i.test(text(sr.paymentTerms)) ? 'YES' : 'NO',
    special_instructions: specialInstructions(sr),
    place_and_date_of_issue: text(sr.requestDate),
    signatory_company: text(sr.exporter.name),
    authorized_signatory: text(sr.requesterName),
  };
}

let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;

  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`수출 운송의뢰서 템플릿 로드 실패 (${response.status})`);
  }
  templateCache = await response.arrayBuffer();
  return templateCache;
}

/** 운송의뢰서 스키마를 고정 템플릿에 주입해 DOCX Blob을 반환한다. */
export async function exportTransportRequest(data: ShippingInstructionSchema): Promise<Blob> {
  const content = await loadTemplate();
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  doc.render(data as unknown as Record<string, unknown>);

  const output = doc.getZip().generate({ type: 'arraybuffer' }) as ArrayBuffer;
  return new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** TransportRequestData → DOCX Blob */
export async function buildTransportRequestDocx(sr: TransportRequestData): Promise<Blob> {
  return exportTransportRequest(mapTransportRequestToSchema(sr));
}

/** 생성된 DOCX Blob을 브라우저에서 미리보기로 렌더한다. */
export async function renderTransportRequestDocxPreview(
  blob: Blob,
  container: HTMLElement,
): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview',
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
  });
}
