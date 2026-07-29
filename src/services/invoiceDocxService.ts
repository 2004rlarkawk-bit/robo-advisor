import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { InvoiceData } from '../types';
// 고정 템플릿(무역협회 표준 상업송장) — XML/서식 무수정, {{placeholder}} 값만 주입.
import templateUrl from '../../templates/commercial_invoice_template.docx?url';

/**
 * 상업송장 템플릿 스키마 (템플릿의 {{placeholder}} 36개와 1:1).
 * 모든 값은 문자열이며, 빈 값은 빈 문자열('')로 둔다 — "N/A" 치환 금지.
 */
export interface InvoiceSchema {
  shipper_biz_no: string;
  shipper_name: string;
  shipper_address1: string;
  shipper_address2: string;

  consignee_name: string;
  consignee_address1: string;
  consignee_address2: string;
  consignee_address3: string;

  buyer_name: string;
  buyer_address1: string;
  buyer_address2: string;
  buyer_address3: string;

  invoice_no: string;
  invoice_date: string;
  lc_no_and_date: string;
  other_references: string;

  country_of_origin: string;
  departure_date: string;
  vessel_flight: string;
  from_port: string;
  to_port: string;

  terms_of_delivery: string;
  terms_of_payment: string;

  marks_line1: string;
  marks_line2: string;
  marks_line3: string;
  marks_line4: string;
  marks_line5: string;

  packages: string;

  goods_description: string;
  goods_spec: string;
  goods_note1: string;
  goods_note2: string;
  goods_note3: string;

  quantity: string;
  net_weight: string;
  unit_price: string;
  amount: string;

  signed_by: string;
}

const ZERO_DECIMAL_CCY = new Set(['KRW', 'JPY']);

function fmtMoney(n: number, currency: string): string {
  const digits = ZERO_DECIMAL_CCY.has((currency || '').toUpperCase()) ? 0 : 2;

  const num = n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

  return currency ? `${currency} ${num}` : num;
}

/** 여러 줄 문자열을 max개 라인으로 분해(부족분은 빈칸) */
function splitLines(s: string | undefined, max: number): string[] {
  const parts = (s || '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from({ length: max }, (_, index) => parts[index] || '');
}

const tel = (contact?: string): string =>
  contact && contact.trim() ? `TEL: ${contact.trim()}` : '';

// 도착지 지칭 Incoterms — 인도조건 뒤에는 도착항(⑥To)을 명기해야 한다.
// 선적지 지칭 FOB/EXW 등은 선적항을 사용한다.
// 과거에는 조건과 관계없이 선적항을 붙여 "CIF 광양"처럼 표시되는 문제가 있었다.
const DEST_INCOTERMS = new Set([
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
]);

/**
 * DocumentAgent가 조립한 InvoiceData → 템플릿 스키마 매핑.
 * DocumentAgent가 이미 미입력을 빈 값으로 두므로
 * 여기서도 빈칸을 그대로 전달한다("N/A" 금지).
 */
export function mapInvoiceToSchema(inv: InvoiceData): InvoiceSchema {
  const data = inv as Record<string, any>;
  const items = (inv.items || []) as Record<string, any>[];
  const firstItem = items[0] || {};

  const currency = inv.currency || '';

  const seller = inv.seller || {
    name: '',
    address: '',
    contact: '',
  };

  const consignee = inv.consignee || {
    name: '',
    address: '',
    contact: '',
  };

  const buyer = data.buyer as
    | {
        name?: string;
        address?: string;
        contact?: string;
        country?: string;
      }
    | undefined;

  const marks = splitLines(data.shippingMarks, 5);

  const incoterms = (inv.incoterms || '').toUpperCase();

  const incotermsPlace =
    data.incotermsPlace ||
    (DEST_INCOTERMS.has(incoterms)
      ? inv.dischargePort
      : inv.loadPort);

  return {
    shipper_biz_no: data.sellerTaxNo || '',
    shipper_name: seller.name || '',
    shipper_address1: seller.address || '',
    shipper_address2: tel(seller.contact),

    consignee_name: consignee.name || '',
    consignee_address1: consignee.address || '',
    consignee_address2: tel(consignee.contact),
    consignee_address3: consignee.country || '',

    buyer_name: buyer?.name || '',
    buyer_address1: buyer?.address || '',
    buyer_address2: tel(buyer?.contact),
    buyer_address3: buyer?.country || '', // Buyer 국가 — 인보이스 DOCX에 표기

    invoice_no: inv.invoiceNo || '',
    invoice_date: inv.invoiceDate || '',

    lc_no_and_date: [data.lcNo, data.lcDate]
      .filter(Boolean)
      .join(' / '),

    other_references: data.otherReferences || '',

    country_of_origin:
      firstItem.countryOfOrigin ||
      data.countryOfOrigin ||
      '',

    departure_date: inv.departureDate || '',
    vessel_flight: data.vessel || '',
    from_port: inv.loadPort || '',
    to_port: inv.dischargePort || '',

    terms_of_delivery: [
      inv.incoterms,
      incotermsPlace,
    ]
      .filter(Boolean)
      .join(' '),

    terms_of_payment: data.paymentTerms || '',

    marks_line1: marks[0],
    marks_line2: marks[1],
    marks_line3: marks[2],
    marks_line4: marks[3],
    marks_line5: marks[4],

    packages: data.packageCount
      ? `${data.packageCount} ${data.packageType || ''}`.trim()
      : '',

    goods_description: items
      .map((item) => item.description || '')
      .filter(Boolean)
      .join('\n'),

    goods_spec: items
      .map((item) =>
        item.hsCode
          ? `HS CODE: ${item.hsCode}`
          : '',
      )
      .filter(Boolean)
      .join('\n'),

    goods_note1: '',
    goods_note2: '',
    goods_note3: '',

    quantity: items
      .map((item) => {
        if (!item.quantity) return '';

        const quantity = Number(item.quantity).toLocaleString();
        const unit = item.unit ? ` ${item.unit}` : '';

        return `${quantity}${unit}`;
      })
      .filter(Boolean)
      .join('\n'),

    net_weight: firstItem.netWeight
      ? `${Number(firstItem.netWeight).toLocaleString()} KG`
      : '',

    unit_price: items
      .map((item) =>
        item.unitPrice
          ? fmtMoney(Number(item.unitPrice), currency)
          : '',
      )
      .filter(Boolean)
      .join('\n'),

    amount: items
      .map((item) =>
        item.amount
          ? fmtMoney(Number(item.amount), currency)
          : '',
      )
      .filter(Boolean)
      .join('\n'),

    signed_by: data.signedBy || '',
  };
}

let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) {
    return templateCache;
  }

  const response = await fetch(templateUrl);

  if (!response.ok) {
    throw new Error(
      `상업송장 템플릿 로드 실패 (${response.status})`,
    );
  }

  templateCache = await response.arrayBuffer();

  return templateCache;
}

/**
 * 상업송장 스키마 데이터를 고정 템플릿에 주입해 DOCX Blob을 반환한다.
 *
 * 템플릿의 XML/서식은 건드리지 않고 {{placeholder}}만 치환하므로
 * 셀 비율과 테두리가 원본과 동일하게 유지된다.
 *
 * TODO(backend):
 * PDF 변환은 백엔드 LibreOffice 도입 시 이 함수와 연결한다.
 *
 * 서버에서 다음과 같은 방식으로 변환할 수 있다.
 *
 * soffice --headless --convert-to pdf <invoice.docx>
 *
 * 현재는 정적 프론트엔드 배포 환경이므로 DOCX Blob만 반환한다.
 */
export async function exportInvoice(
  data: InvoiceSchema,
): Promise<Blob> {
  const content = await loadTemplate();
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    delimiters: {
      start: '{{',
      end: '}}',
    },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });

  doc.render(
    data as unknown as Record<string, unknown>,
  );

  const output = doc
    .getZip()
    .generate({
      type: 'arraybuffer',
    }) as ArrayBuffer;

  return new Blob([output], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/** InvoiceData → DOCX Blob */
export async function buildInvoiceDocx(
  invoice: InvoiceData,
): Promise<Blob> {
  return exportInvoice(
    mapInvoiceToSchema(invoice),
  );
}

/**
 * 생성된 DOCX Blob을 브라우저에서 미리보기로 렌더한다.
 *
 * 호출부에서 다운로드에 사용하는 것과 동일한 Blob을 넘겨야
 * 미리보기와 다운로드 문서 내용이 일치한다.
 */
export async function renderInvoiceDocxPreview(
  blob: Blob,
  container: HTMLElement,
): Promise<void> {
  container.innerHTML = '';

  await renderAsync(
    blob,
    container,
    undefined,
    {
      className: 'docx-preview',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    },
  );
}