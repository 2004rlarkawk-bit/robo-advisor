import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  title: string;
  message: string;
  /** 하단 구분선 아래 버튼 영역 */
  actions?: ReactNode;
}

/** 요청·이메일·보완 요청 전송 완료 화면 — 체크 아이콘, 제목, 한 줄 안내, 버튼. */
export default function SentConfirmation({ title, message, actions }: Props) {
  return (
    <div className="sent-confirmation" role="status">
      <div className="sent-confirmation-body">
        <span className="sent-confirmation-icon" aria-hidden="true"><CheckCircle2 size={34} strokeWidth={2} /></span>
        <h3>{title}</h3>
        <p>{message}</p>
      </div>
      {actions && <div className="sent-confirmation-actions">{actions}</div>}
    </div>
  );
}
