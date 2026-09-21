import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { RefreshCw, Send } from 'lucide-react';
import type { TradeMessage, TradeMessageKind } from '../../types/forwarderRequest';
import {
  listTradeMessages,
  markTradeMessagesRead,
  sendTradeMessage,
  subscribeToTradeMessages,
  TRADE_MESSAGE_MAX_LENGTH,
} from '../../services/tradeMessageService';
import { formatMessageTime, groupTradeMessages } from '../../utils/tradeMessageGrouping';
import '../../styles/forwarderRequest.css';

interface Props {
  tradeRequestId: string;
  currentUserId: string;
  /** 상대 표시 이름 — "인천테크 담당자", "지정 포워더" 등 */
  counterpartLabel: string;
  /** 거절·취소된 의뢰 — 읽기만 가능 */
  readOnly?: boolean;
  /** 대화 위에 고정으로 보여줄 내용(기존 보완 요청 카드 등) */
  pinned?: React.ReactNode;
  /** 메시지 목록이 바뀔 때(로드·수신·전송) 호출 — 상위의 배지 갱신용 */
  onMessagesChanged?: (messages: TradeMessage[]) => void;
}

const KIND_LABEL: Record<Exclude<TradeMessageKind, 'message'>, string> = {
  return_request: '보완 요청',
  return_reply: '보완 회신',
};

/** 글자 수는 평소엔 숨기고 한도에 가까워질 때만 보여준다. */
const COUNTER_VISIBLE_FROM = 200;

function appendUnique(list: TradeMessage[], incoming: TradeMessage): TradeMessage[] {
  return list.some((item) => item.id === incoming.id) ? list : [...list, incoming];
}

function initialOf(label: string): string {
  return label.trim().charAt(0) || '·';
}

/**
 * 의뢰 한 건의 화주↔포워더 대화. 메신저처럼 날짜 구분선·연속 메시지 묶기·시각 표시를 쓰고,
 * 상대 메시지는 열자마자 읽음 처리한다. 실시간 구독이 끊겨도 새로고침으로 다시 받을 수 있다.
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
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages?.length]);

  const resizeInput = () => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = 'auto';
    // 다섯 줄쯤에서 멈추고 그 뒤로는 안에서 스크롤한다.
    node.style.height = `${Math.min(node.scrollHeight, 116)}px`;
  };

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
      if (inputRef.current) inputRef.current.style.height = 'auto';
    } catch (err) {
      setError(err instanceof Error ? err.message : '메시지를 보내지 못했습니다.');
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // 한글 입력 중 Enter는 글자 조합을 끝내는 키라 전송으로 쓰면 안 된다.
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  const remaining = TRADE_MESSAGE_MAX_LENGTH - draft.length;
  const groups = groupTradeMessages(messages ?? []);

  return (
    <section className="tm-chat" aria-label={`${counterpartLabel}와의 대화`}>
      <header className="tm-chat-head">
        <span className="tm-avatar" aria-hidden="true">{initialOf(counterpartLabel)}</span>
        <div className="tm-chat-who">
          <strong>{counterpartLabel}</strong>
          <span>{readOnly ? '종료된 의뢰' : '의뢰 진행 중'}</span>
        </div>
        <button type="button" className="tm-icon-btn" aria-label="대화 새로고침" onClick={() => void load()}>
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </header>

      {pinned}

      <div className="tm-log" ref={logRef} role="log" aria-live="polite">
        {messages === null ? (
          <p className="tm-empty">대화를 불러오는 중입니다.</p>
        ) : messages.length === 0 ? (
          <p className="tm-empty">아직 주고받은 메시지가 없습니다.<br />확인할 내용을 여기서 바로 물어보세요.</p>
        ) : groups.map((group) => (
          <Fragment key={group.dateKey}>
            {group.dateLabel && <div className="tm-day"><span>{group.dateLabel}</span></div>}
            {group.items.map(({ message, showSender, showTime }) => {
              const mine = message.senderUserId === currentUserId;
              return (
                <div key={message.id} className={`tm-row${mine ? ' is-mine' : ''}${showSender ? ' is-head' : ''}`}>
                  {!mine && (showSender
                    ? <span className="tm-avatar is-sm" aria-hidden="true">{initialOf(counterpartLabel)}</span>
                    : <span className="tm-avatar-gap" aria-hidden="true" />)}
                  <div className="tm-stack">
                    {!mine && showSender && <span className="tm-name">{counterpartLabel}</span>}
                    <div className="tm-line">
                      <div className={`tm-bubble${message.kind !== 'message' ? ' is-kind' : ''}`}>
                        {message.kind !== 'message' && <span className="tm-kind">{KIND_LABEL[message.kind]}</span>}
                        <p>{message.body}</p>
                      </div>
                      {showTime && (
                        <span className="tm-stamp">
                          {mine && message.readAt && <b>읽음</b>}
                          <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      {error && <div className="form-message error" role="alert">{error}</div>}

      {readOnly ? (
        <p className="tm-closed">종료된 의뢰입니다. 대화 내용만 볼 수 있어요.</p>
      ) : (
        <div className="tm-composer">
          <textarea
            ref={inputRef}
            value={draft}
            rows={1}
            maxLength={TRADE_MESSAGE_MAX_LENGTH}
            placeholder="메시지 입력"
            aria-label="메시지 입력"
            disabled={sending}
            onChange={(event) => { setDraft(event.target.value); resizeInput(); }}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="tm-send" aria-label="보내기" disabled={sending || !draft.trim()} onClick={() => void submit()}>
            <Send size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {!readOnly && remaining < COUNTER_VISIBLE_FROM && <span className="tm-counter">{remaining.toLocaleString()}자 남음</span>}
    </section>
  );
}
