interface Props {
  current: number;
  labels: string[];
  onMove?: (step: number) => void;
}

export default function ImportStepIndicator({ current, labels, onMove }: Props) {
  return (
    <ol className="import-steps" aria-label="수입 거래 진행 단계">
      {labels.map((label, index) => {
        const step = index + 1;
        return (
          <li key={label} className={step === current ? 'current' : step < current ? 'done' : ''}>
            <button type="button" disabled={step > current || !onMove} onClick={() => onMove?.(step)}>
              <span>{step < current ? '✓' : step}</span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
