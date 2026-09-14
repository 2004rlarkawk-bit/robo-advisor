import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { BillOfLadingData, NumericInput } from '../types';
// 고정 템플릿(무역협회 표준 선하증권) — XML/서식 무수정, {{placeholder}} 값만 주입.
import templateUrl from '../../templates/bill_of_lading_template.docx?url';

/**
 * 선하증권 템플릿 스키마 — 템플릿의 {{placeholder}} 36개와 1:1.
 * 항목 번호는 무역협회 서식의 ①~㉘ 표기를 따른다.
 * 모든 값은 문자열이며, 빈 값은 빈 문자열('')로 둔다 — "N/A" 치환 금지.
 */
export interface BillOfLadingSchema {
  shipper_name: string;        // ① Shipper/Exporter
  shipper_address: string;
  consignee: string;           // ② Consignee
  notify_name: string;         // ③ Notify Party
  notify_address: string;
  ocean_vessel: string;        // ④ Ocean Vessel
  port_of_loading: string;     // ⑤ Port of Loading
  place_of_receipt: string;    // ⑥ Place of Receipt
  voyage_no: string;           // ⑦ Voyage No.
  port_of_discharge: string;   // ⑧ Port of Discharge
  place_of_delivery: string;   // ⑨ Place of Delivery
  final_destination: string;   // ⑩ Final Destination
  bl_no: string;               // ⑪ B/L No.
  flag: string;                // ⑫ Flag
  pre_carriage_by: string;     // Pre-Carriage by
  container_seal_marks: string;      // ⑬⑭ Container No. / Seal No. / Marks & No
  total_packages_in_words: string;   // Total No. of Containers or Packages (in words)
  packages: string;            // ⑮ No. & Kinds of Containers or Packages
  goods_description: string;   // ⑯ Description of Goods
  goods_detail: string;
  gross_weight: string;        // ⑰ Gross Weight
  measurement: string;         // Measurement
  freight_and_charges: string; // ⑱ Freight and Charges
  revenue_tons: string;        // ⑲ Revenue tons
  rate: string;                // ⑳ Rate
  per: string;                 // ㉑ Per
  prepaid: string;             // ㉒ Prepaid
  collect: string;             // ㉓ Collect
  freight_prepaid_at: string;  // ㉔ Freight prepaid at
  freight_payable_at: string;  // ㉕ Freight payable at
  total_prepaid_in: string;
  no_of_original_bl: string;   // ㉖ No. of original B/L
  place_and_date_of_issue: string;  // ㉗ Place and Date of Issue
  laden_on_board_date: string;      // ㉘ Laden on board vessel — Date
  issuer_name: string;              // 발행자
  signer_capacity: string;          // 발행 자격
}

const NUMBER_WORDS = [
  'ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
  'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN',
  'EIGHTEEN', 'NINETEEN',
];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

/**
 * 총 수량을 영문 문자로 표기한다.
 * 선하증권은 유통증권이라 숫자 위·변조를 막기 위해 총수량을 문자로 함께 적는 것이 관행이다.
 * (예: 28 → "TWENTY EIGHT (28) CARTONS ONLY")
 */
export function packagesInWords(count: NumericInput, kind: string): string {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';

  const spell = (n: number): string => {
    if (n < 20) return NUMBER_WORDS[n];
    if (n < 100) {
      const rest = n % 10;
      return TENS[Math.floor(n / 10)] + (rest ? ` ${NUMBER_WORDS[rest]}` : '');
    }
    if (n < 1000) {
      const rest = n % 100;
      return `${NUMBER_WORDS[Math.floor(n / 100)]} HUNDRED${rest ? ` ${spell(rest)}` : ''}`;
    }
    const rest = n % 1000;
    return `${spell(Math.floor(n / 1000))} THOUSAND${rest ? ` ${spell(rest)}` : ''}`;
  };

  const unit = kind.trim().toUpperCase();
  const plural = unit && !unit.endsWith('S') ? `${unit}S` : unit;
  return `${spell(value)} (${value.toLocaleString('en-US')}) ${plural} ONLY`.replace(/\s+/g, ' ').trim();
}

const text = (value: unknown): string => String(value ?? '').trim();
const numberText = (value: NumericInput): string =>
  value === '' || value === null || value === undefined || !Number.isFinite(Number(value))
    ? ''
    : Number(value).toLocaleString('en-US');

/** 여러 품목을 한 칸에 줄바꿈으로 나열한다(템플릿 linebreaks 옵션 사용). */
const joinLines = (values: string[]): string => values.filter(Boolean).join('\n');

export function mapBillOfLadingToSchema(bl: BillOfLadingData): BillOfLadingSchema {
  const totals = bl.cargoTotals;
  const firstKind = bl.items.find((item) => item.kindOfPackages.trim())?.kindOfPackages ?? '';

  // ⑬⑭ 칸에는 컨테이너 번호·Seal 번호·화인을 함께 적는다(서식이 한 칸으로 묶여 있음).
  const marks = joinLines([...new Set(bl.items.map((item) => item.marksAndNumbers.trim()))]);
  const containerSealMarks = joinLines([
    bl.containerNo ? `CNTR ${bl.containerNo}` : '',
    bl.sealNo ? `SEAL ${bl.sealNo}` : '',
    marks,
  ]);

  const packageLines = bl.items.map((item) => {
    const count = numberText(item.numberOfPackages);
    return count ? `${count} ${item.kindOfPackages}`.trim() : item.kindOfPackages.trim();
  });

  const prepaid = bl.freightTerms === 'PREPAID';
  const collect = bl.freightTerms === 'COLLECT';
  const issueParts = [bl.placeOfIssue, bl.dateOfIssue].filter(Boolean);

  return {
    shipper_name: text(bl.shipper.name),
    shipper_address: text(bl.shipper.address),
    consignee: joinLines([text(bl.consignee.name), text(bl.consignee.address)]),
    notify_name: text(bl.notifyParty?.name),
    notify_address: text(bl.notifyParty?.address),
    ocean_vessel: text(bl.vessel),
    port_of_loading: text(bl.loadPort),
    place_of_receipt: text(bl.placeOfReceipt),
    voyage_no: text(bl.voyageNo),
    port_of_discharge: text(bl.dischargePort),
    place_of_delivery: text(bl.placeOfDelivery),
    final_destination: text(bl.finalDestination),
    // 정식 발행 전이면 초안 번호를 적어 원본과 구분되게 한다.
    bl_no: text(bl.blNo) || `${text(bl.draftNo)} (DRAFT)`,
    flag: text(bl.flag),
    pre_carriage_by: text(bl.preCarriageBy),
    container_seal_marks: containerSealMarks,
    total_packages_in_words: packagesInWords(totals.numberOfPackages, firstKind),
    packages: joinLines(packageLines),
    goods_description: joinLines(bl.items.map((item) => item.descriptionOfGoods.trim())),
    goods_detail: '',
    gross_weight: totals.grossWeightKg === '' ? '' : `${numberText(totals.grossWeightKg)} KGS`,
    measurement: totals.measurementCbm ? `${totals.measurementCbm} CBM` : '',
    freight_and_charges: text(bl.freightAndCharges) || (bl.freightTerms ? 'AS ARRANGED' : ''),
    revenue_tons: text(bl.revenueTons),
    rate: text(bl.freightRate),
    per: text(bl.freightPer),
    // ㉒㉓은 금액 칸이다. 금액을 모르면 비워 두고, 선불/후불 구분은 ⑱ Freight and Charges가 표시한다.
    prepaid: prepaid ? text(bl.totalPrepaid) : '',
    collect: collect ? text(bl.collectAmount) : '',
    freight_prepaid_at: prepaid ? text(bl.freightPrepaidAt) : '',
    freight_payable_at: collect ? text(bl.freightPayableAt) : '',
    total_prepaid_in: prepaid ? text(bl.totalPrepaid) : '',
    no_of_original_bl: bl.numberOfOriginals > 0 ? packagesInWords(bl.numberOfOriginals, '').replace(' ONLY', '') : '',
    place_and_date_of_issue: issueParts.join(', '),
    laden_on_board_date: text(bl.shippedOnBoardDate),
    issuer_name: text(bl.issuerName),
    signer_capacity: bl.signerCapacity === 'AS_CARRIER' ? 'as Carrier' : 'as agent for a carrier',
  };
}

let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;

  const response = await fetch(templateUrl);
  if (!response.ok) {
    throw new Error(`선하증권 템플릿 로드 실패 (${response.status})`);
  }
  templateCache = await response.arrayBuffer();
  return templateCache;
}

/**
 * 선하증권 스키마 데이터를 고정 템플릿에 주입해 DOCX Blob을 반환한다.
 * 템플릿의 XML/서식은 건드리지 않고 {{placeholder}}만 치환하므로
 * 무역협회 서식의 셀 비율과 테두리가 원본 그대로 유지된다.
 */
export async function exportBillOfLading(data: BillOfLadingSchema): Promise<Blob> {
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

/** BillOfLadingData → DOCX Blob */
export async function buildBillOfLadingDocx(bl: BillOfLadingData): Promise<Blob> {
  return exportBillOfLading(mapBillOfLadingToSchema(bl));
}

/**
 * 생성된 DOCX Blob을 브라우저에서 미리보기로 렌더한다.
 * 다운로드에 쓰는 것과 같은 Blob을 넘겨야 미리보기와 문서 내용이 일치한다.
 */
export async function renderBillOfLadingDocxPreview(
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
