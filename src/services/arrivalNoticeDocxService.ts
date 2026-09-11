/**
 * 포워더 도착통지서(Arrival Notice) 발행 — 수입 건 데이터로 DOCX를 직접 조립한다.
 * 운송의뢰서(transportRequestDocxService)와 같은 방식: 고정 표준서식이 없는
 * 자체 양식이므로 docx 라이브러리로 문서를 구성한다.
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';
import type { ForwarderImportCase } from '../types/forwarderCase';

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '64748B' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function labeledCell(label: string, lines: string[], widthPct: number): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: CELL_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 14, color: '475569' })] }),
      ...(lines.filter(Boolean).length > 0 ? lines.filter(Boolean) : [' ']).map((line) =>
        new Paragraph({ children: [new TextRun({ text: line, size: 18 })] })),
    ],
  });
}

function chargeRow(name: string, amount = ''): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        borders: CELL_BORDERS,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: name, size: 18 })] })],
      }),
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        borders: CELL_BORDERS,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: amount || ' ', size: 18 })],
        })],
      }),
    ],
  });
}

/** 수입 건 데이터로 도착통지서 DOCX Blob을 만든다. */
export async function buildArrivalNoticeDocx(caseItem: ForwarderImportCase): Promise<Blob> {
  const extracted = caseItem.snapshot.analysis.extracted;
  const containers = extracted.containerNumbers.length > 0
    ? extracted.containerNumbers.join(', ')
    : extracted.containerNo;
  const seal = extracted.sealNumbers.length > 0 ? extracted.sealNumbers.join(', ') : extracted.sealNo;
  const packages = extracted.cargoTotals.numberOfPackages || extracted.totalPackageCount;
  const grossWeight = [extracted.cargoTotals.grossWeight || extracted.grossWeight, extracted.grossWeightUnit || 'KG']
    .filter(Boolean).join(' ');
  const measurement = extracted.cargoTotals.measurement || extracted.measurement;
  const issuedDate = new Date().toISOString().slice(0, 10);

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 850, right: 850 } } },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'ARRIVAL NOTICE', bold: true, size: 40 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          children: [new TextRun({ text: '도착통지서', size: 20, color: '64748B' })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                labeledCell('TO (CONSIGNEE / 수하인)', [s(caseItem.importer)], 55),
                labeledCell('A/N DATE', [issuedDate], 45),
              ],
            }),
            new TableRow({
              children: [
                labeledCell('SHIPPER (송하인)', [s(caseItem.shipperName)], 55),
                labeledCell('B/L NO.', [s(caseItem.blNo)], 45),
              ],
            }),
            new TableRow({
              children: [
                labeledCell('OCEAN VESSEL / VOYAGE', [[s(extracted.vesselName || caseItem.vesselName), s(extracted.voyageNo)].filter(Boolean).join(' / ')], 55),
                labeledCell('ESTIMATED TIME OF ARRIVAL (ETA)', [s(extracted.estimatedArrivalDate || caseItem.eta)], 45),
              ],
            }),
            new TableRow({
              children: [
                labeledCell('PORT OF LOADING', [s(extracted.loadPort)], 55),
                labeledCell('PORT OF DISCHARGE', [s(extracted.dischargePort)], 45),
              ],
            }),
            new TableRow({
              children: [
                labeledCell('CONTAINER / SEAL NO.', [[containers, seal].filter(Boolean).join(' / ')], 55),
                labeledCell('PACKAGES / G.W. / CBM', [[packages, grossWeight, measurement].filter(Boolean).join(' / ')], 45),
              ],
            }),
          ],
        }),
        new Paragraph({
          spacing: { before: 240, after: 80 },
          children: [new TextRun({ text: 'CHARGES (청구 내역)', bold: true, size: 20 })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            chargeRow('TERMINAL HANDLING CHARGE (THC)'),
            chargeRow('WHARFAGE'),
            chargeRow('DOCUMENT FEE (D/O)'),
            chargeRow('CONTAINER CLEANING CHARGE'),
            chargeRow('TOTAL'),
          ],
        }),
        new Paragraph({
          spacing: { before: 240 },
          children: [new TextRun({ text: 'REMARKS', bold: true, size: 20 })],
        }),
        ...[
          '1. 위 화물이 상기 일정으로 도착할 예정임을 통지드립니다.',
          '2. 원본 B/L(또는 Surrender 확인)과 함께 상기 비용 정산 후 D/O가 발급됩니다.',
          '3. 통관 완료 후 지정 보세구역에서 화물 인수가 가능합니다.',
        ].map((line) => new Paragraph({
          spacing: { after: 60 },
          children: [new TextRun({ text: line, size: 18 })],
        })),
      ],
    }],
  });

  return Packer.toBlob(doc);
}

/** 도착통지서를 생성해 즉시 내려받는다. */
export async function downloadArrivalNoticeDocx(caseItem: ForwarderImportCase): Promise<void> {
  const blob = await buildArrivalNoticeDocx(caseItem);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ARRIVAL_NOTICE_${caseItem.blNo !== '-' ? caseItem.blNo : caseItem.tradeId}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
