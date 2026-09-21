import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import type { TradeMessage, TradeMessageKind } from '../../types/forwarderRequest';
import {
  listTradeMessages,
  markTradeMessagesRead,
  sendTradeMessage,
  subscribeToTradeMessages,
  TRADE_MESSAGE_MAX_LENGTH,
} from '../../services/tradeMessageService';
import '../../styles/forwarderRequest.css';

interface Props {
  tradeRequestId: string;
  currentUserId: string;
  /** 상대 표시 이름 — "인천테크 담당자", "지정 포워더" 등 */
  counterpartLabel: string;
  /** 거절·취소된 의뢰 — 읽기만 가능 */
  readOnly?: boolean;
  /** 스레드 위에 고정으로 보여줄 내용(기존 보완 요청 카드 등) */
  pinned?: React.ReactNode;
  /** 메시지 목록이 바뀔 때(로드·수신·전송) 호출 — 상위의 배지 갱신용 */
  onMessagesChanged?: (messages: TradeMessage[]) => void;
}

const KIND_LABEL: Record<Exclude<TradeMessageKind, 'message'>, string> = {
  return_request: '보완 요청',
  return_reply: '보완 회신',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function appendUnique(list: TradeMessage[], incoming: TradeMessage): TradeMessage[] {
  return list.some((item) => item.id === incoming.id) ? list : [...list, incoming];
}

/**
 * 의뢰 한 건의 화주↔포워더 대화. 메시지는 오래된 순으로 쌓이고, 상대 메시지는 열자마자 읽음 처리한다.
 * 실시간 구독이 끊겨도 "새로고침"으로 다시 받을 수 있다.
 */
export default function TradeMessageThread({
  tradeRequestId,
  currentUserId,
  counterpartLabel,
  readOnly = false,
  pinned,
  onMessagesChanged,
}: Props) {
  const [messages, setMessages] = useState<TradeMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const changedRef = useRef(onMessagesChanged);
  changedRef.current = onMessagesChanged;

  const markRead = useCallback(async () => {
    try {
      await markTradeMessagesRead(tradeRequestId);
    } catch (err) {
      // 읽음 표시 실패는 대화를 막지 않는다.
      console.warn('[대화] 읽음 처리 실패:', err);
    }
  }, [tradeRequestId]);

  const load = useCallback(async () => {
    setError('');
    try {
      const list = await listTradeMessages(tradeRequestId);
      setMessages(list);
      changedRef.current?.(list);
      if (list.some((item) => item.senderUserId !== currentUserId && !item.readAt)) await markRead();
    } catch (err) {
      console.error('[대화] 메시지 조회 실패:', err);
      setError('대화를 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.');
      setMessages((current) => current ?? []);
    }
  }, [tradeRequestId, currentUserId, markRead]);

  useEffect(() => {
    setMessages(null);
    setDraft('');
    void load();
  }, [load]);

  useEffect(() => subscribeToTradeMessages(tradeRequestId, (incoming) => {
    setMessages((current) => {
      const next = appendUnique(current ?? [], incoming);
      changedRef.current?.(next);
      return next;
    });
    if (incoming.senderUserId !== currentUserId) void markRead();
  }), [tradeRequestId, currentUserId, markRead]);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages?.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending || readOnly) return;
    setSending(true);
    setError('');
    try {
      const sent = await sendTradeMessage(tradeRequestId, text);
      setMessages((current) => {
        const next = appendUnique(current ?? [], sent);
        changedRef.current?.(next);
        return next;
      });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '메시지를 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  const remaining = TRADE_MESSAGE_MAX_LENGTH - draft.length;

  return (
    <section className="tm-thread" aria-label={`${counterpartLabel}와의 대화`}>
      <div className="tm-head">
        <MessageSquare size={16} aria-hidden="true" />
        <strong>{counterpartLabel}와의 대화</strong>
        <button type="button" className="tm-refresh" onClick={() => void load()}>새로고침</button>
      </div>

      {pinned}

      <div className="tm-list" ref={listRef} role="log" aria-live="polite">
        {messages === null ? (
          <p className="tm-empty">대화를 불러오는 중입니다.</p>
        ) : messages.length === 0 ? (
          <p className="tm-empty">아직 주고받은 메시지가 없습니다. 확인할 내용을 여기서 바로 물어보세요.</p>
        ) : messages.map((item) => {
          const mine = item.senderUserId === currentUserId;
          return (
            <article key={item.id} className={`tm-bubble${mine ? ' is-mine' : ''}${item.kind !== 'message' ? ' is-kind' : ''}`}>
              <div className="tm-meta">
                <span className="tm-sender">{mine ? '나' : counterpartLabel}</span>
                {item.kind !== 'message' && <span className="tm-kind">{KIND_LABEL[item.kind]}</span>}
                <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                {mine && item.readAt && <span className="tm-read">읽음</span>}
              </div>
              <p className="tm-body">{item.body}</p>
            </article>
          );
        })}
      </div>

      {error && <div className="form-message error" role="alert">{error}</div>}

      {readOnly ? (
        <p className="tm-closed">종료된 의뢰입니다. 대화 내용만 볼 수 있어요.</p>
      ) : (
        <div className="tm-composer">
          <textarea
            value={draft}
            maxLength={TRADE_MESSAGE_MAX_LENGTH}
            placeholder="메시지를 입력하세요. (Ctrl+Enter로 전송)"
            aria-label="메시지 입력"
            rows={2}
            disabled={sending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="tm-composer-foot">
            <span className={`tm-counter${remaining < 200 ? ' is-warn' : ''}`}>{remaining.toLocaleString()}자 남음</span>
            <button type="button" className="btn btn-primary" disabled={sending || !draft.trim()} onClick={() => void submit()}>
              <Send size={15} aria-hidden="true" /> {sending ? '전송 중…' : '보내기'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
