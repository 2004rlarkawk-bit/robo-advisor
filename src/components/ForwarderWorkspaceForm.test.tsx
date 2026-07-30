// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyForwarderFormState, type ForwarderFormState } from '../utils/forwarderForm';
import ForwarderWorkspaceForm from './ForwarderWorkspaceForm';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

function renderForm(overrides: Partial<ForwarderFormState> = {}) {
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
      />,
    );
  });
  return { container, onChange };
}

describe('포워더용 선적 및 부킹 입력 폼', () => {
  it('요청 상태에서는 Booking No.가 없어도 오류를 표시하지 않는다', () => {
    const rendered = renderForm({ bookingStatus: 'requested', bookingNo: '' });
    expect(rendered.container.textContent).not.toContain('부킹 확정 시 Booking No.는 필수입니다.');
  });

  it('확정 상태에서는 Booking No.를 필수로 검증한다', () => {
    const rendered = renderForm({ bookingStatus: 'confirmed', bookingNo: '' });
    const bookingInput = Array.from(rendered.container.querySelectorAll<HTMLInputElement>('input'))
      .find((input) => input.required);

    expect(bookingInput?.getAttribute('aria-invalid')).toBe('true');
    expect(rendered.container.textContent).toContain('부킹 확정 시 Booking No.는 필수입니다.');
  });

  it('FCL에서만 컨테이너 규격과 수량을 표시한다', () => {
    const fcl = renderForm({ loadingMode: 'FCL' });
    expect(fcl.container.textContent).toContain('컨테이너 규격');
    act(() => root?.unmount());
    root = null;
    fcl.container.remove();
    container = null;

    const lcl = renderForm({ loadingMode: 'LCL' });
    expect(lcl.container.textContent).not.toContain('컨테이너 규격');
    expect(lcl.container.textContent).not.toContain('컨테이너 수량');
  });

  it('ETA가 ETD보다 빠르면 일정 오류를 표시한다', () => {
    const rendered = renderForm({ departureDate: '2026-08-10', arrivalDate: '2026-08-09' });
    expect(rendered.container.textContent).toContain('ETA는 ETD보다 빠를 수 없습니다.');
  });

  it('취소 상태에서는 취소 안내를 표시한다', () => {
    const rendered = renderForm({ bookingStatus: 'cancelled' });
    expect(rendered.container.textContent).toContain('취소된 부킹입니다. 입력값은 삭제되지 않습니다.');
  });

  it('수출 포워더 첨부 영역과 허용 파일 input을 표시한다', () => {
    const rendered = renderForm();
    const input = rendered.container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(rendered.container.textContent).toContain('여러 파일 선택');
    expect(rendered.container.textContent).toContain('AI 분석 및 빈 필드 자동입력');
    expect(rendered.container.textContent).toContain('첨부된 파일이 없습니다.');
    expect(input?.accept).toBe('.pdf,.png,.jpg,.jpeg');
    expect(input?.multiple).toBe(true);
  });
});
