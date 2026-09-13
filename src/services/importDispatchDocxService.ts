import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { renderAsync } from 'docx-preview';
import type { ImportDeliveryRequest, ImportDispatchRequest } from '../types/importTrade';
import type { ForwarderImportCase } from '../types/forwarderCase';
// 고정 템플릿(수입화물 운송의뢰서 참고양식) — XML/서식 무수정, {{placeholder}} 값만 주입.
import templateUrl from '../../templates/import_dispatch_request_template.docx?url';

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

let templateCache: ArrayBuffer | null = null;

async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const response = await fetch(templateUrl);
  if (!response.ok) throw new Error(`배차 의뢰서 템플릿 로드 실패 (${response.status})`);
  templateCache = await response.arrayBuffer();
  return templateCache;
}

export async function exportDispatchRequest(data: ImportDispatchSchema): Promise<Blob> {
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
