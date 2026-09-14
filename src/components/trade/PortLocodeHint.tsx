import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import {
  formatPortLabel,
  loadPortData,
  resolvePort,
  type PortEntry,
  type PortResolution,
} from '../../services/portLocodeService';

interface PortLocodeHintProps {
  /** 사용자가 직접 입력한 항구명 */
  value: string;
  /** 제안 항구를 눌렀을 때 폼에 넣을 값을 받는다 */
  onApply: (value: string) => void;
}

const DEBOUNCE_MS = 300;

/**
 * 기타항 직접 입력 칸 아래에 붙는 UN/LOCODE 확인 안내.
 *  - 찾음:   ✓ Busan (KRPUS)
 *  - 오타:   목록에 없음 — Busan (KRPUS)? [이 항구로 바꾸기]
 *  - 없음:   목록에서 찾지 못함, 철자·국가명 확인 안내
 * 검증 룰(R20)과 같은 판정을 입력 시점에 미리 보여줘 생성 후 되돌아오는 일을 줄인다.
 */
export default function PortLocodeHint({ value, onApply }: PortLocodeHintProps) {
  const [resolution, setResolution] = useState<PortResolution | null>(null);

  useEffect(() => {
    const text = value.trim();
    if (!text) { setResolution(null); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void loadPortData().then((ports) => {
        if (!active) return;
        setResolution(resolvePort(text, ports.length ? ports : null));
      });
    }, DEBOUNCE_MS);
    return () => { active = false; window.clearTimeout(timer); };
  }, [value]);

  if (!resolution || resolution.status === 'unavailable') return null;

  const apply = (entry: PortEntry) => onApply(formatPortLabel(entry));

  if (resolution.status === 'exact' && resolution.match) {
    return (
      <p className="port-hint port-hint--ok">
        <CheckCircle2 size={14} /> UN/LOCODE 확인: <b>{formatPortLabel(resolution.match)}</b>
        {resolution.suggestions.length > 0 && (
          <span className="port-hint__alt">
            다른 나라에도 같은 이름이 있습니다 — {resolution.suggestions.map((s) => `${s.name} (${s.locode})`).join(', ')}.
            국가명을 함께 적으면 정확합니다.
          </span>
        )}
      </p>
    );
  }

  if (resolution.status === 'fuzzy' && resolution.match) {
    return (
      <p className="port-hint port-hint--warn">
        <AlertTriangle size={14} /> UN/LOCODE 목록에 없는 표기입니다. 혹시
        {resolution.suggestions.map((entry) => (
          <button key={entry.locode} type="button" className="port-hint__pick" onClick={() => apply(entry)}>
            {formatPortLabel(entry)}
          </button>
        ))}
        ? 누르면 그 항구로 바뀝니다.
      </p>
    );
  }

  return (
    <p className="port-hint port-hint--unknown">
      <HelpCircle size={14} /> UN/LOCODE 항구 목록에서 찾지 못했습니다. 철자를 확인하거나 국가명을 함께 적어 주세요. 예: OSAKA, JAPAN
    </p>
  );
}
