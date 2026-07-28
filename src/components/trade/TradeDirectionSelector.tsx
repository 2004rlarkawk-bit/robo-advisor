import type { TradeDirection } from '../../types/importTrade';

interface Props {
  value: TradeDirection;
  onChange: (value: TradeDirection) => void;
}

export default function TradeDirectionSelector({ value, onChange }: Props) {
  return (
    <section className="trade-choice-section" aria-labelledby="trade-direction-title">
      <h2 id="trade-direction-title">거래 유형</h2>
      <div className="trade-choice-grid" role="radiogroup" aria-label="거래 유형">
        {([
          ['export', '수출', '해외로 상품을 보내는 거래'],
          ['import', '수입', '해외에서 상품을 들여오는 거래'],
        ] as const).map(([direction, label, description]) => (
          <button
            key={direction}
            type="button"
            role="radio"
            aria-checked={value === direction}
            className={`trade-choice ${value === direction ? 'selected' : ''}`}
            onClick={() => onChange(direction)}
          >
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
