/**
 * 포워더 도착통지서(Arrival Notice) 발행.
 *
 * 실제 선사·포워더가 쓰는 A/N 서식(B/L형 격자 양식)을 따른다:
 * 레터헤드 → 당사자/선적정보 격자 → 화물명세 표 → FREIGHT & CHARGES
 * (통화·기준·단가·금액 컬럼) → 계좌·프리타임 → 안내문·담당 서명란.
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';
import type { ForwarderImportCase } from '../types/forwarderCase';

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();

const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BOX = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BOX = { top: NONE, bottom: NONE, left: NONE, right: NONE };

/** 실무 서식의 셀 — 작은 대문자 라벨 + 본문 값. 값이 없으면 기입 공간만 남긴다. */
function box(label: string, lines: string[], widthPct: number, opts: { minLines?: number; center?: boolean } = {}): TableCell {
  const contentLines = lines.filter(Boolean);
  const padded = [...contentLines];
  while (padded.length < (opts.minLines ?? 1)) padded.push(' ');
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: BOX,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    children: [
      new Paragraph({ children: [new TextRun({ text: label, size: 12, color: '444444' })] }),
      ...padded.map((line) => new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: line, size: 18 })],
      })),
    ],
  });
}

function chargeCell(text: string, widthPct: number, opts: { bold?: boolean; center?: boolean; right?: boolean; header?: boolean } = {}): TableCell {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: BOX,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    shading: opts.header ? { fill: 'EFEFEF' } : undefined,
    children: [new Paragraph({
      alignment: opts.center ? AlignmentType.CENTER : opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT,
      children: [new TextRun({ text: text || ' ', size: opts.header ? 14 : 18, bold: opts.bold ?? opts.header ?? false })],
    })],
  });
}

function chargeRow(item: string, cur = '', per = '', opts: { total?: boolean } = {}): TableRow {
  return new TableRow({
    children: [
      chargeCell(item, 40, { bold: opts.total }),
      chargeCell(cur, 12, { center: true }),
      chargeCell(per, 12, { center: true }),
      chargeCell('', 16, { right: true }),
      chargeCell('', 20, { right: true, bold: opts.total }),
    ],
  });
}

/** 수입 건 데이터로 도착통지서 DOCX Blob을 만든다. issuerName은 발행 포워더 상호. */
export async function buildArrivalNoticeDocx(caseItem: ForwarderImportCase, issuerName = ''): Promise<Blob> {
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
  const vesselVoyage = [s(extracted.vesselName || caseItem.vesselName), s(extracted.voyageNo)].filter(Boolean).join(' / ');

  // 운임 조건은 인코텀즈로 추정 — C·D 조건은 수출자 부담(PREPAID), E·F 조건은 수입자 부담(COLLECT).
  const incoterms = s(extracted.incoterms).toUpperCase().slice(0, 3);
  const freightTerm = ['CIF', 'CFR', 'CIP', 'CPT', 'DAP', 'DPU', 'DDP'].includes(incoterms)
    ? 'FREIGHT PREPAID'
    : ['FOB', 'FCA', 'FAS', 'EXW'].includes(incoterms) ? 'FREIGHT COLLECT' : '';

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 620, bottom: 620, left: 760, right: 760 } } },
      children: [
        // ── 레터헤드: 좌측 발행사, 우측 문서명·발행정보 ──
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              new TableCell({
                width: { size: 58, type: WidthType.PERCENTAGE },
                borders: NO_BOX,
                children: [
                  new Paragraph({ children: [new TextRun({ text: issuerName || '(FORWARDER / 발행사)', bold: true, size: 26 })] }),
                  new Paragraph({ children: [new TextRun({ text: 'TEL :                FAX :                E-MAIL :', size: 14, color: '444444' })] }),
                ],
              }),
              new TableCell({
                width: { size: 42, type: WidthType.PERCENTAGE },
                borders: NO_BOX,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: 'ARRIVAL NOTICE', bold: true, size: 34 })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: '(도착통지서 겸 청구서)', size: 14, color: '444444' })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: `DATE : ${issuedDate}     OUR REF :`, size: 16 })],
                  }),
                ],
              }),
            ],
          })],
        }),
        new Paragraph({ spacing: { after: 60 }, children: [] }),

        // ── 당사자 / 선적 정보 격자 (B/L형) ──
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                box('SHIPPER (송하인)', [s(caseItem.shipperName)], 50, { minLines: 2 }),
                box('MBL NO.', [s(caseItem.blNo)], 25),
                box('HBL NO.', [], 25),
              ],
            }),
            new TableRow({
              children: [
                box('CONSIGNEE (수하인)', [s(caseItem.importer)], 50, { minLines: 2 }),
                box('OCEAN VESSEL / VOYAGE', [vesselVoyage], 25),
                box('E.T.A.', [s(extracted.estimatedArrivalDate || caseItem.eta)], 25),
              ],
            }),
            new TableRow({
              children: [
                box('NOTIFY PARTY (통지처)', [s(extracted.notifyParty) || 'SAME AS CONSIGNEE'], 50),
                box('PORT OF LOADING', [s(extracted.loadPort)], 25),
                box('PORT OF DISCHARGE', [s(extracted.dischargePort)], 25),
              ],
            }),
            new TableRow({
              children: [
                box('DISCHARGING TERMINAL / BONDED AREA (도착 터미널·장치장)', [], 50),
                box('FREIGHT', [freightTerm], 25),
                box('ON BOARD DATE', [s(extracted.shipmentDate)], 25),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 60 }, children: [] }),

        // ── 화물 명세 ──
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                chargeCell('CONTAINER & SEAL NO.', 28, { header: true, center: true }),
                chargeCell('NO. & KIND OF PKGS', 16, { header: true, center: true }),
                chargeCell('DESCRIPTION OF GOODS', 32, { header: true, center: true }),
                chargeCell('GROSS WEIGHT', 12, { header: true, center: true }),
                chargeCell('MEASUREMENT', 12, { header: true, center: true }),
              ],
            }),
            new TableRow({
              children: [
                box('', [[containers, seal].filter(Boolean).join(' / ')], 28, { minLines: 3 }),
                box('', [s(packages)], 16, { minLines: 3, center: true }),
                box('', [s(extracted.productDescription), `INVOICE NO. ${s(extracted.invoiceNo)}`.trim()], 32, { minLines: 3 }),
                box('', [grossWeight], 12, { minLines: 3, center: true }),
                box('', [s(measurement)], 12, { minLines: 3, center: true }),
              ],
            }),
          ],
        }),
        new Paragraph({ spacing: { after: 60 }, children: [] }),

        // ── FREIGHT & CHARGES ──
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                chargeCell('FREIGHT & CHARGES', 40, { header: true, center: true }),
                chargeCell('CUR.', 12, { header: true, center: true }),
                chargeCell('PER', 12, { header: true, center: true }),
                chargeCell('RATE', 16, { header: true, center: true }),
                chargeCell('AMOUNT', 20, { header: true, center: true }),
              ],
            }),
            chargeRow('OCEAN FREIGHT'),
            chargeRow('TERMINAL HANDLING CHARGE (THC)', 'KRW', 'CNTR'),
            chargeRow('WHARFAGE', 'KRW', 'CNTR'),
            chargeRow('DOCUMENT FEE (D/O)', 'KRW', 'B/L'),
            chargeRow('CONTAINER CLEANING CHARGE', 'KRW', 'CNTR'),
            chargeRow(''),
            chargeRow('TOTAL', '', '', { total: true }),
          ],
        }),
        new Paragraph({ spacing: { after: 60 }, children: [] }),

        // ── 계좌 / 프리타임 ──
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              box('BANK ACCOUNT (입금 계좌)', [], 60),
              box('FREE TIME (무료장치기간)', [], 40),
            ],
          })],
        }),

        // ── 안내문 + 서명 ──
        new Paragraph({
          spacing: { before: 160, after: 40 },
          children: [new TextRun({
            text: '상기 화물이 위 일정으로 도착할 예정임을 통지드립니다. 도착 전까지 상기 비용을 정산하시고, 원본 B/L(또는 SURRENDER 확인)을 제출하시면 D/O가 발급됩니다.',
            size: 16,
          })],
        }),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun({
            text: '무료장치기간 경과 시 보관료(Storage/Demurrage)가 발생할 수 있으니 유의하시기 바랍니다.',
            size: 16,
          })],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: issuerName || '(FORWARDER / 발행사)', bold: true, size: 20 })],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: '담당 :                        (인)', size: 18 })],
        }),
      ],
    }],
  });

  return Packer.toBlob(doc);
}

/** 도착통지서를 생성해 즉시 내려받는다. */
export async function downloadArrivalNoticeDocx(caseItem: ForwarderImportCase, issuerName = ''): Promise<void> {
  const blob = await buildArrivalNoticeDocx(caseItem, issuerName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ARRIVAL_NOTICE_${caseItem.blNo !== '-' ? caseItem.blNo : caseItem.tradeId}.docx`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
