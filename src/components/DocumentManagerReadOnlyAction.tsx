interface Props {
  onClose: () => void;
  className?: string;
  navigationAction?: {
    label: string;
    onClick: () => void;
  };
}

export default function DocumentManagerReadOnlyAction({ onClose, className = '', navigationAction }: Props) {
  return (
    <div className={`document-readonly-actions ${className}`.trim()}>
      {navigationAction && (
        <button type="button" className="btn btn-secondary document-readonly-navigation" onClick={navigationAction.onClick}>
          {navigationAction.label}
        </button>
      )}
      <button type="button" className="btn btn-secondary document-readonly-close" onClick={onClose}>
        닫기
      </button>
    </div>
  );
}
