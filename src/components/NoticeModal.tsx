import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

/** 브라우저 alert 대신 쓰는 안내 모달 — 바깥을 누르거나 [확인]으로 닫는다. */
export default function NoticeModal({ title, children, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 92vw)', background: '#fff', borderRadius: 16, padding: '36px 32px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: '50%', background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary-color)' }}>
          <Info size={30} strokeWidth={2.2} />
        </div>
        <h3 style={{ margin: '0 0 18px', fontSize: 22, fontWeight: 800, color: 'var(--text-dark)' }}>{title}</h3>
        <div style={{ borderTop: '1px solid var(--border-color-subtle)', paddingTop: 18, fontSize: 16, color: 'var(--text-dark)', lineHeight: 1.8 }}>
          {children}
        </div>
        <div style={{ borderTop: '1px solid var(--border-color-subtle)', marginTop: 22, paddingTop: 18, display: 'flex', justifyContent: 'center' }}>
          <button className="btn btn-primary" style={{ minWidth: 200, justifyContent: 'center' }} onClick={onClose}>확인</button>
        </div>
      </div>
    </div>
  );
}
