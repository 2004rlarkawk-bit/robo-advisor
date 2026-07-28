import ExcelJS from 'exceljs';
import type { PackingListData, InvoiceItem } from '../types';

/**
 * 패킹리스트 xlsx 생성의 순수 로직(브라우저 전용 `?url` 임포트 없음).
 * 앱(packingListXlsxService)과 node 스크립트가 함께 재사용한다 — 템플릿은 ArrayBuffer로 주입받는다.
 *
 * 패킹리스트는 상업송장(docx)과 달리 엑셀이라 ExcelJS로 셀 좌표에 직접 값을 쓴다.
 * (SheetJS는 서식을 버리므로 사용하지 않는다. ExcelJS는 style/수식을 라운드트립한다.)
 *
 * 절대 건드리지 않는 셀:
 *  - I열(22~45): Total EA = IF(OR(G="",H=""),"",G*H)  ← G/H만 채우면 자동 계산
 *  - 46행 합계: SUM(...22:...45)
 *  - G48/G50/G51 총계: K46 / H46 / I46 참조
 */

// 품목 표 = 22~45행(24행). 초과 시 행 추가하면 서식이 깨지므로 에러로 막는다.
export const PACKING_ITEM_START_ROW = 22;
export const MAX_PACKING_ITEMS = 24;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface PackingListItemRow {
  marks: string;
  description: string;
  eaPerBox: number | '';   // G — 비면 Total EA(I) 수식이 공란 유지
  boxes: number | '';      // H
  netWeight: number | '';  // J
  grossWeight: number | ''; // K
}

/** 템플릿 셀 좌표와 1:1. 문자열은 그대로, 수량/중량은 number(수식 계산용), 미입력은 ''(공란). */
export interface PackingListSchema {
  shipper: string[];        // B3, B4, B5 (최대 3줄)
  consignee: string[];      // B8, B9, B10
  notify: string;           // B14 (기본 "SAME AS ABOVE")
  portOfLoading: string;    // B17
  finalDestination: string; // E17
  carrier: string;          // B19
  sailingDate: string;      // E19
  invoiceNo: string;        // G3
  invoiceDate: string;      // J3
  lcNo: string;             // G5
  lcDate: string;           // J5
  lcBank: string;           // G7
  remarks: string;          // G10
  items: PackingListItemRow[];
  totalCbm: number | '';    // L22
  signedBy: string;         // I54
}

const DEST_INCOTERMS = new Set(['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);

const s = (v: unknown): string => (v === null || v === undefined ? '' : String(v)).trim();
const tel = (c?: string) => (c && c.trim() ? `TEL: ${c.trim()}` : '');

/** 문자열/숫자 → 수식 입력용 number. 비었거나 0이거나 숫자가 아니면 ''(공란 유지). */
function toNum(v: unknown): number | '' {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : '';
}

/** measurement 문자열("1.25 CBM" 등)에서 앞쪽 숫자만 뽑는다. 없으면 ''. */
function parseCbm(v: unknown): number | '' {
  if (v === '' || v === null || v === undefined) return '';
  const m = String(v).match(/-?\d+(\.\d+)?/);
  if (!m) return '';
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : '';
}

/**
 * PackingListData(= 상업송장과 같은 거래 데이터에서 파생) → 템플릿 스키마.
 * 당사자·항구·인보이스 번호는 재입력받지 않고 이미 채워진 필드에서 가져온다.
 * 패킹리스트 고유 값(박스당 수량·박스수·순/총중량·CBM)만 품목에서 읽는다.
 */
export function mapPackingListToSchema(pl: PackingListData): PackingListSchema {
  const d = pl as Record<string, any>;
  const seller = pl.seller || { name: '', address: '', contact: '' };
  const consignee = pl.consignee || { name: '', address: '', contact: '' };
  const items = (pl.items || []) as InvoiceItem[];

  const inc = s(d.incoterms).toUpperCase();
  const incPort = DEST_INCOTERMS.has(inc) ? s(d.dischargePort) : s(d.loadPort);
  const remarks = [
    s(d.paymentTerms) ? `PAYMENT: ${s(d.paymentTerms)}` : '',
    inc ? `INCOTERMS: ${[inc, incPort].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean).join('  /  ');

  const rows: PackingListItemRow[] = items.map((it, i) => {
    const r = it as Record<string, any>;
    return {
      // 화인(marks)은 거래 단위 한 덩어리 → 첫 행에만 표기(품목별 화인이 있으면 그것을 우선).
      marks: s(r.marks) || (i === 0 ? s(pl.shippingMarks) : ''),
      description: s(r.description),
      eaPerBox: toNum(r.eaPerBox),
      boxes: toNum(r.boxes ?? r.packageCount ?? (i === 0 ? pl.packageCount : '')),
      netWeight: toNum(r.netWeight),
      grossWeight: toNum(r.grossWeight),
    };
  });

  return {
    shipper: [s(seller.name), s(seller.address), tel(seller.contact)].filter(Boolean).slice(0, 3),
    consignee: [s(consignee.name), s(consignee.address), tel(consignee.contact)].filter(Boolean).slice(0, 3),
    notify: s(d.notifyPartyName) || 'SAME AS ABOVE',
    portOfLoading: s(d.loadPort),
    finalDestination: s(d.dischargePort),
    carrier: s(d.carrier) || s(d.vessel),
    sailingDate: s(d.departureDate) || s(pl.date),
    invoiceNo: s(pl.invoiceNo),
    invoiceDate: s(d.invoiceDate) || s(pl.date),
    lcNo: s(d.lcNo),
    lcDate: s(d.lcDate),
    lcBank: s(d.lcBank),
    remarks,
    items: rows,
    totalCbm: parseCbm(d.totalCbm ?? pl.measurement),
    signedBy: s(pl.signedBy),
  };
}

/** 값이 있을 때만 셀에 쓴다(빈 값이면 템플릿 원본 유지 = 공란). 병합 셀은 마스터(좌상단)에만 쓴다. */
function put(ws: ExcelJS.Worksheet, addr: string, value: string | number | '') {
  if (value === '' || value === null || value === undefined) return;
  ws.getCell(addr).value = value as string | number;
}

/** 수식 셀의 캐시된 결과값만 제거(수식·서식 유지) → 뷰어가 열 때 재계산하도록 유도. */
function clearFormulaCache(ws: ExcelJS.Worksheet, addrs: string[]) {
  for (const addr of addrs) {
    const cell = ws.getCell(addr);
    const v = cell.value as any;
    if (v && typeof v === 'object' && 'formula' in v) {
      cell.value = { formula: v.formula } as ExcelJS.CellFormulaValue;
    } else if (v && typeof v === 'object' && 'sharedFormula' in v) {
      cell.value = { sharedFormula: v.sharedFormula } as ExcelJS.CellSharedFormulaValue;
    }
  }
}

/**
 * 스키마 값을 고정 xlsx 템플릿(ArrayBuffer)의 셀 좌표에 주입해 xlsx Blob을 반환한다.
 * 서식·수식은 건드리지 않고 입력 셀만 채우므로 셀 비율·테두리·합계 수식이 원본과 동일하다.
 */
export async function exportPackingListWithTemplate(
  data: PackingListSchema,
  templateBuffer: ArrayBuffer,
): Promise<Blob> {
  if (data.items.length > MAX_PACKING_ITEMS) {
    throw new Error(`패킹리스트 품목이 ${data.items.length}건입니다. 템플릿은 최대 ${MAX_PACKING_ITEMS}건까지만 지원합니다(행 추가 시 서식이 깨짐). 품목을 나눠 여러 건으로 작성하세요.`);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);
  const ws = wb.worksheets[0];

  // 상단 당사자/거래 정보
  data.shipper.forEach((line, i) => put(ws, `B${3 + i}`, line));       // B3~B5
  data.consignee.forEach((line, i) => put(ws, `B${8 + i}`, line));     // B8~B10
  put(ws, 'B14', data.notify);
  put(ws, 'B17', data.portOfLoading);
  put(ws, 'E17', data.finalDestination);
  put(ws, 'B19', data.carrier);
  put(ws, 'E19', data.sailingDate);
  put(ws, 'G3', data.invoiceNo);
  put(ws, 'J3', data.invoiceDate);
  put(ws, 'G5', data.lcNo);
  put(ws, 'J5', data.lcDate);
  put(ws, 'G7', data.lcBank);
  put(ws, 'G10', data.remarks);

  // 품목 표 22~45행: B=marks, E=description, G=EA/box, H=boxes, J=net, K=gross.
  // I열(Total EA)·46행 합계는 수식이므로 절대 쓰지 않는다.
  data.items.forEach((item, i) => {
    const r = PACKING_ITEM_START_ROW + i;
    put(ws, `B${r}`, item.marks);
    put(ws, `E${r}`, item.description);
    put(ws, `G${r}`, item.eaPerBox);
    put(ws, `H${r}`, item.boxes);
    put(ws, `J${r}`, item.netWeight);
    put(ws, `K${r}`, item.grossWeight);
  });

  put(ws, 'L22', data.totalCbm); // 17) Total CBM
  put(ws, 'I54', data.signedBy); // Signed by

  // 합계 수식(Total EA·SUM·총계)의 오래된 캐시 결과를 비워, 어떤 뷰어에서도 처음부터 재계산되게 한다.
  clearFormulaCache(ws, [
    ...Array.from({ length: MAX_PACKING_ITEMS }, (_, i) => `I${PACKING_ITEM_START_ROW + i}`), // Total EA
    'G46', 'H46', 'I46', 'J46', 'K46', // 합계 행
    'G48', 'G50', 'G51',               // 총계(Gross/CTNS/Quantity)
  ]);
  wb.calcProperties.fullCalcOnLoad = true;

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], { type: XLSX_MIME });
}

/**
 * 다운로드 xlsx와 동일한 소스(스키마)로 미리보기 HTML을 만든다.
 * 엑셀 전용 렌더러 없이도 화면=다운로드가 같은 데이터를 쓰도록 스키마에서 직접 표를 조립한다.
 * 합계(Total EA·박스·중량)는 템플릿 수식과 같은 규칙으로 여기서도 계산해 표시한다.
 */
export function renderPackingListPreviewHtml(data: PackingListSchema): string {
  const esc = (v: unknown) =>
    String(v ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
  const numOr = (v: number | '') => (v === '' ? '' : Number(v).toLocaleString());

  let sumBox = 0, sumEA = 0, sumNet = 0, sumGross = 0;
  const rows = data.items.map((it) => {
    const totalEA = it.eaPerBox !== '' && it.boxes !== '' ? Number(it.eaPerBox) * Number(it.boxes) : '';
    if (it.boxes !== '') sumBox += Number(it.boxes);
    if (totalEA !== '') sumEA += Number(totalEA);
    if (it.netWeight !== '') sumNet += Number(it.netWeight);
    if (it.grossWeight !== '') sumGross += Number(it.grossWeight);
    return `<tr>
      <td>${esc(it.marks)}</td><td>${esc(it.description)}</td>
      <td style="text-align:right">${numOr(it.eaPerBox)}</td>
      <td style="text-align:right">${numOr(it.boxes)}</td>
      <td style="text-align:right">${totalEA === '' ? '' : Number(totalEA).toLocaleString()}</td>
      <td style="text-align:right">${numOr(it.netWeight)}</td>
      <td style="text-align:right">${numOr(it.grossWeight)}</td>
    </tr>`;
  }).join('');

  const field = (label: string, value: string) =>
    `<div><span style="color:#64748b;font-size:11px">${esc(label)}</span><br>${esc(value) || '&nbsp;'}</div>`;

  return `<div style="font-family:'Malgun Gothic',sans-serif;font-size:12px;color:#0f172a;background:#fff;padding:20px;max-width:820px;margin:0 auto;border:1px solid #e2e8f0">
    <h2 style="text-align:center;letter-spacing:4px;margin:0 0 16px">PACKING LIST</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      ${field('1) Shipper/Exporter', data.shipper.join(' / '))}
      ${field('8) No. & Date of Invoice', [data.invoiceNo, data.invoiceDate].filter(Boolean).join('  '))}
      ${field('2) Consignee', data.consignee.join(' / '))}
      ${field('9) / 10) L/C', [data.lcNo, data.lcDate, data.lcBank].filter(Boolean).join('  '))}
      ${field('3) Notify Party', data.notify)}
      ${field('11) Remarks', data.remarks)}
      ${field('4) Port of Loading', data.portOfLoading)}
      ${field('5) Final Destination', data.finalDestination)}
      ${field('6) Carrier', data.carrier)}
      ${field('7) Sailing on or about', data.sailingDate)}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px" border="1" cellpadding="4">
      <thead style="background:#f1f5f9">
        <tr>
          <th>12) Marks</th><th>13) Description of Goods</th>
          <th>EA/box</th><th>Box</th><th>Total EA</th><th>Net-weight(kg)</th><th>Gross-weight(kg)</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8">품목 없음</td></tr>'}</tbody>
      <tfoot style="background:#f8fafc;font-weight:700">
        <tr>
          <td colspan="3" style="text-align:right">TOTAL</td>
          <td style="text-align:right">${sumBox.toLocaleString()}</td>
          <td style="text-align:right">${sumEA.toLocaleString()}</td>
          <td style="text-align:right">${sumNet.toLocaleString()}</td>
          <td style="text-align:right">${sumGross.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:12px">
      <div>17) Total CBM: ${esc(numOr(data.totalCbm))}</div>
      <div>Signed by: ${esc(data.signedBy)}</div>
    </div>
  </div>`;
}
