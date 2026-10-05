interface Props {
  current: number;
  labels: string[];
  onMove?: (step: number) => void;
  canMoveTo?: (step: number) => boolean;
  ariaLabel?: string;
}

export default function ImportStepIndicator({ current, labels, onMove, canMoveTo, ariaLabel = '수입 거래 진행 단계' }: Props) {
  return (
    <ol className="import-steps" aria-label={ariaLabel}>
      {labels.map((label, index) => {
        const step = index + 1;
        return (
          <li key={label} className={step === current ? 'current' : step < current ? 'done' : ''}>
            <button
              type="button"
              disabled={!onMove || (canMoveTo ? !canMoveTo(step) : step > current)}
              onClick={() => onMove?.(step)}
            >
              <span>{step < current ? '✓' : step}</span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
