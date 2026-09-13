// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyForwarderFormState, type ForwarderFormState } from '../utils/forwarderForm';
import ForwarderWorkspaceForm from './ForwarderWorkspaceForm';
import { normalizeImportAnalysisResult } from '../services/importDocumentAnalysisService';
import {
  mapExtractedFieldsToForwarderForm,
  mergeForwarderAutoFill,
  mergeForwarderCargoDocuments,
} from '../services/forwarderDocumentAnalysisService';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderForm(
  overrides: Partial<ForwarderFormState> = {},
  viewOptions: {
    readOnly?: boolean;
    onClose?: () => void;
    currentStep?: number;
    billOfLadingHtml?: string;
    generationError?: string;
    onPreviousStep?: () => void;
    onViewBillOfLading?: () => void;
    onDownloadBillOfLading?: () => void;
  } = {},
) {
  const onChange = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <ForwarderWorkspaceForm
        state={{ ...createEmptyForwarderFormState(), ...overrides }}
        onChange={onChange}
        status={null}
        busy={false}
        onSave={vi.fn()}
        onSubmit={vi.fn()}
        onReset={vi.fn()}
        userId="user-1"
        attachmentScopeId="draft-export-forwarder"
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        {...viewOptions}
      />,
    );
  });
  return { container, onChange };
}

describe('포워더용 선적 및 부킹 입력 폼', () => {
  it('요청한 네 영역만 표시하고 별도 부킹 상태 입력은 두지 않는다', () => {
    const rendered = renderForm();
    expect(rendered.container.textContent).toContain('1. 화주 운송의뢰 정보');
    expect(rendered.container.textContent).toContain('2. 선복예약 및 스케줄');
    expect(rendered.container.textContent).toContain('3. 컨테이너 정보');
    expect(rendered.container.textContent).toContain('4. 화물명세');
    expect(rendered.container.textContent).not.toContain('부킹 상태');
    expect(rendered.container.textContent).not.toContain('수출신고필증번호');
    expect(rendered.container.textContent).toContain('수출신고번호 (선택)');
  });

  it('Booking No.로 등록 상태를 자동 표시하며 빈 값도 허용한다', () => {
    const unregistered = renderForm({ bookingNo: '', bookingStatus: 'confirmed' });
    expect(unregistered.container.textContent).toContain('부킹 미등록');
    expect(unregistered.container.querySelector('input[required]')).toBeNull();
    act(() => root?.unmount());
    root = null;
    unregistered.container.remove();
    container = null;
    const registered = renderForm({ bookingNo: 'BK-100' });
    expect(registered.container.textContent).toContain('부킹 등록 완료');
  });

  it('FCL에서만 컨테이너 입력 전체를 표시한다', () => {
    const fcl = renderForm({ loadingMode: 'FCL' });
    expect(fcl.container.textContent).toContain('컨테이너 규격');
    expect(fcl.container.textContent).toContain('컨테이너 번호');
    expect(fcl.container.textContent).toContain('Seal 번호');
    act(() => root?.unmount());
    root = null;
    fcl.container.remove();
    container = null;

    const lcl = renderForm({ loadingMode: 'LCL' });
    expect(lcl.container.textContent).not.toContain('컨테이너 규격');
    expect(lcl.container.textContent).not.toContain('컨테이너 수량');
    expect(lcl.container.textContent).not.toContain('컨테이너 번호');
    expect(lcl.container.textContent).not.toContain('Seal 번호');
  });

  it('ETA가 ETD보다 빠르면 일정 오류를 표시한다', () => {
    const rendered = renderForm({ departureDate: '2026-08-10', arrivalDate: '2026-08-09' });
    expect(rendered.container.textContent).toContain('ETA는 ETD보다 빠를 수 없습니다.');
  });

  it('AI 자동입력과 직접입력 필드의 경계를 안내한다', () => {
    const rendered = renderForm();
    expect(rendered.container.textContent).toContain('업로드 문서에서 자동입력');
    expect(rendered.container.textContent).toContain('부킹 확정 후 입력');
    expect(rendered.container.textContent).toContain('Marks & Numbers (선택)');
  });

  it('다품목 화물명세를 품목별 카드로 모두 표시한다', () => {
    const rendered = renderForm({ cargoItems: [
      { id: 'a', itemNo: '', sku: '', descriptionOfGoods: 'Facial Toner', numberOfPackages: 10, kindOfPackages: 'CARTON', grossWeightKg: 100, measurementCbm: '0.5', marksAndNumbers: '', sourceDocumentIds: ['ci'] },
      { id: 'b', itemNo: '', sku: '', descriptionOfGoods: 'Moisturizing Cream', numberOfPackages: 20, kindOfPackages: 'CARTON', grossWeightKg: 200, measurementCbm: '1.0', marksAndNumbers: '', sourceDocumentIds: ['pl'] },
    ] });
    expect(rendered.container.textContent).not.toContain('품목 1');
    expect(rendered.container.textContent).toContain('Facial Toner');
    expect(rendered.container.textContent).not.toContain('품목 2');
    expect(rendered.container.textContent).toContain('Moisturizing Cream');
    expect(rendered.container.querySelector<HTMLInputElement>('#cargo-packages-0')?.value).toBe('10');
    expect(rendered.container.querySelector<HTMLInputElement>('#cargo-packages-1')?.value).toBe('20');
  });

  it('Edge 응답 fixture의 C/I 3품목과 P/L 물류값을 병합해 카드 입력값까지 전달한다', () => {
    const ci = mapExtractedFieldsToForwarderForm(normalizeImportAnalysisResult({ extracted: { items: [
      { id: 'ci-1', description: 'Hydrating Hyaluronic Serum 50 mL' },
      { id: 'ci-2', description: 'Ceramide Barrier Cream 50 mL' },
      { id: 'ci-3', description: 'Low-pH Cleansing Foam 150 mL' },
    ] } }).extracted);
    const pl = mapExtractedFieldsToForwarderForm(normalizeImportAnalysisResult({ extracted: {
      totalPackageCount: '60 CARTONS', grossWeight: '600 KG', measurement: '3.00 CBM',
      items: [
        { id: 'pl-1', description: 'HYDRATING HYALURONIC SERUM 50ML', packageCount: '10 CARTONS', grossWeight: '100 KG', measurement: '0.50 CBM', shippingMarks: 'SERUM' },
        { id: 'pl-2', description: 'CERAMIDE BARRIER CREAM 50ML', packageCount: '20 CARTONS', grossWeight: '200 KG', measurement: '1.00 CBM', shippingMarks: 'CREAM' },
        { id: 'pl-3', description: 'LOW-PH CLEANSING FOAM 150ML', packageCount: '30 CARTONS', grossWeight: '300 KG', measurement: '1.50 CBM' },
      ],
    } }).extracted);
    const cargo = mergeForwarderCargoDocuments([
      { items: ci.cargoItems!, totals: ci.cargoTotals!, documentType: 'commercial_invoice' },
      { items: pl.cargoItems!, totals: pl.cargoTotals!, documentType: 'packing_list' },
    ]);
    const state = mergeForwarderAutoFill(createEmptyForwarderFormState(), {
      cargoItems: cargo.items,
      cargoTotals: cargo.totals,
    }).state;
    const rendered = renderForm(state);

    expect(cargo.items.map((item) => ({
      description: item.descriptionOfGoods,
      packages: item.numberOfPackages,
      type: item.kindOfPackages,
      weight: item.grossWeightKg,
      cbm: item.measurementCbm,
    }))).toEqual([
      { description: 'Hydrating Hyaluronic Serum 50 mL', packages: 10, type: 'CARTON', weight: 100, cbm: '0.50' },
      { description: 'Ceramide Barrier Cream 50 mL', packages: 20, type: 'CARTON', weight: 200, cbm: '1.00' },
      { description: 'Low-pH Cleansing Foam 150 mL', packages: 30, type: 'CARTON', weight: 300, cbm: '1.50' },
    ]);
    expect(cargo.totals).toEqual({ numberOfPackages: 60, grossWeightKg: 600, measurementCbm: '3.00' });
    expect(rendered.container.textContent).not.toMatch(/품목\s+[123]/);
    expect(rendered.container.querySelector<HTMLInputElement>('#cargo-packages-2')?.value).toBe('30');
    expect(rendered.container.querySelector<HTMLInputElement>('#cargo-package-type-2')?.value).toBe('CARTON');
    expect(rendered.container.querySelector<HTMLInputElement>('#cargo-weight-2')?.value).toBe('300');
    expect(rendered.container.querySelector<HTMLInputElement>('#cargo-measurement-2')?.value).toBe('1.50');
  });

  it('수출 화주와 같은 국내 POL·해외 POD 옵션과 기타항 직접입력을 사용한다', () => {
    const rendered = renderForm();
    const polGroup = rendered.container.querySelector('[data-field="loadPort"]');
    const podGroup = rendered.container.querySelector('[data-field="dischargePort"]');
    const polSelect = polGroup?.querySelector<HTMLSelectElement>('select');
    const podSelect = podGroup?.querySelector<HTMLSelectElement>('select');

    expect(polSelect?.textContent).toContain('Busan Port (부산항)');
    expect(polSelect?.textContent).toContain('기타 국내항');
    expect(polSelect?.textContent).not.toContain('Shanghai');
    expect(podSelect?.textContent).toContain('Tokyo Port (도쿄항)');
    expect(podSelect?.textContent).toContain('New York-New Jersey Port (뉴욕·뉴저지항)');
    expect(podSelect?.textContent).toContain('기타 해외항');
    expect(podSelect?.textContent).not.toContain('Busan Port');

    act(() => {
      if (!podSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(podSelect, 'Tokyo Port');
      podSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(rendered.onChange).toHaveBeenCalledWith(expect.objectContaining({ dischargePort: 'Tokyo Port' }));

    act(() => {
      if (!polSelect) return;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(polSelect, '__OTHER_DOMESTIC_PORT__');
      polSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const customPolInput = polGroup?.querySelector<HTMLInputElement>('input[aria-label="기타 국내항 직접 입력"]');
    expect(customPolInput).not.toBeNull();
    act(() => {
      if (!customPolInput) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(customPolInput, 'Masan Port');
      customPolInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rendered.onChange).toHaveBeenCalledWith(expect.objectContaining({ loadPort: 'Masan Port' }));
  });

  it('기존 목록 밖 항만값은 기타항 직접입력으로 보존한다', () => {
    const rendered = renderForm({ loadPort: 'Legacy Foreign POL', dischargePort: 'Legacy Domestic POD' });
    const customPol = rendered.container.querySelector<HTMLInputElement>('input[aria-label="기타 국내항 직접 입력"]');
    const customPod = rendered.container.querySelector<HTMLInputElement>('input[aria-label="기타 해외항 직접 입력"]');
    expect(customPol?.value).toBe('Legacy Foreign POL');
    expect(customPod?.value).toBe('Legacy Domestic POD');
  });

  it.each(['Tokyo', 'Tokyo Port', 'TOKYO PORT'])(
    '기존 POD %s를 Tokyo Port 옵션으로 복원한다',
    (legacyValue) => {
      const rendered = renderForm({ dischargePort: legacyValue });
      const podSelect = rendered.container.querySelector<HTMLSelectElement>('[data-field="dischargePort"] select');
      expect(podSelect?.value).toBe('Tokyo Port');
      expect(rendered.container.querySelector('input[aria-label="기타 해외항 직접 입력"]')).toBeNull();
    },
  );

  it('수출 포워더 첨부 영역과 허용 파일 input을 표시한다', () => {
    const rendered = renderForm();
    const input = rendered.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(rendered.container.textContent).toContain('여러 파일 선택');
    expect(rendered.container.textContent).toContain('AI 분석 및 빈 필드 자동입력');
    expect(rendered.container.textContent).toContain('첨부된 파일이 없습니다.');
    expect(input?.accept).toBe('.pdf,.png,.jpg,.jpeg');
    expect(input?.multiple).toBe(true);
  });

  it('문서관리 조회 모드에서는 수정·저장·전송 액션 대신 닫기만 표시한다', () => {
    const onClose = vi.fn();
    const rendered = renderForm({}, { readOnly: true, onClose });
    const closeButton = Array.from(rendered.container.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.trim() === '닫기') as HTMLButtonElement;

    expect(rendered.container.textContent).not.toContain('초기화');
    expect(rendered.container.textContent).not.toContain('선적·부킹 정보 저장');
    expect(rendered.container.textContent).not.toContain('전체 문서 전송');
    expect(rendered.container.querySelector('fieldset')?.disabled).toBe(true);
    act(() => closeButton.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('1단계에서는 최종 전송을 숨기고 정보 저장 및 B/L 생성만 제공한다', () => {
    const rendered = renderForm();
    expect(rendered.container.textContent).toContain('1. B/L 생성 정보 입력');
    expect(rendered.container.textContent).toContain('정보 저장 및 B/L 생성');
    expect(rendered.container.textContent).not.toContain('전체 문서 전송');
  });

  it('2단계에서는 B/L을 인라인 렌더링하지 않고 생성 완료 카드와 액션만 제공한다', () => {
    const onPreviousStep = vi.fn();
    const onViewBillOfLading = vi.fn();
    const onDownloadBillOfLading = vi.fn();
    const rendered = renderForm({}, {
      currentStep: 2,
      billOfLadingHtml: '<div>Generated B/L</div>',
      onPreviousStep,
      onViewBillOfLading,
      onDownloadBillOfLading,
    });
    expect(rendered.container.textContent).toContain('2. B/L 생성 및 확인');
    expect(rendered.container.textContent).toContain('선하증권 (B/L)');
    expect(rendered.container.textContent).toContain('생성 완료');
    expect(rendered.container.textContent).not.toContain('Generated B/L');
    expect(rendered.container.querySelector('[aria-label="B/L 미리보기 영역"]')).toBeNull();
    const buttons = Array.from(rendered.container.querySelectorAll('button'));
    act(() => buttons.find((button) => button.textContent?.includes('이전 단계'))?.click());
    act(() => buttons.find((button) => button.textContent?.trim() === '보기')?.click());
    act(() => buttons.find((button) => button.textContent?.trim() === '다운로드')?.click());
    expect(onPreviousStep).toHaveBeenCalledOnce();
    expect(onViewBillOfLading).toHaveBeenCalledOnce();
    expect(onDownloadBillOfLading).toHaveBeenCalledOnce();
    expect(rendered.container.textContent).toContain('전체 문서 전송');
  });

  it('2단계 B/L 생성 실패 시 입력 단계 대신 재생성 액션을 유지한다', () => {
    const rendered = renderForm({}, {
      currentStep: 2,
      generationError: 'B/L 생성에 실패했습니다. 다시 시도해주세요.',
    });
    expect(rendered.container.textContent).toContain('B/L 생성에 실패했습니다. 다시 시도해주세요.');
    expect(rendered.container.textContent).toContain('생성 실패');
    expect(rendered.container.textContent).toContain('재생성');
    const submit = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('전체 문서 전송')) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('문서관리의 포워더 2단계 조회에서도 제출 액션 대신 닫기만 표시한다', () => {
    const onClose = vi.fn();
    const rendered = renderForm({}, {
      currentStep: 2,
      billOfLadingHtml: '<div>Saved B/L</div>',
      readOnly: true,
      onClose,
    });
    expect(rendered.container.textContent).not.toContain('이전 단계');
    expect(rendered.container.textContent).not.toContain('전체 문서 전송');
    const close = Array.from(rendered.container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === '닫기') as HTMLButtonElement;
    act(() => close.click());
    expect(onClose).toHaveBeenCalledOnce();
  });
});
