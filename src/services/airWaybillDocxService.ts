import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { BillOfLadingData, NumericInput } from '../types';
// 고정 서식(House Air Waybill) — 칸 구성은 화주가 준 견본을 그대로 옮겼고, {{placeholder}} 값만 주입한다.
import templateUrl from '../../templates/air_waybill_template.docx?url';

/**
 * 항공화물운송장(AWB) 스키마 — 서식의 {{placeholder}}와 1:1.
 * 항목 이름은 항공운송장 표준 양식(IATA Resolution 600a)의 칸 이름을 따른다.
 * 모든 값은 문자열이며, 빈 값은 빈 문자열로 둔다 — "N/A" 치환 금지.
 */
export interface AirWaybillSchema {
  awb_no: string;                  // HAWB No.
  shipper_name: string;            // Shipper's Name and Address
  shipper_address: string;
  shipper_account_no: string;      // Shipper's Account Number
  consignee_name: string;          // Consignee's Name and Address
  consignee_address: string;
  consignee_account_no: string;
  issuer_name: string;             // Issued by / Signature of Issuing Forwarder
  issuer_address: string;
  mawb_reference: string;          // 연결된 Master AWB 번호
  forwarder_reference: string;     // 포워더 참조번호(부킹·송장번호)
  airport_of_departure: string;
  requested_routing: string;
  airport_of_destination: string;
  flight_and_date: string;         // Flight / Date
  issuing_carrier: string;         // Issuing Forwarder's Agent
  agent_iata_code: string;
  account_no: string;
  accounting_information: string;  // FREIGHT PREPAID / COLLECT
  currency: string;
  declared_value_carriage: string; // 없으면 NVD
  declared_value_customs: string;  // 없으면 NCV
  amount_of_insurance: string;     // 없으면 NIL
  handling_information: string;
  sci: string;                     // Special Customs Information
  service_level: string;
  incoterms: string;
  no_of_pieces: string;
  gross_weight: string;
  rate_class: string;
  commodity_item_no: string;
  chargeable_weight: string;
  rate_charge: string;
  total_charge: string;
  goods_description: string;       // Nature and Quantity of Goods
  goods_detail: string;
  marks_and_numbers: string;
  prepaid: string;
  collect: string;
  other_charges: string;
  weight_charge: string;
  valuation_charge: string;
  tax: string;
  total_prepaid: string;
  charges_at_destination: string;
  total_collect_charges: string;
  currency_conversion_rate: string;
  cc_charges_destination: string;
  date_of_issue: string;           // Executed on
  place_of_issue: string;          // at
  signer_capacity: string;
}

const text = (value: string | undefined): string => (value ?? '').trim();

const numberText = (value: NumericInput | undefined): string =>
  value === '' || value === undefined || value === null || Number.isNaN(Number(value))
    ? ''
    : Number(value).toLocaleString('en-US');

const joinLines = (values: string[]): string => values.filter(Boolean).join('\n');

export function mapAirWaybillToSchema(awb: BillOfLadingData): AirWaybillSchema {
  const totals = awb.cargoTotals;
  const prepaid = awb.freightTerms === 'PREPAID';
  const collect = awb.freightTerms === 'COLLECT';

  const pieceLines = awb.items.map((item) => {
    const count = numberText(item.numberOfPackages);
    return count ? `${count} ${item.kindOfPackages}`.trim() : item.kindOfPackages.trim();
  });
  const totalPieces = numberText(totals.numberOfPackages);
  const firstKind = awb.items.find((item) => item.kindOfPackages.trim())?.kindOfPackages ?? '';

  return {
    // 정식 번호를 받기 전이면 초안 번호를 적어 실제 운송장과 구분되게 한다.
    awb_no: text(awb.awbNo) || `${text(awb.draftNo)} (DRAFT)`,
    shipper_name: text(awb.shipper.name),
    shipper_address: text(awb.shipper.address),
    shipper_account_no: '',
    consignee_name: text(awb.consignee.name),
    consignee_address: text(awb.consignee.address),
    consignee_account_no: '',
    issuer_name: text(awb.issuerName),
    issuer_address: '',
    mawb_reference: text(awb.masterDocumentNo),
    forwarder_reference: text(awb.bookingNo),
    airport_of_departure: text(awb.loadPort),
    // 경유 없이 직항으로 보는 기본 표기 — 출발지 - 도착지.
    requested_routing: [text(awb.loadPort), text(awb.dischargePort)].filter(Boolean).join(' - '),
    airport_of_destination: text(awb.dischargePort),
    flight_and_date: [text(awb.vessel), text(awb.flightDate)].filter(Boolean).join(' / '),
    issuing_carrier: text(awb.carrier),
    agent_iata_code: '',
    account_no: '',
    accounting_information: prepaid ? 'FREIGHT PREPAID' : collect ? 'FREIGHT COLLECT' : '',
    currency: '',
    // 신고가격을 적지 않으면 운송신고는 NVD, 세관신고는 NCV로 적는 것이 항공 실무 관행이다.
    declared_value_carriage: text(awb.declaredValueCarriage) || 'NVD',
    declared_value_customs: text(awb.declaredValueCustoms) || 'NCV',
    amount_of_insurance: 'NIL',
    handling_information: text(awb.handlingInformation),
    sci: '',
    service_level: '',
    incoterms: text(awb.incoterms),
    no_of_pieces: totalPieces ? `${totalPieces} ${firstKind}`.trim() : joinLines(pieceLines),
    gross_weight: totals.grossWeightKg === '' ? '' : `${numberText(totals.grossWeightKg)} KG`,
    rate_class: '',
    commodity_item_no: '',
    chargeable_weight: text(awb.revenueTons),
    rate_charge: text(awb.freightRate) && text(awb.freightPer)
      ? `${text(awb.freightRate)} / ${text(awb.freightPer)}`
      : text(awb.freightRate),
    total_charge: prepaid ? text(awb.totalPrepaid) : text(awb.collectAmount),
    goods_description: joinLines(awb.items.map((item) => item.descriptionOfGoods.trim())),
    goods_detail: joinLines(pieceLines),
    marks_and_numbers: joinLines([...new Set(awb.items.map((item) => item.marksAndNumbers.trim()))]),
    prepaid: prepaid ? (text(awb.totalPrepaid) || text(awb.freightAndCharges) || 'AS ARRANGED') : '',
    collect: collect ? (text(awb.collectAmount) || text(awb.freightAndCharges) || 'AS ARRANGED') : '',
    other_charges: '',
    weight_charge: prepaid ? text(awb.totalPrepaid) : text(awb.collectAmount),
    valuation_charge: '',
    tax: '',
    total_prepaid: prepaid ? text(awb.totalPrepaid) : '',
    charges_at_destination: collect ? text(awb.freightPayableAt) : '',
    total_collect_charges: collect ? text(awb.collectAmount) : '',
    currency_conversion_rate: '',
    cc_charges_destination: '',
    date_of_issue: text(awb.dateOfIssue),
    place_of_issue: text(awb.placeOfIssue),
    signer_capacity: awb.signerCapacity === 'AS_CARRIER' ? 'as Carrier' : 'as agent for a carrier',
  };
}

let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;

  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`항공화물운송장 서식 로드 실패 (${response.status})`);
  }
  templateCache = await response.arrayBuffer();
  return templateCache;
}

/** 항공화물운송장 스키마를 고정 서식에 주입해 DOCX Blob을 반환한다. */
export async function exportAirWaybill(data: AirWaybillSchema): Promise<Blob> {
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

/** BillOfLadingData(transportMode: 'AIR') → DOCX Blob */
export async function buildAirWaybillDocx(awb: BillOfLadingData): Promise<Blob> {
  return exportAirWaybill(mapAirWaybillToSchema(awb));
}

export async function renderAirWaybillDocxPreview(
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
