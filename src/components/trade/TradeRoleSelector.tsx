import type { UserTradeRole } from '../../types/importTrade';

interface Props {
  value: UserTradeRole;
  allowedRoles: UserTradeRole[];
  onChange: (value: UserTradeRole) => void;
}

export default function TradeRoleSelector({ value, allowedRoles, onChange }: Props) {
  return (
    <section className="trade-choice-section" aria-labelledby="trade-role-title">
      <h2 id="trade-role-title">사용자 역할</h2>
      <div className="trade-choice-grid" role="radiogroup" aria-label="사용자 역할">
        {allowedRoles.map((role) => (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={value === role}
            className={`trade-choice compact ${value === role ? 'selected' : ''}`}
            onClick={() => onChange(role)}
          >
            <strong>{role === 'shipper' ? '화주' : '포워더'}</strong>
            <span>{role === 'shipper' ? '수입 신고 준비 및 관세 검토' : '서류 대사 및 통관 진행 추적'}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
