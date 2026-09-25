/**
 * House Air Waybill 서식 생성기.
 * 화주가 준 견본(House_Air_Waybill_HAWB.docx 안의 이미지)의 칸 구성을 그대로 Word 표로 옮기고,
 * 값 자리에는 docxtemplater 치환자({{key}})만 넣는다.
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, VerticalAlign, ShadingType,
} = require('docx');

// A4 세로, 좌우 여백 0.5인치 → 본문 폭 11906 - 1440 = 10466 DXA
const PAGE = { width: 11906, height: 16838 };
const MARGIN = 720;
const CONTENT = PAGE.width - MARGIN * 2;

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border };
const CELL_MARGINS = { top: 60, bottom: 60, left: 90, right: 90 };

const label = (t) => new Paragraph({
  spacing: { after: 20 },
  children: [new TextRun({ text: t, size: 14, font: 'Arial', color: '444444' })],
});
const value = (t, opts = {}) => new Paragraph({
  spacing: { after: 0 },
  alignment: opts.align,
  children: [new TextRun({ text: t, size: opts.size ?? 18, bold: opts.bold, font: 'Arial' })],
});
const note = (t) => new Paragraph({
  spacing: { after: 0 },
  children: [new TextRun({ text: t, size: 13, font: 'Arial', color: '444444' })],
});

function cell(widths, children, opts = {}) {
  return new TableCell({
    borders,
    width: { size: widths, type: WidthType.DXA },
    columnSpan: opts.span,
    margins: CELL_MARGINS,
    verticalAlign: opts.valign ?? VerticalAlign.TOP,
    shading: opts.shade ? { fill: opts.shade, type: ShadingType.CLEAR } : undefined,
    children,
  });
}

/** 라벨 + 치환자 한 칸 */
function field(width, labelText, placeholders, opts = {}) {
  const lines = Array.isArray(placeholders) ? placeholders : [placeholders];
  return cell(width, [label(labelText), ...lines.map((p) => value(p, opts))], opts);
}

function table(columnWidths, rows) {
  return new Table({
    width: { size: CONTENT, type: WidthType.DXA },
    columnWidths,
    rows,
  });
}

// ── 1. 당사자·운송장 번호 ────────────────────────────────────────────
const partyWidths = [3000, 2000, 2466, 3000];
const partyTable = table(partyWidths, [
  new TableRow({
    children: [
      field(partyWidths[0], "Shipper's Name and Address", ['{{shipper_name}}', '{{shipper_address}}']),
      field(partyWidths[1], "Shipper's Account Number", '{{shipper_account_no}}'),
      cell(partyWidths[2], [
        value('NOT NEGOTIABLE', { align: AlignmentType.CENTER, size: 15 }),
        value('HOUSE AIR WAYBILL', { align: AlignmentType.CENTER, size: 24, bold: true }),
      ], { valign: VerticalAlign.CENTER }),
      cell(partyWidths[3], [
        label('HAWB No.'),
        value('{{awb_no}}', { size: 22, bold: true }),
        new Paragraph({ spacing: { before: 80, after: 0 }, children: [new TextRun({ text: 'Issued by', size: 14, font: 'Arial', color: '444444' })] }),
        value('{{issuer_name}}'),
        value('{{issuer_address}}'),
      ]),
    ],
  }),
  new TableRow({
    children: [
      field(partyWidths[0], "Consignee's Name and Address", ['{{consignee_name}}', '{{consignee_address}}']),
      field(partyWidths[1], "Consignee's Account Number", '{{consignee_account_no}}'),
      cell(partyWidths[2], [
        note('This House Air Waybill is issued by the forwarder and is subject to the forwarder’s applicable conditions of carriage. It is not a document of title.'),
      ]),
      cell(partyWidths[3], [
        label('MAWB Reference'),
        value('{{mawb_reference}}', { size: 20 }),
        new Paragraph({ spacing: { before: 80, after: 0 }, children: [new TextRun({ text: 'Forwarder Reference', size: 14, font: 'Arial', color: '444444' })] }),
        value('{{forwarder_reference}}'),
      ]),
    ],
  }),
]);

// ── 2. 구간·대리점·신고가격·취급 ─────────────────────────────────────
const routeWidths = [2616, 2617, 2617, 2616];
const routeTable = table(routeWidths, [
  new TableRow({
    children: [
      field(routeWidths[0], 'Airport of Departure', '{{airport_of_departure}}'),
      field(routeWidths[1], 'Requested Routing', '{{requested_routing}}'),
      field(routeWidths[2], 'Airport of Destination', '{{airport_of_destination}}'),
      field(routeWidths[3], 'Flight / Date', '{{flight_and_date}}'),
    ],
  }),
  new TableRow({
    children: [
      field(routeWidths[0], "Issuing Forwarder's Agent", '{{issuing_carrier}}'),
      field(routeWidths[1], 'Agent IATA Code', '{{agent_iata_code}}'),
      field(routeWidths[2], 'Account No.', '{{account_no}}'),
      field(routeWidths[3], 'Accounting Information', '{{accounting_information}}'),
    ],
  }),
]);

const valueTable = table(routeWidths, [
  new TableRow({
    children: [
      field(routeWidths[0], 'Currency', '{{currency}}'),
      field(routeWidths[1], 'Declared Value for Carriage', '{{declared_value_carriage}}'),
      field(routeWidths[2], 'Declared Value for Customs', '{{declared_value_customs}}'),
      field(routeWidths[3], 'Amount of Insurance', '{{amount_of_insurance}}'),
    ],
  }),
  new TableRow({
    children: [
      field(routeWidths[0], 'Handling Information', '{{handling_information}}'),
      field(routeWidths[1], 'SCI', '{{sci}}'),
      field(routeWidths[2], 'Service Level', '{{service_level}}'),
      field(routeWidths[3], 'Incoterms', '{{incoterms}}'),
    ],
  }),
]);

// ── 3. 화물 명세 ────────────────────────────────────────────────────
const cargoWidths = [1300, 1400, 1100, 1700, 1700, 1700, 1566];
const cargoTable = table(cargoWidths, [
  new TableRow({
    children: [
      cell(cargoWidths[0], [label('No. of Pieces')], { shade: 'F2F2F2' }),
      cell(cargoWidths[1], [label('Gross Weight')], { shade: 'F2F2F2' }),
      cell(cargoWidths[2], [label('Rate Class')], { shade: 'F2F2F2' }),
      cell(cargoWidths[3], [label('Commodity Item No.')], { shade: 'F2F2F2' }),
      cell(cargoWidths[4], [label('Chargeable Weight')], { shade: 'F2F2F2' }),
      cell(cargoWidths[5], [label('Rate / Charge')], { shade: 'F2F2F2' }),
      cell(cargoWidths[6], [label('Total')], { shade: 'F2F2F2' }),
    ],
  }),
  new TableRow({
    children: [
      cell(cargoWidths[0], [value('{{no_of_pieces}}')]),
      cell(cargoWidths[1], [value('{{gross_weight}}')]),
      cell(cargoWidths[2], [value('{{rate_class}}')]),
      cell(cargoWidths[3], [value('{{commodity_item_no}}')]),
      cell(cargoWidths[4], [value('{{chargeable_weight}}')]),
      cell(cargoWidths[5], [value('{{rate_charge}}')]),
      cell(cargoWidths[6], [value('{{total_charge}}')]),
    ],
  }),
  new TableRow({
    children: [
      cell(CONTENT, [
        label('Nature and Quantity of Goods'),
        value('{{goods_description}}', { size: 20, bold: true }),
        value('{{goods_detail}}'),
        value('{{marks_and_numbers}}'),
      ], { span: 7 }),
    ],
  }),
]);

// ── 4. 운임 정산 ────────────────────────────────────────────────────
const chargeWidths = [1495, 1495, 1495, 1495, 1495, 1495, 1496];
const chargeTable = table(chargeWidths, [
  new TableRow({
    children: [
      cell(chargeWidths[0], [label('Prepaid')], { shade: 'F2F2F2' }),
      cell(chargeWidths[1], [label('Collect')], { shade: 'F2F2F2' }),
      cell(chargeWidths[2], [label('Other Charges')], { shade: 'F2F2F2' }),
      cell(chargeWidths[3], [label('Weight Charge')], { shade: 'F2F2F2' }),
      cell(chargeWidths[4], [label('Valuation Charge')], { shade: 'F2F2F2' }),
      cell(chargeWidths[5], [label('Tax')], { shade: 'F2F2F2' }),
      cell(chargeWidths[6], [label('Total Prepaid')], { shade: 'F2F2F2' }),
    ],
  }),
  new TableRow({
    children: [
      cell(chargeWidths[0], [value('{{prepaid}}')]),
      cell(chargeWidths[1], [value('{{collect}}')]),
      cell(chargeWidths[2], [value('{{other_charges}}')]),
      cell(chargeWidths[3], [value('{{weight_charge}}')]),
      cell(chargeWidths[4], [value('{{valuation_charge}}')]),
      cell(chargeWidths[5], [value('{{tax}}')]),
      cell(chargeWidths[6], [value('{{total_prepaid}}')]),
    ],
  }),
]);

const destWidths = [2093, 2093, 2093, 2093, 2094];
const destTable = table(destWidths, [
  new TableRow({
    children: [
      cell(destWidths[0], [label('Charges at Destination')], { shade: 'F2F2F2' }),
      cell(destWidths[1], [label('Total Collect Charges')], { shade: 'F2F2F2' }),
      cell(destWidths[2], [label('Currency Conversion Rate')], { shade: 'F2F2F2' }),
      cell(destWidths[3], [label('CC Charges in Destination Currency')], { shade: 'F2F2F2' }),
      cell(destWidths[4], [label("For Carrier's Use Only at Destination")], { shade: 'F2F2F2' }),
    ],
  }),
  new TableRow({
    children: [
      cell(destWidths[0], [value('{{charges_at_destination}}')]),
      cell(destWidths[1], [value('{{total_collect_charges}}')]),
      cell(destWidths[2], [value('{{currency_conversion_rate}}')]),
      cell(destWidths[3], [value('{{cc_charges_destination}}')]),
      cell(destWidths[4], [value('')]),
    ],
  }),
]);

// ── 5. 서명 ─────────────────────────────────────────────────────────
const signWidths = [3600, 2266, 2300, 2300];
const signTable = table(signWidths, [
  new TableRow({
    children: [
      cell(signWidths[0], [
        note('Shipper certifies that the particulars on the face of this House Air Waybill are correct and that the cargo is ready for carriage subject to the forwarder’s standard conditions.'),
      ]),
      cell(signWidths[1], [
        label('Executed on'),
        value('{{date_of_issue}}'),
        new Paragraph({ spacing: { before: 60, after: 0 }, children: [new TextRun({ text: 'at', size: 14, font: 'Arial', color: '444444' })] }),
        value('{{place_of_issue}}'),
      ]),
      cell(signWidths[2], [label('Signature of Shipper or Agent'), value(''), value('')]),
      cell(signWidths[3], [
        label('Signature of Issuing Forwarder'),
        value(''),
        value('{{issuer_name}}'),
        value('{{signer_capacity}}'),
      ]),
    ],
  }),
]);

const spacer = () => new Paragraph({ spacing: { after: 60 }, children: [] });

const doc = new Document({
  styles: { default: { document: { run: { font: 'Arial', size: 18 } } } },
  sections: [{
    properties: {
      page: { size: { width: PAGE.width, height: PAGE.height }, margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } },
    },
    children: [
      partyTable, spacer(),
      routeTable, spacer(),
      valueTable, spacer(),
      cargoTable, spacer(),
      chargeTable, spacer(),
      destTable, spacer(),
      signTable,
      new Paragraph({
        spacing: { before: 100 },
        children: [new TextRun({ text: 'HOUSE AIR WAYBILL — NON-NEGOTIABLE | Forwarder-issued transport document | HAWB No. {{awb_no}}', size: 13, color: '444444', font: 'Arial' })],
      }),
    ],
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(process.argv[2], buffer);
  console.log('written', process.argv[2], buffer.length);
});
