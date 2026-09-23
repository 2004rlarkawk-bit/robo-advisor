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
import { createForwarderBillOfLadingDraft } from '../services/forwarderBillOfLadingService';
import type { SavedTrade } from '../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const FIXTURE_TRADE: SavedTrade = {
  id: 'trade-1',
  profile: { tradeType: 'export', itemName: 'Facial Toner', hsCode: '', loadPort: 'Busan Port', dischargePort: 'Tokyo Port', incoterms: 'FOB', quantity: '', weight: '', departureDate: '', arrivalDate: '', companyName: 'ABC KOREA', contact: '' },
  documents: [],
  issues: [],
  status: 'generated',
  createdAt: new Date().toISOString(),
};

const FIXTURE_BILL_OF_LADING = createForwarderBillOfLadingDraft(
  { ...createEmptyForwarderFormState(), blNo: 'HBLKR0001' },
  'trade-1',
  '2026-09-01T00:00:00.000Z',
);

function renderForm(
  overrides: Partial<ForwarderFormState> = {},
  viewOptions: Partial<React.ComponentProps<typeof ForwarderWorkspaceForm>> = {},
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
        userId="user-1"
        attachmentScopeId="draft-export-forwarder"
        attachments={[]}
        onAttachmentsChange={vi.fn()}
        currentStep={1}
        onStepChange={vi.fn()}
        view="workflow"
        onReturnToInbox={vi.fn()}
        onEnterWorkflow={vi.fn()}
        onNextFromRequest={vi.fn()}
        onSaveBooking={vi.fn()}
        booking={{}}
        onBookingChange={vi.fn()}
        progress={{}}
        onProgressChange={vi.fn()}
        onNextFromProgress={vi.fn()}
        masterBlNo=""
        onSaveMasterBl={vi.fn()}
        billOfLadingData={null}
        onGenerateHouseBillOfLading={vi.fn()}
        onNextFromBL={vi.fn()}
        trade={null}
        onShipperNotified={vi.fn()}
        onShippingAdviceSent={vi.fn()}
        onCompleteShipment={vi.fn()}
        {...viewOptions}
      />,
    );
  });
  return { container, onChange };
}

describe('수출 포워더 5단계 워크플로우', () => {
  it('수입과 같은 요약 카드 안에 거래 정보와 기존 5단계를 보여준다', () => {
    const rendered = renderForm({ companyName: 'ABC KOREA', partnerName: 'TOKYO TRADING', bookingNo: 'BK-001', vesselOrFlight: 'OCEAN STAR' });
    const summary = rendered.container.querySelector('[aria-label="수출 거래 요약"]');
    expect(summary?.textContent).toContain('ABC KOREA');
    expect(summary?.textContent).toContain('TOKYO TRADING');
    expect(summary?.textContent).toContain('BK-001');
    expect(summary?.querySelectorAll('.import-steps button')).toHaveLength(5);
    expect(rendered.container.querySelector('.fwd-export-refresh')).not.toBeNull();
  });
  it('Step 표시줄에 5단계 라벨을 모두 표시한다', () => {
    const rendered = renderForm();
    ['화주 의뢰 확인', '선복예약 정보 등록', '반입·선적 준비', 'B/L 관리', '선적 완료'].forEach((label) => {
      expect(rendered.container.textContent).toContain(label);
    });
  });

  describe('Inbox 화면 (view=inbox) — 수출 포워더 첫 진입', () => {
    it('받은 의뢰 목록만 표시하고, Stepper·입력 폼·직접 등록 영역은 보이지 않는다', () => {
      const rendered = renderForm({}, { view: 'inbox', onApplyExportRequest: vi.fn() });
      expect(rendered.container.textContent).not.toContain('수출 포워더 업무');
      expect(rendered.container.querySelector('.fwd-inbox-heading-actions')?.textContent).toContain('직접 등록');
      expect(rendered.container.querySelector('.fwd-inbox-filters')).not.toBeNull();
      expect(rendered.container.querySelector('thead')?.textContent).toContain('화주 / 품목');
      expect(rendered.container.textContent).toContain('받은 의뢰');
      expect(rendered.container.textContent).toContain('직접 등록');
      // 업무 단계(Stepper)·입력 폼은 의뢰를 불러오기 전까지 나타나지 않는다.
      expect(rendered.container.querySelector('.import-steps')).toBeNull();
      expect(rendered.container.textContent).not.toContain('화주 의뢰 확인');
      expect(rendered.container.textContent).not.toContain('화주 운송의뢰 정보');
      expect(rendered.container.textContent).not.toContain('화물명세');
      // 직접 등록을 열기 전에는 업로드 영역이 보이지 않는다.
      expect(rendered.container.textContent).not.toContain('직접 의뢰 등록');
      expect(rendered.container.textContent).not.toContain('여러 파일 선택');
    });

    it('[+ 직접 등록] 클릭 시 서류 업로드 영역이 열리고, 닫기를 누르면 다시 숨겨진다', () => {
      const rendered = renderForm({}, { view: 'inbox', onApplyExportRequest: vi.fn() });
      const openButton = Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '직접 등록') as HTMLButtonElement;
      expect(openButton).toBeTruthy();

      act(() => openButton.click());
      expect(rendered.container.textContent).toContain('직접 의뢰 등록');
      expect(rendered.container.textContent).toContain('이메일, 메신저 등 외부에서 받은');
      expect(rendered.container.textContent).toContain('여러 파일 선택');
      expect(rendered.container.textContent).toContain('AI 분석 및 빈 필드 자동입력');
      // 받은 의뢰함은 직접 등록 여부와 무관하게 그대로 유지된다.
      expect(rendered.container.textContent).toContain('받은 의뢰');

      const closeButton = Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '닫기') as HTMLButtonElement;
      act(() => closeButton.click());
      expect(rendered.container.textContent).not.toContain('직접 의뢰 등록');
      expect(rendered.container.textContent).not.toContain('여러 파일 선택');

      // 다시 열면 정상적으로 재표시된다.
      const reopenButton = Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '직접 등록') as HTMLButtonElement;
      act(() => reopenButton.click());
      expect(rendered.container.textContent).toContain('직접 의뢰 등록');
    });

    it('직접 등록 패널에서 [다음: 화주 의뢰 확인] 클릭 시 업무 화면 진입 콜백을 호출한다', () => {
      const onEnterWorkflow = vi.fn();
      const rendered = renderForm({}, { view: 'inbox', onApplyExportRequest: vi.fn(), onEnterWorkflow });
      const openButton = Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === '직접 등록') as HTMLButtonElement;
      act(() => openButton.click());
      const continueButton = Array.from(rendered.container.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('다음: 화주 의뢰 확인')) as HTMLButtonElement;
      act(() => continueButton.click());
      expect(onEnterWorkflow).toHaveBeenCalledOnce();
    });
  });

  describe('STEP 1 — 화주 의뢰 확인', () => {
    it('화주 운송의뢰 정보와 화물명세를 표시한다(입력 폼만 — 업로드/AI 분석 UI 없음)', () => {
      const rendered = renderForm({}, { currentStep: 1 });
      expect(rendered.container.textContent).toContain('1. 화주 의뢰 확인');
      expect(rendered.container.textContent).toContain('화주 운송의뢰 정보');
      expect(rendered.container.textContent).toContain('화물명세');
      // 받은 의뢰함·직접 등록은 Inbox 화면(view=inbox)의 몫이지, STEP 1에는 없다.
      expect(rendered.container.textContent).not.toContain('받은 의뢰');
      expect(rendered.container.textContent).not.toContain('직접 등록');
      expect(rendered.container.textContent).not.toContain('여러 파일 선택');
      expect(rendered.container.textContent).not.toContain('AI 분석 및 빈 필드 자동입력');
      // 초기화 버튼은 제거되었다 — "목록으로 돌아가기"가 같은 역할을 한다.
      expect(rendered.container.textContent).not.toContain('초기화');
      // Booking/컨테이너/B/L 발행정보는 이제 1단계에 없다 — 2·4단계로 이동했다.
      // (단계 이름 '선복예약 정보 등록'은 Step 표시줄·다음 버튼에 나오므로 2단계 고유 입력으로 확인한다.)
      expect(rendered.container.textContent).not.toContain('Booking No.');
      expect(rendered.container.textContent).not.toContain('Carrier / 선사');
      expect(rendered.container.textContent).not.toContain('컨테이너 정보');
      expect(rendered.container.textContent).not.toContain('선하증권 발행 정보');
    });

    it('다품목 화물명세를 품목별 카드로 모두 표시한다', () => {
      const rendered = renderForm({ cargoItems: [
        { id: 'a', itemNo: '', sku: '', descriptionOfGoods: 'Facial Toner', numberOfPackages: 10, kindOfPackages: 'CARTON', grossWeightKg: 100, measurementCbm: '0.5', marksAndNumbers: '', sourceDocumentIds: ['ci'] },
        { id: 'b', itemNo: '', sku: '', descriptionOfGoods: 'Moisturizing Cream', numberOfPackages: 20, kindOfPackages: 'CARTON', grossWeightKg: 200, measurementCbm: '1.0', marksAndNumbers: '', sourceDocumentIds: ['pl'] },
      ] }, { currentStep: 1 });
      expect(rendered.container.textContent).toContain('Facial Toner');
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
      const rendered = renderForm(state, { currentStep: 1 });

      expect(cargo.totals).toEqual({ numberOfPackages: 60, grossWeightKg: 600, measurementCbm: '3.00' });
      expect(rendered.container.querySelector<HTMLInputElement>('#cargo-packages-2')?.value).toBe('30');
      expect(rendered.container.querySelector<HTMLInputElement>('#cargo-weight-2')?.value).toBe('300');
    });

    it('다음: 선복예약 정보 등록 클릭 시 onNextFromRequest를 호출한다', () => {
      const onNextFromRequest = vi.fn();
      const rendered = renderForm({}, { currentStep: 1, onNextFromRequest });
      const button = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.includes('다음: 선복예약 정보 등록')) as HTMLButtonElement;
      act(() => button.click());
      expect(onNextFromRequest).toHaveBeenCalledOnce();
    });

    it('업무 화면 상단에서 [목록으로 돌아가기] 클릭 시 onReturnToInbox를 호출한다', () => {
      const onReturnToInbox = vi.fn();
      const rendered = renderForm({}, { currentStep: 1, onReturnToInbox });
      const button = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.includes('목록으로 돌아가기')) as HTMLButtonElement;
      act(() => button.click());
      expect(onReturnToInbox).toHaveBeenCalledOnce();
    });
  });

  describe('STEP 2 — 선적 Booking', () => {
    it('화물정보 Summary와 Booking·컨테이너 입력을 표시한다', () => {
      const rendered = renderForm({
        loadingMode: 'FCL',
        cargoItems: [{ id: 'a', itemNo: '', sku: '', descriptionOfGoods: 'Facial Toner', numberOfPackages: 10, kindOfPackages: 'CARTON', grossWeightKg: 100, measurementCbm: '0.5', marksAndNumbers: '', sourceDocumentIds: [] }],
      }, { currentStep: 2 });
      expect(rendered.container.textContent).toContain('선복예약 정보 등록');
      expect(rendered.container.textContent).toContain('화주 운송의뢰 확인');
      expect(rendered.container.textContent).toContain('Facial Toner');
      expect(rendered.container.textContent).toContain('Carrier / 선사');
      expect(rendered.container.textContent).toContain('Booking No.');
      expect(rendered.container.textContent).toContain('컨테이너 규격');
      expect(rendered.container.textContent).toContain('PortAI가 선사에 예약을 보내거나 부킹을 대행하지 않습니다');
      expect(rendered.container.textContent).toContain('Cargo Closing Date');
      expect(rendered.container.textContent).toContain('Freight Terms');
      expect(rendered.container.textContent).toContain('Booking Confirmation');
    });

    it('수출 화주와 같은 국내 POL·해외 POD 옵션을 재사용한다', () => {
      const rendered = renderForm({}, { currentStep: 2 });
      const polSelect = rendered.container.querySelector('[data-field="loadPort"] select');
      const podSelect = rendered.container.querySelector('[data-field="dischargePort"] select');
      expect(polSelect?.textContent).toContain('Busan Port (부산항)');
      expect(podSelect?.textContent).toContain('Tokyo Port (도쿄항)');
    });

    it('ETA가 ETD보다 빠르면 일정 오류를 표시한다', () => {
      const rendered = renderForm({ departureDate: '2026-08-10', arrivalDate: '2026-08-09' }, { currentStep: 2 });
      expect(rendered.container.textContent).toContain('ETA는 ETD보다 빠를 수 없습니다.');
    });

    it('핵심 정보가 없으면 부킹 완료 처리 버튼을 누를 수 없다', () => {
      const onSaveBooking = vi.fn();
      const rendered = renderForm({ bookingNo: 'BK-100' }, { currentStep: 2, onSaveBooking });
      const button = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.includes('부킹 확정 정보 등록')) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(rendered.container.textContent).toContain('부킹 대기');
      expect(rendered.container.textContent).toContain('선박명(Vessel), 항차번호(Voyage No.)가 필요합니다');
      act(() => button.click());
      expect(onSaveBooking).not.toHaveBeenCalled();
    });

    it('핵심 정보가 모두 있으면 부킹 완료로 표시하고 등록을 호출한다', () => {
      const onSaveBooking = vi.fn();
      const rendered = renderForm({ bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: '0012E' }, { currentStep: 2, onSaveBooking });
      expect(rendered.container.textContent).toContain('부킹 완료');
      const button = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.includes('부킹 정보 수정 저장')) as HTMLButtonElement;
      act(() => button.click());
      expect(onSaveBooking).toHaveBeenCalledOnce();
    });

    it('마감일·운임조건·비고를 고치면 onBookingChange로 넘긴다', () => {
      const onBookingChange = vi.fn();
      const rendered = renderForm({}, { currentStep: 2, onBookingChange, booking: { cargoClosingDate: '2026-10-01' } });
      const cargoClosing = rendered.container.querySelector<HTMLInputElement>('#booking-cargo-closing');
      expect(cargoClosing?.value).toBe('2026-10-01');
      const freight = rendered.container.querySelector<HTMLSelectElement>('#booking-freight-terms');
      act(() => {
        freight!.value = 'COLLECT';
        freight!.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(onBookingChange).toHaveBeenCalledWith({ freightTerms: 'COLLECT' });
    });
  });

  describe('STEP 3 — 선적 진행 관리', () => {
    it('진행 단계 5개와 수출통관 정보 등록을 표시한다', () => {
      const rendered = renderForm({}, { currentStep: 3 });
      ['Booking 완료', '화물 반입', '수출통관', '선적', '출항'].forEach((label) => {
        expect(rendered.container.textContent).toContain(label);
      });
      expect(rendered.container.textContent).toContain('수출신고번호');
      expect(rendered.container.textContent).toContain('수출신고필증');
      expect(rendered.container.textContent).toContain('PortAI는 수출신고서를 생성하지 않습니다');
    });

    it('진행 상태를 변경하면 onProgressChange를 호출한다', () => {
      const onProgressChange = vi.fn();
      const rendered = renderForm({}, { currentStep: 3, onProgressChange });
      const select = rendered.container.querySelector<HTMLSelectElement>('select[aria-label="화물 반입 상태"]');
      act(() => {
        if (!select) return;
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, 'done');
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(onProgressChange).toHaveBeenCalledWith('cargoReceived', 'done');
    });

    it('Booking 완료 상태는 2단계 부킹 확정 정보로 자동 판정되며 직접 변경할 수 없다', () => {
      const onProgressChange = vi.fn();
      const withoutBooking = renderForm({ bookingNo: '' }, { currentStep: 3, onProgressChange });
      const bookingSelect = withoutBooking.container.querySelector<HTMLSelectElement>('select[aria-label="Booking 완료 상태"]');
      expect(bookingSelect?.value).toBe('pending');
      expect(bookingSelect?.disabled).toBe(true);

      const withBooking = renderForm({ bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: '0012E' }, { currentStep: 3 });
      const bookingSelectDone = withBooking.container.querySelector<HTMLSelectElement>('select[aria-label="Booking 완료 상태"]');
      expect(bookingSelectDone?.value).toBe('done');
    });
  });

  describe('STEP 4 — B/L 관리', () => {
    it('Master B/L(등록)과 House B/L(생성)을 분리해 표시한다', () => {
      const rendered = renderForm({ carrier: 'ONE', vesselOrFlight: 'ONE HAMBURG', voyageNo: '001E', loadPort: 'Busan Port', dischargePort: 'Tokyo Port' }, { currentStep: 4, masterBlNo: 'MBLKR0001' });
      expect(rendered.container.textContent).toContain('Master B/L');
      expect(rendered.container.textContent).toContain('선사가 발행하는 문서');
      expect(rendered.container.querySelector<HTMLInputElement>('#mbl-no')?.value).toBe('MBLKR0001');
      const carrierInputs = Array.from(rendered.container.querySelectorAll<HTMLInputElement>('input[disabled]'));
      expect(carrierInputs.some((input) => input.value === 'ONE')).toBe(true);
      expect(rendered.container.textContent).toContain('House B/L');
      expect(rendered.container.textContent).toContain('생성 대기');
      expect(rendered.container.textContent).toContain('H/B/L 초안 생성');
    });

    it('H/B/L 생성 완료 시 완료 상태·B/L 번호·보기/다운로드/재생성 버튼을 표시한다', () => {
      const onViewBillOfLading = vi.fn();
      const onDownloadBillOfLading = vi.fn();
      const rendered = renderForm({}, {
        currentStep: 4,
        billOfLadingData: FIXTURE_BILL_OF_LADING,
        onViewBillOfLading,
        onDownloadBillOfLading,
      });
      expect(rendered.container.textContent).toContain('생성 완료');
      expect(rendered.container.textContent).toContain(FIXTURE_BILL_OF_LADING.blNo);
      const buttons = Array.from(rendered.container.querySelectorAll('button'));
      expect(buttons.some((button) => button.textContent?.trim() === '보기')).toBe(true);
      expect(buttons.some((button) => button.textContent?.trim() === '다운로드')).toBe(true);
      expect(buttons.some((button) => button.textContent?.includes('재생성'))).toBe(true);
      act(() => buttons.find((button) => button.textContent?.trim() === '보기')?.click());
      act(() => buttons.find((button) => button.textContent?.trim() === '다운로드')?.click());
      expect(onViewBillOfLading).toHaveBeenCalledOnce();
      expect(onDownloadBillOfLading).toHaveBeenCalledOnce();
    });

    it('생성 전(읽기전용 아님)에는 보기/다운로드 대신 H/B/L 초안 생성 버튼만 표시한다', () => {
      const rendered = renderForm({}, { currentStep: 4 });
      const buttons = Array.from(rendered.container.querySelectorAll('button'));
      expect(buttons.some((button) => button.textContent?.trim() === '보기')).toBe(false);
      expect(buttons.some((button) => button.textContent?.trim() === '다운로드')).toBe(false);
      expect(buttons.some((button) => button.textContent?.includes('H/B/L 초안 생성'))).toBe(true);
    });

    it('조회모드에서 생성 완료된 H/B/L은 보기/다운로드만 가능하고 재생성은 숨긴다', () => {
      const rendered = renderForm({}, {
        currentStep: 4,
        readOnly: true,
        billOfLadingData: FIXTURE_BILL_OF_LADING,
      });
      const buttons = Array.from(rendered.container.querySelectorAll('button'));
      expect(buttons.some((button) => button.textContent?.trim() === '보기')).toBe(true);
      expect(buttons.some((button) => button.textContent?.trim() === '다운로드')).toBe(true);
      expect(buttons.some((button) => button.textContent?.includes('재생성'))).toBe(false);
      expect(buttons.some((button) => button.textContent?.includes('H/B/L 초안 생성'))).toBe(false);
    });

    it('H/B/L 생성 실패 시 생성 실패 상태와 오류 메시지를 유지한다', () => {
      const rendered = renderForm({}, {
        currentStep: 4,
        generationError: 'H/B/L 생성에 실패했습니다. 다시 시도해주세요.',
      });
      expect(rendered.container.textContent).toContain('H/B/L 생성에 실패했습니다. 다시 시도해주세요.');
      expect(rendered.container.textContent).toContain('생성 실패');
    });
  });

  describe('STEP 5 — 선적 완료 및 문서 전달', () => {
    it('완료 체크리스트를 표시하고 미완료 시 완료 처리를 막는다', () => {
      const onCompleteShipment = vi.fn();
      const rendered = renderForm({}, { currentStep: 5, onCompleteShipment, trade: FIXTURE_TRADE });
      expect(rendered.container.textContent).toContain('선적 완료 확인');
      const button = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.trim() === '선적 완료 처리') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      act(() => button.click());
      expect(onCompleteShipment).not.toHaveBeenCalled();
    });

    it('모든 조건이 충족되면 선적 완료 처리 버튼이 활성화된다', () => {
      const rendered = renderForm({ bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: '0012E' }, {
        currentStep: 5,
        trade: FIXTURE_TRADE,
        billOfLadingData: FIXTURE_BILL_OF_LADING,
        masterBlNo: 'MBLKR0001',
        progress: { cargoReceived: 'done', customsCleared: 'done', loaded: 'done', departed: 'done' },
      });
      const button = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.trim() === '선적 완료 처리') as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('화주 알림과 해외 파트너 Shipping Advice 전달 패널을 표시한다', () => {
      const rendered = renderForm({}, { currentStep: 5, trade: FIXTURE_TRADE });
      expect(rendered.container.textContent).toContain('화주에게 선적완료 알림');
      expect(rendered.container.textContent).toContain('해외 파트너 포워더 Shipping Advice');
    });

    it('Booking 완료는 exportForwarderCase.progress가 아니라 2단계 Booking No. 저장 여부로 판정한다', () => {
      // progress.booking이 전혀 없어도(2단계에서 진행상태를 따로 건드린 적 없어도) bookingNo만 있으면 완료로 본다.
      const withBooking = renderForm({ bookingNo: 'BK-100', vesselOrFlight: 'HMM ALGECIRAS', voyageNo: '0012E' }, { currentStep: 5, progress: {} });
      const items = Array.from(withBooking.container.querySelectorAll('.forwarder-completion-checklist li'));
      const bookingItem = items.find((li) => li.textContent?.includes('Booking 완료'));
      expect(bookingItem?.className).toContain('is-done');
    });

    it('Booking 정보가 없으면 미완료로 표시한다', () => {
      const rendered = renderForm({ bookingNo: '' }, { currentStep: 5, progress: {} });
      const items = Array.from(rendered.container.querySelectorAll('.forwarder-completion-checklist li'));
      const bookingItem = items.find((li) => li.textContent?.includes('Booking 완료'));
      expect(bookingItem?.className).not.toContain('is-done');
    });
  });

  describe('조회모드(readOnly)', () => {
    it('입력·저장 액션 대신 닫기만 표시하고 필드 수정을 막는다', () => {
      const onClose = vi.fn();
      const rendered = renderForm({}, { currentStep: 1, readOnly: true, onClose });
      expect(rendered.container.textContent).not.toContain('초기화');
      expect(rendered.container.textContent).not.toContain('다음: 선복 부킹');
      expect(rendered.container.textContent).not.toContain('목록으로 돌아가기');
      expect(rendered.container.querySelector('fieldset')?.disabled).toBe(true);
      const closeButton = Array.from(rendered.container.querySelectorAll('button'))
        .find((candidate) => candidate.textContent?.trim() === '닫기') as HTMLButtonElement;
      act(() => closeButton.click());
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('조회모드에서도 Step 표시줄로 모든 단계를 이동할 수 있다', () => {
      const onStepChange = vi.fn();
      const rendered = renderForm({}, { currentStep: 1, readOnly: true, onStepChange, status: 'submitted' });
      const stepButtons = Array.from(rendered.container.querySelectorAll('.import-steps button'));
      expect(stepButtons.every((button) => !(button as HTMLButtonElement).disabled)).toBe(true);
      act(() => (stepButtons[4] as HTMLButtonElement).click());
      expect(onStepChange).toHaveBeenCalledWith(5);
    });

    it('거래가 아직 저장되지 않은 편집모드에서는 1단계 외 이동을 막는다', () => {
      const rendered = renderForm({}, { currentStep: 1, status: null });
      const stepButtons = Array.from(rendered.container.querySelectorAll('.import-steps button'));
      expect((stepButtons[0] as HTMLButtonElement).disabled).toBe(false);
      expect((stepButtons[1] as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
