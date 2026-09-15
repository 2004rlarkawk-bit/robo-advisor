/**
 * 빈 입력칸에서 Tab 을 누르면 회색 예시(placeholder) 값을 그대로 채워 준다.
 * - 채운 뒤에는 커서를 그 칸에 둔다(한 번 더 Tab 을 누르면 원래대로 다음 칸으로 이동).
 * - "선택하세요", "숫자만 입력하세요", "5자리", "010-0000-0000" 처럼 안내·형식 문구는 채우지 않는다.
 * - "예: …" 로 시작하면 예시가 분명하므로 접두어만 떼고 채운다.
 */

const EXAMPLE_PREFIX = /^\s*(예시?|ex|e\.g\.)\s*[:：)]\s*/i;
/** 값이 아니라 안내로 보이는 문구 */
const INSTRUCTION_PATTERN = /(하세요|주세요|입력|선택|검색|처리|자리|부여|없으면|비우면|직접|0000)/;
const FILLABLE_INPUT_TYPES = new Set(['text', 'search', 'tel', 'email', 'url', 'number']);

/** placeholder 에서 채울 값을 뽑는다. 채우면 안 되는 안내 문구면 null. */
export function placeholderFillValue(placeholder: string | null | undefined): string | null {
  const text = (placeholder ?? '').trim();
  if (!text) return null;
  const hasExamplePrefix = EXAMPLE_PREFIX.test(text);
  const value = text.replace(EXAMPLE_PREFIX, '').trim();
  if (!value) return null;
  if (!hasExamplePrefix && INSTRUCTION_PATTERN.test(value)) return null;
  return value;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React 제어 컴포넌트가 변경을 알아채도록 네이티브 setter 로 값을 넣고 input 이벤트를 보낸다.
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

export function handlePlaceholderTabFill(event: KeyboardEvent): boolean {
  if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return false;
  const element = event.target;
  const isInput = element instanceof HTMLInputElement;
  if (!isInput && !(element instanceof HTMLTextAreaElement)) return false;
  if (element.readOnly || element.disabled || element.value !== '') return false;
  if (isInput && !FILLABLE_INPUT_TYPES.has(element.type)) return false;

  const value = placeholderFillValue(element.placeholder);
  if (value === null) return false;
  if (isInput && element.type === 'number' && Number.isNaN(Number(value.replace(/,/g, '')))) return false;
  if (element.maxLength > 0 && value.length > element.maxLength) return false;

  event.preventDefault();
  setNativeValue(element, isInput && element.type === 'number' ? value.replace(/,/g, '') : value);
  return true;
}

/** 앱 전체에 한 번 설치한다. 해제 함수를 돌려준다. */
export function installPlaceholderTabFill(target: Document = document): () => void {
  const listener = (event: KeyboardEvent) => { handlePlaceholderTabFill(event); };
  target.addEventListener('keydown', listener, true);
  return () => target.removeEventListener('keydown', listener, true);
}
