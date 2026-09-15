import { useCallback, useEffect, useState, useRef } from 'react';
import { countTradesByType, filterTradesByType, type TradeTypeCounts, type TradeTypeFilter } from '../utils/tradeTypeFilter';
import { FileText, FolderOpen, Trash2, CheckCircle2, ChevronDown, Copy, CornerUpLeft, Mail } from 'lucide-react';
import type { SavedTrade } from '../types';
import type { ForwarderCaseState } from '../types/forwarderCase';
import { deleteSavedTrade, fetchSubmittedTrades } from '../services/storageService';
import { filterDocumentManagerTrades } from '../services/tradeListPolicy';
import { hasActiveShipperReturnRequest } from '../services/forwarderCaseService';

interface Props {
  onLoad: (trade: SavedTrade) => void;
  onCopy: (trade: SavedTrade) => void;
  /** 포워더 보완 요청을 받은 수입 거래를 다시 열어 수정하러 이동 */
  onRevise?: (trade: SavedTrade) => void;
  /** 현재 선택된 역할의 거래만 표시 — 화주·포워더 거래가 섞여 보이지 않게 한다 */
  roleFilter?: 'shipper' | 'forwarder';
  onListReady?: () => void;
  /** 문서 관리 상단 수출/수입 필터 */
  typeFilter?: TradeTypeFilter;
  /** 역할 필터가 적용된 제출 거래의 수출/수입 건수 */
  onTypeCounts?: (counts: TradeTypeCounts) => void;
}

function formatMailDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

interface ReturnReasonSection {
  title: string;
  lines: string[];
  /** '반드시 수정' 묶음은 빨간 강조로 구분한다 */
  blocking: boolean;
}

/**
 * 포워더 보완 요청 사유를 섹션 카드로 나눈다.
 * 포워더 화면이 '[제목]' 줄 + '· 항목' 줄 묶음을 빈 줄로 구분해 저장하므로 그 형식을 읽는다.
 * 형식이 다르면 빈 배열을 돌려 원문 그대로 보여주게 한다.
 */
// 사유 한 줄을 첫 연결어미(…의 / …아 / …어 / …서 / …며 / …고) 뒤에서 두 줄로 나눈다.
export function splitReasonLine(line: string): [string, string] {
  const match = /[A-Za-z0-9가-힣]*[가-힣A-Za-z0-9](?:의|아|어|서|며|고)\s/.exec(line);
  if (!match) return [line, ''];
  const cut = match.index + match[0].length;
  const tail = line.slice(cut).trim();
  return tail ? [line.slice(0, cut).trimEnd(), tail] : [line, ''];
}

export function parseReturnReason(reason: string): ReturnReasonSection[] {
  const blocks = reason.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  const sections: ReturnReasonSection[] = [];
  for (const block of blocks) {
    const [head, ...rest] = block.split('\n');
    const match = head.trim().match(/^\[(.+)\]$/);
    if (!match) return [];
    const lines = rest
      .map((line) => line.trim().replace(/^[·•-]\s*/, ''))
      .filter(Boolean);
    sections.push({ title: match[1], lines, blocking: match[1].includes('반드시') });
  }
  return sections;
}

/** 문서 수정이 필요한 보완 요청만 문서 관리에 남긴다. 포워더 진행 상태는 전용 메뉴에서 확인한다. */
function ForwarderProgress({ trade, onRevise }: { trade: SavedTrade; onRevise?: (trade: SavedTrade) => void }) {
  if ((trade.tradeDirection ?? trade.profile.tradeType) !== 'import') return null;
  if (trade.tradeRole === 'forwarder') return null;

  const state = (trade.forwarderCase as ForwarderCaseState | null) ?? null;
  const returnRequest = state?.returnRequest;
  const returnPending = Boolean(returnRequest && !returnRequest.resolvedAt);
  if (!returnPending || !returnRequest) return null;

  return (
    <div className="dm-fwd">
      <div className="dm-mail">
          <div className="dm-mail-head">
            <span className="dm-mail-title"><Mail size={17} /> 포워더 보완 요청</span>
            <span className="dm-mail-date">{formatMailDate(returnRequest.requestedAt)}</span>
          </div>
          <div className="dm-mail-body">
            <p className="dm-mail-greeting"><strong>{trade.profile.companyName || '담당자'}님</strong>, 안녕하세요.</p>
            <p>전달해 주신 서류를 검토한 결과, 아래 항목의 보완이 필요합니다.</p>
            {(() => {
              const sections = parseReturnReason(returnRequest.reason);
              if (sections.length === 0) {
                return <blockquote className="dm-mail-quote">{returnRequest.reason}</blockquote>;
              }
              return (
                <div className="dm-mail-sections">
                  {sections.map((section) => (
                    <div
                      key={section.title}
                      className={`dm-mail-section${section.blocking ? ' is-blocking' : ''}`}
                    >
                      <strong>[{section.title}]</strong>
                      <ul>
                        {section.lines.map((line) => {
                          const [head, tail] = splitReasonLine(line);
                          return <li key={line}>{head}{tail && <><br />{tail}</>}</li>;
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })()}
            <p>수정 후 다시 제출해 주시면 통관 검토를 이어서 진행하겠습니다.</p>
            <div className="dm-mail-foot">
              <span className="dm-mail-sign">— 담당 포워더 드림</span>
              {onRevise && (
                <button type="button" className="btn btn-primary dm-mail-cta" onClick={() => onRevise(trade)}>
                  <CornerUpLeft size={16} /> 지금 수정하러 가기
                </button>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}

export default function DocumentManagerPanel({
  onLoad,
  onCopy,
  onRevise,
  roleFilter,
  onListReady,
  typeFilter = 'all',
  onTypeCounts,
}: Props) {
  const [trades, setTrades] = useState<SavedTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // 문서 관리 탭 진입 시 임시보관함이 먼저 보이도록 기본 접힘
  const [open, setOpen] = useState(false);
  const [sortKey, setSortKey] = useState<'latest' | 'oldest'>('latest');

  const loadTrades = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const fetched = filterDocumentManagerTrades(await fetchSubmittedTrades());
      const loaded = roleFilter
        ? fetched.filter((trade) => (trade.tradeRole ?? 'shipper') === roleFilter)
        : fetched;
      setTrades(loaded);
      // 포워더 보완 요청이 걸린 거래가 있으면 화주가 바로 볼 수 있게 패널을 자동으로 펼친다.
      if (loaded.some((trade) => hasActiveShipperReturnRequest(trade))) setOpen(true);
    } catch (caught) {
      console.error(
        '[Document Manager] submitted trades query failed:',
        caught
      );

      setError(
        '제출된 문서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
    } finally {
      setIsLoading(false);
      onListReady?.();
    }
  }, [onListReady, roleFilter]);

  useEffect(() => {
    void loadTrades();
  }, [loadTrades]);

  const handleDelete = async (id: string) => {
    try {
      await deleteSavedTrade(id);

      setTrades((current) =>
        current.filter((trade) => trade.id !== id)
      );
    } catch (caught) {
      console.error(
        '[Document Manager] trade deletion failed:',
        caught
      );

      setError(
        '문서를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      );
    }
  };

  const tradeTime = (trade: SavedTrade) => {
    const t = new Date(trade.submittedAt ?? trade.createdAt).getTime();
    return Number.isNaN(t) ? 0 : t;
  };

  const typeCounts = countTradesByType(trades);
  const onTypeCountsRef = useRef(onTypeCounts);
  onTypeCountsRef.current = onTypeCounts;
  useEffect(() => {
    onTypeCountsRef.current?.({ export: typeCounts.export, import: typeCounts.import });
  }, [typeCounts.export, typeCounts.import]);

  const visibleTrades = filterTradesByType(trades, typeFilter);
  const sortedTrades = [...visibleTrades].sort((a, b) =>
    sortKey === 'oldest' ? tradeTime(a) - tradeTime(b) : tradeTime(b) - tradeTime(a)
  );

  const formatDate = (trade: SavedTrade) => {
    const created = new Date(
      trade.submittedAt ?? trade.createdAt
    );

    if (Number.isNaN(created.getTime())) {
      return trade.createdAt;
    }

    return `${created.getFullYear()}.${String(
      created.getMonth() + 1
    ).padStart(2, '0')}.${String(
      created.getDate()
    ).padStart(2, '0')} ${String(
      created.getHours()
    ).padStart(2, '0')}:${String(
      created.getMinutes()
    ).padStart(2, '0')}`;
  };

  return (
    <section className="doc-panel">
      <button
        type="button"
        className="doc-panel-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="doc-panel-icon"><FileText size={22} /></span>
        <div className="doc-panel-head-main">
          <span className="doc-panel-title">
            최종 제출된 거래
            <span className="doc-panel-count">
              {visibleTrades.length}건
            </span>
            {visibleTrades.some(hasActiveShipperReturnRequest) && (
              <span className="doc-panel-alert">보완 요청 {visibleTrades.filter(hasActiveShipperReturnRequest).length}건</span>
            )}
          </span>

          <span className="doc-panel-sub">
            최종 제출이 완료된 거래를 조회하고, 새로운 거래로 복사할 수 있어요.
          </span>
        </div>

        <ChevronDown
          size={21}
          className={`doc-panel-chevron ${open ? 'open' : ''}`}
        />
      </button>

      {open && (
        <div className="doc-panel-body">
          {error && (
            <div
              className="form-message error"
              role="alert"
            >
              {error}
            </div>
          )}

          {!isLoading && trades.length > 0 && (
            /* 정렬 — 통관 내역·임시보관함과 같은 조작 방식으로 맞춘다 */
            <div className="list-sort-row">
              <select
                className="customs-sort-select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as 'latest' | 'oldest')}
                aria-label="제출 거래 정렬 순서"
              >
                <option value="latest">최신순</option>
                <option value="oldest">오래된순</option>
              </select>
            </div>
          )}

          {isLoading ? (
            <div className="doc-empty">
              제출된 문서를 불러오는 중입니다.
            </div>
          ) : visibleTrades.length === 0 ? (
            <div className="doc-empty">
              <FolderOpen size={34} />
              <span>
                {trades.length > 0 && typeFilter !== 'all'
                  ? `${typeFilter === 'export' ? '수출' : '수입'} 거래 중 최종 제출된 문서가 없습니다.`
                  : '아직 제출된 문서가 없습니다.'}
              </span>
            </div>
          ) : (
            /* 임시보관함과 같은 행 카드 형식 — 목록 스타일을 한 벌로 통일 */
            sortedTrades.map((trade) => {
              const p = trade.profile;
              const country = p.partnerCountry || p.buyerCountry || '';
              const ports = [p.loadPort, p.dischargePort].filter(Boolean).join(' → ');
              const route = [country, ports, p.incoterms].filter(Boolean).join(' · ');
              return (
                <div key={trade.id} id={`dm-row-${trade.id}`} className="draft-tray-item dm-row">
                  <div className="draft-tray-info">
                    <div className="draft-tray-line1">
                      <span className={`trade-type-badge ${p.tradeType}`}>{p.tradeType === 'export' ? '수출' : '수입'}</span>
                      <span className="draft-tray-name">{p.itemName || '(품목명 없음)'}</span>
                      <span className="draft-tray-status" style={{ color: '#15803d', background: '#f0fdf4' }}>
                        <CheckCircle2 size={12} style={{ verticalAlign: -1.5, marginRight: 4 }} />제출 완료
                      </span>
                    </div>
                    {route && <span className="draft-tray-route">{route}</span>}
                    <span className="draft-tray-time">{formatDate(trade)}</span>
                  </div>
                  <div className="draft-tray-actions">
                    <button type="button" className="draft-tray-resume" onClick={() => onLoad(trade)}>
                      <FolderOpen size={15} /> 조회
                    </button>
                    <button type="button" className="draft-tray-resume" onClick={() => onCopy(trade)}>
                      <Copy size={15} /> 새 거래로 복사
                    </button>
                    <button
                      type="button"
                      className="draft-tray-delete"
                      aria-label="문서 삭제"
                      onClick={() => void handleDelete(trade.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {/* 문서 수정과 직접 관련된 보완 요청만 문서 관리에 표시한다. */}
                  <ForwarderProgress trade={trade} onRevise={onRevise} />
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
