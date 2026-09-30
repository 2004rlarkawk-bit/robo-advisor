import type { ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  title: string;
  /**
   * 안내 문장. 문장이 둘 이상이면 배열로 넘긴다 —
   * 한 덩어리로 넘기면 "…수락을 / 기다리고 있습니다"처럼 문장 가운데가 끊긴다.
   */
  message: ReactNode | ReactNode[];
  /** 하단 구분선 아래 버튼 영역 */
  actions?: ReactNode;
}

/** 요청·이메일·보완 요청 전송 완료 화면 — 체크 아이콘, 제목, 안내 문장, 버튼. */
export default function SentConfirmation({ title, message, actions }: Props) {
  return (
    <div className="sent-confirmation" role="status">
      <div className="sent-confirmation-body">
        <span className="sent-confirmation-icon" aria-hidden="true"><CheckCircle2 size={34} strokeWidth={2} /></span>
        <h3>{title}</h3>
        {(Array.isArray(message) ? message : [message]).map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
      {actions && <div className="sent-confirmation-actions">{actions}</div>}
    </div>
  );
}
