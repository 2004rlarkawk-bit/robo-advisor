import { useState } from 'react';
import { RotateCcw, Trash2, X } from 'lucide-react';
import '../../styles/forwarderRequest.css';
import '../../styles/trashBin.css';

export interface TrashItem {
  id: string;
  title: string;
  detail?: string;
}

interface Props {
  items: TrashItem[];
  onRestore: (id: string) => void;
  onRestoreAll: () => void;
}

/**
 * 목록에서 밀어 지운 항목을 모아 두는 휴지통 — 하나씩 또는 한 번에 되돌린다.
 * 실제 거래·의뢰는 지우지 않고 이 사용자 목록에서만 숨겨 둔 것이다.
 */
export default function TrashBin({ items, onRestore, onRestoreAll }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="trash-open"
        aria-label={items.length ? `휴지통 ${items.length}건` : '휴지통'}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={16} aria-hidden="true" /> 휴지통
      </button>

      {open && (
        <div className="fwd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="fwd-modal trash-modal" role="dialog" aria-modal="true" aria-labelledby="trash-title">
            <div className="fwd-modal-head trash-head">
              <div className="trash-title">
                <span className="trash-title-icon" aria-hidden="true"><Trash2 size={26} /></span>
                <h2 id="trash-title">휴지통</h2>
              </div>
              <button type="button" className="fwd-modal-close" aria-label="닫기" onClick={() => setOpen(false)}><X size={22} /></button>
            </div>
            {items.length === 0 ? (
              <p className="trash-empty">휴지통이 비어 있어요.</p>
            ) : (
              <ul className="trash-list">
                {items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      {item.detail && <span>{item.detail}</span>}
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRestore(item.id)}>
                      <RotateCcw size={14} aria-hidden="true" /> 복원
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {items.length > 1 && (
              <div className="trash-actions">
                <button type="button" className="btn btn-secondary" onClick={onRestoreAll}>모두 복원</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
