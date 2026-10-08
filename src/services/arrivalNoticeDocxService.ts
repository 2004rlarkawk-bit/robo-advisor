/** 한영 병기 해상 도착통지서. 비용 청구서 및 화물 인도지시서와 구분한다. */
import {
  AlignmentType, BorderStyle, Document, Footer, Packer, PageNumber, Paragraph,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx';
import { renderAsync } from 'docx-preview';
import type { ForwarderImportCase } from '../types/forwarderCase';
import type { ImportParty } from '../types/importTrade';
import { portaiFileName } from '../utils/documentFileName';
import { saveBlobAs } from '../utils/saveBlob';

const text = (value: unknown): string => {
  const result = value == null ? '' : String(value).trim();
  return result === '-' ? '' : result;
};
const first = (...values: unknown[]) => values.map(text).find(Boolean) || '';
const missing = '미확인 / Not provided';
const line = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
const borders = { top: line, bottom: line, left: line, right: line };
const width = 10400;

function partyLines(name: string, details?: ImportParty): string[] {
  // 이름이 다른 당사자의 주소·연락처가 섞이지 않도록 한다.
  const matching = !name || !text(details?.name) || name.toLowerCase() === text(details?.name).toLowerCase();
  return [name || text(details?.name), ...(matching ? [text(details?.address), text(details?.country),
    [text(details?.phone), text(details?.email)].filter(Boolean).join(' / ')] : [])].filter(Boolean);
}

/** 구형 snapshot도 처리하며 B/L 종류, 운임 조건, 프리타임을 추정하지 않는다. */
export function mapArrivalNotice(caseItem: ForwarderImportCase) {
  const e = caseItem.snapshot.analysis.extracted;
  const gross = first(e.cargoTotals?.grossWeight, e.grossWeight);
  const packages = first(e.cargoTotals?.numberOfPackages, e.totalPackageCount);
  const withUnit = (value: string, unit: string) => value && /^[-\d.,\s]+$/.test(value) && unit ? value + ' ' + unit : value;
  return {
    blNo: first(caseItem.blNo, e.blNo),
    shipper: partyLines(first(e.shipper, e.exporterDetails?.name, caseItem.shipperName), e.exporterDetails),
    consignee: partyLines(first(e.consignee, e.consigneeDetails?.name, caseItem.importer), e.consigneeDetails),
    notify: partyLines(first(e.notifyParty, e.notifyPartyDetails?.name), e.notifyPartyDetails),
    vessel: [first(e.vesselName, caseItem.vesselName), text(e.voyageNo)].filter(Boolean).join(' / '),
    eta: first(e.estimatedArrivalDate, caseItem.eta),
    loading: text(e.loadPort), discharge: text(e.dischargePort),
    shipmentDate: text(e.shipmentDate), loadingMode: text(e.loadingMode),
    containers: (e.containerNumbers?.filter(v => text(v)) || []).length ? e.containerNumbers.join('\n') : text(e.containerNo),
    seals: (e.sealNumbers?.filter(v => text(v)) || []).length ? e.sealNumbers.join('\n') : text(e.sealNo),
    description: first(e.productDescription, e.items?.map(item => text(item.description)).filter(Boolean).join('\n')),
    packages: withUnit(packages, text(e.packageUnit)),
    gross: withUnit(gross, text(e.grossWeightUnit)),
    measurement: first(e.cargoTotals?.measurement, e.measurement),
    invoice: text(e.invoiceNo), marks: text(e.shippingMarks),
  };
}

function p(value: string, options: { bold?: boolean; size?: number; center?: boolean; after?: number } = {}) {
  return new Paragraph({
    alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: 0, after: options.after ?? 35, line: 250 },
    children: [new TextRun({ text: value, size: options.size ?? 18, bold: options.bold, color: '000000' })],
  });
}

function cell(label: string, values: string[], cellWidth: number): TableCell {
  const lines = values.flatMap(value => value.split('\n')).filter(Boolean);
  return new TableCell({
    width: { size: cellWidth, type: WidthType.DXA }, borders,
    margins: { top: 90, bottom: 90, left: 120, right: 120 }, verticalAlign: VerticalAlign.TOP,
    children: [p(label, { bold: true, size: 16, after: 70 }), ...((lines.length ? lines : [missing]).map(value => p(value)))],
  });
}

function table(rows: TableRow[], columns: number[]) {
  return new Table({ width: { size: width, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: columns,
    borders: { ...borders, insideHorizontal: line, insideVertical: line }, rows });
}
function pair(a: string, av: string[], b: string, bv: string[]) {
  return new TableRow({ cantSplit: true, children: [cell(a, av, width / 2), cell(b, bv, width / 2)] });
}
const gap = () => new Paragraph({ spacing: { before: 0, after: 90, line: 60 }, children: [] });

export async function buildArrivalNoticeDocx(caseItem: ForwarderImportCase, issuerName = '', contactName = ''): Promise<Blob> {
  const data = mapArrivalNotice(caseItem);
  const issuedDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const cargoWidths = [2400, 3200, 1500, 1700, 1600];
  const cargoHeaders = ['Container / Seal\n컨테이너 / 봉인번호', 'Description of Goods\n품명', 'Packages\n포장 수량', 'Gross Weight\n총중량', 'Measurement\n용적'];
  const cargoValues = [
    [data.containers || 'Container: 미확인', data.seals ? 'Seal: ' + data.seals : 'Seal: 미확인'].join('\n'),
    data.description, data.packages, data.gross, data.measurement,
  ];
  const doc = new Document({
    creator: issuerName || 'PortAI', title: 'ARRIVAL NOTICE 화물 도착통지서',
    styles: { default: { document: { run: { font: { ascii: 'Arial', hAnsi: 'Arial', eastAsia: 'Apple SD Gothic Neo', cs: 'Arial' }, size: 18, color: '000000' }, paragraph: { spacing: { after: 35 } } } } },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 920, right: 920 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: 'ARRIVAL NOTICE  |  ', size: 14 }), new TextRun({ children: [PageNumber.CURRENT], size: 14 })] })] }) },
      children: [
        p(issuerName || '발행 포워더 미입력', { bold: true, size: 24, after: 100 }),
        new Paragraph({ style: 'Title', alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: 'ARRIVAL NOTICE', bold: true, size: 32, color: '000000' })] }),
        p('화물 도착통지서', { center: true, size: 21, after: 100 }),
        p('Issue Date 발행일  ' + issuedDate + '     B/L No. 선하증권번호  ' + (data.blNo || missing), { size: 17 }),
        p('DRAFT 초안 · 기재 내용과 도착 일정을 확인한 후 전달해 주세요.', { size: 16, after: 100 }),
        table([
          pair('Consignee 수하인', data.consignee, 'Notify Party 통지처', data.notify),
          pair('Shipper 송하인', data.shipper, 'Forwarder 발행 포워더', [text(issuerName), contactName ? '담당자: ' + contactName : ''].filter(Boolean)),
        ], [5200, 5200]),
        gap(),
        p('Shipment Information 도착 및 운송 정보', { bold: true, size: 20, after: 80 }),
        table([
          pair('Vessel / Voyage 선박명 및 항차', [data.vessel], 'ETA 도착예정일', [data.eta]),
          pair('Port of Loading 선적항', [data.loading], 'Port of Discharge 양하항', [data.discharge]),
          pair('Shipment Date 선적일', [data.shipmentDate], 'Service Type 운송 형태', [data.loadingMode]),
          pair('Invoice No. 상업송장번호', [data.invoice], 'Marks and Numbers 화인', [data.marks]),
        ], [5200, 5200]),
        gap(),
        p('Cargo Details 화물 명세', { bold: true, size: 20, after: 80 }),
        table([
          new TableRow({ tableHeader: true, cantSplit: true, children: cargoHeaders.map((label, i) => new TableCell({
            width: { size: cargoWidths[i], type: WidthType.DXA }, borders, shading: { fill: 'F0F2F4' },
            margins: { top: 90, bottom: 90, left: 100, right: 100 },
            children: label.split('\n').map(value => p(value, { bold: true, size: 16, center: true })),
          })) }),
          new TableRow({ children: cargoValues.map((value, i) => new TableCell({
            width: { size: cargoWidths[i], type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.TOP,
            margins: { top: 120, bottom: 120, left: 120, right: 120 },
            children: (value || missing).split('\n').map(lineText => p(lineText, { center: i > 1 })),
          })) }),
        ], cargoWidths),
        p('수량·중량·용적은 제출 서류에 기재된 화물 전체 기준입니다.', { size: 15, after: 100 }),
        p('Remarks 안내사항', { bold: true, size: 20, after: 70 }),
        p('상기 화물의 도착 예정 정보를 안내드립니다. 일정은 변경될 수 있으므로 실제 입항 및 반출 가능 여부는 선사·터미널에 확인해 주세요.', { size: 17 }),
        p('본 문서는 비용 청구서 또는 화물인도지시서(D/O)가 아닙니다. 반출에 필요한 서류·비용·무료장치기간은 담당자에게 별도로 확인해 주세요.', { size: 17 }),
        p('미확인 항목은 원본 서류 및 담당자 확인 후 보완해 주세요.', { size: 17, after: 110 }),
        p([text(issuerName), text(contactName)].filter(Boolean).join(' · ') || '발행 포워더 미입력', { bold: true, size: 18 }),
      ],
    }],
  });
  return Packer.toBlob(doc);
}

export async function downloadArrivalNoticeDocx(caseItem: ForwarderImportCase, issuerName = '', contactName = ''): Promise<void> {
  const blob = await buildArrivalNoticeDocx(caseItem, issuerName, contactName);
  // 다른 서류와 같은 방식 — 링크를 문서에 붙여 눌러야 브라우저가 내려받기를 막지 않는다.
  saveBlobAs(blob, portaiFileName('arrival_notice', 'docx'));
}

/** 내려받는 DOCX와 같은 파일을 화면 안에서 확인한다. */
export async function renderArrivalNoticePreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}

/** 같은 A/N을 브라우저 인쇄 창에서 PDF로 저장한다. */
export async function printArrivalNoticeAsPdf(caseItem: ForwarderImportCase, issuerName = '', contactName = ''): Promise<void> {
  const blob = await buildArrivalNoticeDocx(caseItem, issuerName, contactName);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
  document.body.appendChild(iframe);
  const printDocument = iframe.contentWindow?.document;
  if (!printDocument) {
    iframe.remove();
    throw new Error('PDF 인쇄 창을 만들지 못했습니다.');
  }
  printDocument.open();
  printDocument.write(
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + portaiFileName('arrival_notice') + '</title>' +
    '<style>@page { size: A4; margin: 0; } html, body { margin: 0; padding: 0; background: #fff; }' +
    '* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }</style></head>' +
    '<body><div id="pdf-host"></div></body></html>',
  );
  printDocument.close();
  const host = printDocument.getElementById('pdf-host');
  if (!host) { iframe.remove(); throw new Error('PDF 미리보기 영역을 만들지 못했습니다.'); }
  try {
    await renderArrivalNoticePreview(blob, host);
    const printWindow = iframe.contentWindow!;
    let cleaned = false;
    const cleanup = () => { if (cleaned) return; cleaned = true; iframe.remove(); };
    printWindow.onafterprint = cleanup;
    printWindow.focus();
    printWindow.print();
    setTimeout(cleanup, 60000);
  } catch (error) {
    iframe.remove();
    throw error;
  }
}
