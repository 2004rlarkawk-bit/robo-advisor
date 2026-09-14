/**
 * 포워더 → 운송사 배차 의뢰서(Container Dispatch Order) 발행.
 *
 * 실무 배차의뢰서(국내 운송사 수신 양식)를 따른다:
 * 레터헤드 → 수신/발신 → 선적·통관 정보 격자 → 컨테이너 명세 →
 * 상차/하차/반납 격자 → 운송 조건 → 요청사항 → 운송사 회신란(배차 확정 기재).
 */
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, VerticalAlign, WidthType,
} from 'docx';
import { renderAsync } from 'docx-preview';
import type { ImportDeliveryRequest, ImportDispatchRequest } from '../types/importTrade';
import type { ForwarderImportCase } from '../types/forwarderCase';

/** 배차 의뢰서 템플릿 스키마 — 참고양식의 칸과 1:1 대응. */
export interface ImportDispatchSchema {
  to: string;
  attention: string;
  from: string;
  contact: string;
  issue_date: string;
  request_no: string;
  mbl_no: string;
  hbl_no: string;
  vessel_voyage: string;
  eta: string;
  pod: string;
  terminal: string;
  do_no: string;
  import_declaration_no: string;
  clearance_status: string;
  container_no: string;
  seal_no: string;
  container_size: string;
  goods: string;
  packages: string;
  gross_weight: string;
  net_weight: string;
  measurement: string;
  pickup_place: string;
  pickup_at: string;
  delivery_address: string;
  delivery_at: string;
  consignee_contact_name: string;
  consignee_contact_tel: string;
  empty_return_place: string;
  empty_return_due: string;
  vehicle_type: string;
  freight_settlement: string;
  remarks: string;
  vehicle_no: string;
  driver_name: string;
  driver_tel: string;
  attachments: string;
  company: string;
  signer: string;
  signer_tel: string;
}

const text = (value: unknown): string => String(value ?? '').trim();

/** 'YYYY-MM-DDTHH:mm' → 'YYYY-MM-DD HH:mm' (빈 값은 그대로 빈 문자열) */
export function formatDateTime(value: string): string {
  const trimmed = text(value);
  if (!trimmed) return '';
  return trimmed.replace('T', ' ').slice(0, 16);
}

/** 진행 상태 4단계 중 해당하는 항목에만 표시를 남긴다. */
export function formatClearanceStatus(status: string): string {
  const steps = ['미통관', '통관완료', '반출승인', 'D/O 발급'];
  const current = text(status);
  return steps.map((step) => (step === current ? `[V] ${step}` : `[ ] ${step}`)).join('     ');
}

export function mapDispatchToSchema(
  caseItem: ForwarderImportCase,
  dispatch: ImportDispatchRequest,
  delivery: ImportDeliveryRequest | undefined,
  forwarderName: string,
  forwarderContact = '',
): ImportDispatchSchema {
  const extracted = caseItem.snapshot.analysis.extracted;
  const firstItem = extracted.items[0];

  return {
    to: text(dispatch.carrierCompany),
    attention: text(dispatch.attention),
    from: text(forwarderName),
    contact: text(forwarderContact),
    issue_date: text(dispatch.issuedAt).slice(0, 10),
    request_no: `DR-${caseItem.tradeId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    mbl_no: text(extracted.blNo || caseItem.blNo),
    hbl_no: '',
    vessel_voyage: text(extracted.vesselName || caseItem.vesselName),
    eta: text(extracted.estimatedArrivalDate || caseItem.eta),
    pod: text(extracted.dischargePort),
    terminal: text(dispatch.terminal),
    do_no: text(dispatch.doNo),
    import_declaration_no: '',
    clearance_status: formatClearanceStatus(dispatch.doNo ? 'D/O 발급' : '미통관'),
    container_no: text(extracted.containerNo),
    seal_no: text(extracted.sealNo),
    container_size: '',
    goods: text(firstItem?.description || extracted.productDescription),
    packages: text(extracted.quantity),
    gross_weight: text(extracted.grossWeight),
    net_weight: text(extracted.netWeight),
    measurement: text(extracted.measurement),
    pickup_place: text(dispatch.pickupPlace),
    pickup_at: formatDateTime(dispatch.pickupAt),
    // 배송 관련 칸은 화주가 입력한 배송 요청에서 그대로 옮긴다.
    delivery_address: text(delivery?.deliveryAddress),
    delivery_at: formatDateTime(delivery?.deliveryAt ?? ''),
    consignee_contact_name: text(delivery?.contactName),
    consignee_contact_tel: text(delivery?.contactTel),
    empty_return_place: text(dispatch.emptyReturnPlace),
    empty_return_due: text(dispatch.emptyReturnDue),
    vehicle_type: text(dispatch.vehicleType),
    freight_settlement: text(dispatch.settlement),
    // 포워더 특이사항과 화주 요청사항을 함께 싣는다.
    remarks: [text(dispatch.remarks), text(delivery?.remarks) && `[화주 요청] ${text(delivery?.remarks)}`]
      .filter(Boolean).join('\n'),
    vehicle_no: text(dispatch.vehicleNo),
    driver_name: text(dispatch.driverName),
    driver_tel: text(dispatch.driverTel),
    attachments: [
      dispatch.doNo ? 'D/O' : '',
      caseItem.arrivalNotice ? 'A/N' : '',
      'B/L',
      '패킹리스트',
    ].filter(Boolean).join(', '),
    company: text(forwarderName),
    signer: text(dispatch.attention) ? '' : '',
    signer_tel: text(forwarderContact),
  };
}

const LINE = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const BOX = { top: LINE, bottom: LINE, left: LINE, right: LINE };
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BOX = { top: NONE, bottom: NONE, left: NONE, right: NONE };

/** 실무 서식의 셀 — 작은 라벨 + 본문 값. 값이 없으면 기입 공간만 남긴다. */
function box(label: string, lines: string[], widthPct: number, opts: { minLines?: number; center?: boolean; shade?: boolean } = {}): TableCell {
  const contentLines = lines.filter(Boolean);
  const padded = [...contentLines];
  while (padded.length < (opts.minLines ?? 1)) padded.push(' ');
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    borders: BOX,
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    shading: opts.shade ? { fill: 'F3F3F3' } : undefined,
    children: [
      new Paragraph({ children: [new TextRun({ text: label, size: 12, color: '444444' })] }),
      ...padded.map((line) => new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: line, size: 18 })],
      })),
    ],
  });
}

/** 구획 제목 줄 — 회색 배경 한 칸짜리 행 */
function sectionRow(title: string): TableRow {
  return new TableRow({
    children: [new TableCell({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: BOX,
      shading: { fill: 'E8E8E8' },
      margins: { top: 30, bottom: 30, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 15 })] })],
    })],
  });
}

function grid(rows: TableRow[]): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

export async function exportDispatchRequest(data: ImportDispatchSchema): Promise<Blob> {
  const issuedDate = data.issue_date || new Date().toISOString().slice(0, 10);
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 620, bottom: 620, left: 760, right: 760 } } },
      children: [
        // ── 레터헤드: 좌측 발행 포워더, 우측 문서명·발행정보 ──
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({
            children: [
              new TableCell({
                width: { size: 55, type: WidthType.PERCENTAGE },
                borders: NO_BOX,
                children: [
                  new Paragraph({ children: [new TextRun({ text: data.from || '(발행 포워더)', bold: true, size: 26 })] }),
                  new Paragraph({ children: [new TextRun({ text: `TEL : ${data.contact || '            '}     FAX :            E-MAIL :`, size: 14, color: '444444' })] }),
                ],
              }),
              new TableCell({
                width: { size: 45, type: WidthType.PERCENTAGE },
                borders: NO_BOX,
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: '배 차 의 뢰 서', bold: true, size: 34 })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: '(CONTAINER DISPATCH ORDER)', size: 14, color: '444444' })],
                  }),
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [new TextRun({ text: `DATE : ${issuedDate}     REF NO : ${data.request_no}`, size: 16 })],
                  }),
                ],
              }),
            ],
          })],
        }),
        new Paragraph({ children: [new TextRun({ text: ' ', size: 8 })] }),

        // ── 수신/발신 ──
        grid([
          new TableRow({
            children: [
              box('수신 (TO)', [data.to], 30, { minLines: 1 }),
              box('담당 (ATTN)', [data.attention], 20),
              box('발신 (FROM)', [data.from], 30),
              box('연락처 (TEL)', [data.contact], 20),
            ],
          }),
        ]),

        // ── 선적·통관 정보 ──
        grid([
          sectionRow('1. 선적·통관 정보 (SHIPMENT & CLEARANCE)'),
          new TableRow({
            children: [
              box('B/L NO.', [data.mbl_no], 30),
              box('VESSEL / VOY.', [data.vessel_voyage], 30),
              box('ETA', [data.eta], 18),
              box('양하항 (POD)', [data.pod], 22),
            ],
          }),
          new TableRow({
            children: [
              box('반출 터미널 (TERMINAL)', [data.terminal], 30),
              box('D/O NO.', [data.do_no], 30),
              box('진행 상태', [data.clearance_status], 40),
            ],
          }),
        ]),

        // ── 컨테이너·화물 명세 ──
        grid([
          sectionRow('2. 컨테이너·화물 명세 (CONTAINER & CARGO)'),
          new TableRow({
            children: [
              box('CNTR NO.', [data.container_no], 30),
              box('SEAL NO.', [data.seal_no], 22),
              box("규격 (20'/40')", [data.container_size], 16, { center: true }),
              box('수량 (PKGS)', [data.packages], 16, { center: true }),
              box('총중량 (G.W)', [data.gross_weight], 16, { center: true }),
            ],
          }),
          new TableRow({
            children: [
              box('품명 (DESCRIPTION)', [data.goods], 52),
              box('용적 (CBM)', [data.measurement], 16, { center: true }),
              box('첨부서류', [data.attachments], 32),
            ],
          }),
        ]),

        // ── 상차·하차·반납 ──
        grid([
          sectionRow('3. 운송 구간 (PICK-UP / DELIVERY / RETURN)'),
          new TableRow({
            children: [
              box('상차지 (PICK-UP)', [data.pickup_place], 60, { minLines: 1 }),
              box('상차 일시', [data.pickup_at], 40),
            ],
          }),
          new TableRow({
            children: [
              box('하차지 (DELIVERY)', [data.delivery_address], 60, { minLines: 1 }),
              box('하차 요청 일시', [data.delivery_at], 40),
            ],
          }),
          new TableRow({
            children: [
              box('인수 담당자', [data.consignee_contact_name], 30),
              box('연락처', [data.consignee_contact_tel], 30),
              box('하역 조건 (지게차·문전하차 등)', [], 40),
            ],
          }),
          new TableRow({
            children: [
              box('공컨테이너 반납지 (RETURN)', [data.empty_return_place], 60),
              box('반납 기한 (FREE TIME 내)', [data.empty_return_due], 40),
            ],
          }),
        ]),

        // ── 운송 조건·요청사항 ──
        grid([
          sectionRow('4. 운송 조건 (TERMS)'),
          new TableRow({
            children: [
              box('차량 종류', [data.vehicle_type], 30, { center: true }),
              box('운임 정산', [data.freight_settlement], 30, { center: true }),
              box('수입신고번호', [data.import_declaration_no], 40),
            ],
          }),
          new TableRow({
            children: [box('요청사항 (REMARKS)', data.remarks.split('\n'), 100, { minLines: 2 })],
          }),
        ]),

        // ── 운송사 회신란 ──
        grid([
          sectionRow('5. 운송사 회신란 — 배차 확정 후 기재 (CARRIER USE ONLY)'),
          new TableRow({
            children: [
              box('차량번호', [data.vehicle_no], 34, { shade: !data.vehicle_no }),
              box('기사명', [data.driver_name], 30, { shade: !data.driver_name }),
              box('기사 연락처', [data.driver_tel], 36, { shade: !data.driver_tel }),
            ],
          }),
        ]),

        // ── 하단 안내문·서명 ──
        new Paragraph({ children: [new TextRun({ text: ' ', size: 10 })] }),
        new Paragraph({
          children: [new TextRun({
            text: '위와 같이 컨테이너 운송을 의뢰하오니 배차 확정 후 상기 회신란 기재 사항을 회신하여 주시기 바랍니다.',
            size: 16,
          })],
        }),
        new Paragraph({
          children: [new TextRun({
            text: '반납 기한 경과 시 발생하는 지체료(Detention/Demurrage)는 사전 협의 없는 경우 청구될 수 있습니다.',
            size: 14, color: '444444',
          })],
        }),
        new Paragraph({ children: [new TextRun({ text: ' ', size: 10 })] }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `${data.company || ''}   담당자 :                (인)`, size: 18, bold: true })],
        }),
      ],
    }],
  });
  return Packer.toBlob(doc);
}

export async function buildDispatchRequestDocx(
  caseItem: ForwarderImportCase,
  dispatch: ImportDispatchRequest,
  delivery: ImportDeliveryRequest | undefined,
  forwarderName: string,
  forwarderContact = '',
): Promise<Blob> {
  return exportDispatchRequest(
    mapDispatchToSchema(caseItem, dispatch, delivery, forwarderName, forwarderContact),
  );
}

/** 배차 의뢰서를 생성해 내려받는다. */
export async function downloadDispatchRequestDocx(
  caseItem: ForwarderImportCase,
  dispatch: ImportDispatchRequest,
  delivery: ImportDeliveryRequest | undefined,
  forwarderName: string,
  forwarderContact = '',
): Promise<void> {
  const blob = await buildDispatchRequestDocx(caseItem, dispatch, delivery, forwarderName, forwarderContact);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `DispatchRequest_${caseItem.blNo || caseItem.tradeId.slice(0, 8)}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderDispatchRequestPreview(blob: Blob, container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  await renderAsync(blob, container, undefined, {
    className: 'docx-preview', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
  });
}
