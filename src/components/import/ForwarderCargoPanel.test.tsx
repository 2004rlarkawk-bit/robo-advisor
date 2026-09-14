// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import Panel from './ForwarderCargoPanel';
import { lookupImportCargo } from '../../services/cargoProgressService';
vi.mock('../../services/cargoProgressService', () => ({ lookupImportCargo: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); vi.resetAllMocks(); });
it('starts unqueried, identifies simulated results and records their B/L and query time', async () => {
  vi.mocked(lookupImportCargo).mockResolvedValue({ lookupStatus: 'simulation', source: 'simulation', status: '수입신고', detail: '심사 대기', timeline: [], arrivalPort: '인천항', cargoNo: 'SAMPLE' });
  await act(async () => root.render(<Panel initialBlNo="BL-1" />));
  expect(container.textContent).toContain('조회 전');
  expect(lookupImportCargo).not.toHaveBeenCalled();
  await act(async () => container.querySelector('button')!.click());
  expect(lookupImportCargo).toHaveBeenCalledWith('BL-1');
  expect(container.textContent).toContain('실제 조회 아님');
  expect(container.textContent).toContain('조회 B/L BL-1');
  expect(container.querySelector('time')?.getAttribute('dateTime')).toBeTruthy();
});
it('shows a failed lookup without claiming success or leaving a previous success visible', async () => {
  vi.mocked(lookupImportCargo).mockRejectedValue(new Error('network'));
  await act(async () => root.render(<Panel initialBlNo="BL-2" />));
  await act(async () => container.querySelector('button')!.click());
  expect(container.textContent).toContain('조회 실패');
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.querySelector('time')).toBeNull();
});
