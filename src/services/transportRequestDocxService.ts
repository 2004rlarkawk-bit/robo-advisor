import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, HeadingLevel, VerticalAlign, ShadingType,
} from 'docx';
import { renderAsync } from 'docx-preview';
import type { TransportRequestData, PartyInfo } from '../types';

// 운송의뢰서는 무역협회 표준서식 같은 고정 템플릿이 없는 자체 양식이라(renderTransportRequestHTML과 동일 내용),
// docxtemplater(템플릿 주입) 대신 docx 라이브러리로 문서를 직접 조립한다.

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const numFmt = (n: unknown) => (Number(n) > 0 ? Number(n).toLocaleString('en-US') : '');
const cellText = (v: unknown) => s(v) || ' ';

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '64748B' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function labeledCell(label: string, lines: string[], widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: label, bold: true, size: 14, color: '475569' })],
      }),
      ...lines.filter(Boolean).map((line) => new Paragraph({
        children: [new TextRun({ text: line, size: 18 })],
      })),
    ],
  });
}

function partyLines(p: PartyInfo | undefined, extra: string[] = []): string[] {
  if (!p) return [];
  return [s(p.name), s(p.address), s(p.contact), ...extra].filter(Boolean);
}

function headerCell(text: string): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    shading: { type: ShadingType.CLEAR, fill: 'EAF1F8' },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, bold: true, size: 15 })],
    })],
  });
}

function bodyCell(text: string, alignLeft = false): TableCell {
  return new TableCell({
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 60, right: 60 },
    children: [new Paragraph({
      alignment: alignLeft ? AlignmentType.LEFT : AlignmentType.CENTER,
      children: [new TextRun({ text: cellText(text), size: 15 })],
    })],
  });
}

/** TransportRequestData → docx Blob. HTML 미리보기(renderTransportRequestHTML)와 동일한 내용을 담는다. */
export async function buildTransportRequestDocx(data: TransportRequestData): Promise<Blob> {
  const notify = data.notifyParty;
  const loadingMode = data.loadingMode || 'TBD';

  const itemHeader = new TableRow({
    tableHeader: true,
    children: ['No.', 'Goods Description', 'HS Code', 'Qty', 'Unit', 'Pkg Qty', 'Package Type', 'N/W (kg)', 'G/W (kg)', 'CBM']
      .map(headerCell),
  });
  const itemRows = data.items.length
    ? data.items.map((item, index) => new TableRow({
      children: [
        bodyCell(String(index + 1)),
        bodyCell(item.description, true),
        bodyCell(item.hsCode),
        bodyCell(numFmt(item.quantity)),
        bodyCell(item.unit),
        bodyCell(numFmt(item.packageCount)),
        bodyCell(item.packageType),
        bodyCell(numFmt(item.netWeight)),
        bodyCell(numFmt(item.grossWeight)),
        bodyCell(item.measurement),
      ],
    }))
    : [new TableRow({
      children: [new TableCell({
        columnSpan: 10,
        borders: CELL_BORDERS,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No cargo item entered', size: 15 })] })],
      })],
    })];

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new TextRun({ text: 'EXPORT TRANSPORT REQUEST', bold: true, size: 32 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: '수출 운송의뢰서', bold: true, size: 20, color: '475569' })],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 160 },
          children: [
            new TextRun({ text: 'Request No. ', bold: true, size: 16 }),
            new TextRun({ text: `${cellText(data.requestNo)}    `, size: 16 }),
            new TextRun({ text: 'Date ', bold: true, size: 16 }),
            new TextRun({ text: cellText(data.requestDate), size: 16 }),
          ],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                labeledCell('EXPORTER / REQUESTER', [
                  s(data.exporter.name),
                  s(data.exporter.address),
                  `Contact: ${s(data.requesterName || data.exporter.contact)}`,
                  `Tel/E-mail: ${s(data.exporter.contact)}`,
                  `Business No.: ${s(data.businessRegistrationNo)}`,
                ], 50),
                labeledCell('CONSIGNEE', partyLines(data.consignee), 50),
              ],
            }),
            ...(notify ? [new TableRow({
              children: [new TableCell({
                columnSpan: 2,
                borders: CELL_BORDERS,
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: 'NOTIFY PARTY', bold: true, size: 14, color: '475569' })] }),
                  ...partyLines(notify).map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 18 })] })),
                ],
              })],
            })] : []),
          ],
        }),
        new Paragraph({ text: '', spacing: { after: 160 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [itemHeader, ...itemRows],
        }),
        new Paragraph({ text: '', spacing: { after: 160 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              labeledCell('TRADE TERMS', [
                `Incoterms: ${s(data.incoterms)}`,
                `Named Place: ${s(data.incotermsPlace)}`,
                `Payment Terms: ${s(data.paymentTerms)}`,
                `Invoice No.: ${s(data.invoiceNo)}`,
              ], 50),
              labeledCell('TRANSPORT REQUEST', [
                `POL: ${s(data.loadPort)}`,
                `POD: ${s(data.dischargePort)}`,
                `Requested Departure: ${s(data.requestedDepartureDate)}`,
                `Loading Mode: ${s(loadingMode)}`,
              ], 50),
            ],
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 320 },
          children: [new TextRun({ text: 'We request ocean transportation and shipment arrangements for the cargo described above.', size: 16 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: '상기 화물에 대한 해상운송 및 선적 업무를 의뢰합니다.', size: 16, color: '64748B' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: 'Business transport request draft — booking and B/L particulars are to be confirmed by the forwarder.',
            size: 13, italics: true, color: '94A3B8',
          })],
        }),
      ],
    }],
  });

  const buf = await Packer.toBlob(doc);
  return buf;
}

/** 생성된 docx Blob을 브라우저에 렌더(미리보기) — 미리보기=다운로드 동일 바이너리. */
export async function renderTransportRequestDocxPreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}
