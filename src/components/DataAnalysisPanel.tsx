/**
 * 데이터 분석 페이지 — 관세청 무역통계 시각화
 *
 * 데이터 소스 (customsApiService, 키 없으면 시뮬레이션 폴백):
 *  - getTotalTradeStats   → 월별 수출입 총괄 (라인 차트 + 요약 타일)
 *  - getCountryTradeStats → 국가별 실적 (가로 막대)
 *  - getItemTradeStats    → HS코드별 트렌드 (라인 차트)
 *
 * 차트는 외부 라이브러리 없이 SVG 직접 렌더.
 * 시리즈 색은 항상 수출=파랑, 수입=청록 고정 (차트 간 동일 엔티티 동일 색).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Search } from 'lucide-react';
import { fetchSavedTrades } from '../services/storageService';
import { isSupabaseConfigured } from '../lib/supabase';
import type { SavedTrade } from '../types';
import {
  getTotalTradeStats,
  getCountryTradeStats,
  getItemTradeStats,
  TotalTradeStat,
  CountryTradeStat,
  ItemTradeStat,
} from '../services/customsApiService';

const COLOR_EXPORT = '#0b57d0'; // 수출
const COLOR_IMPORT = '#1baf7a'; // 수입
const INK_MUTED = '#898781';
const GRID = '#e1e0d9';

/** 한국시간 직전 완료월 기준 최근 n개월 범위 */
export function recentRange(n: number, now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const endDate = new Date(Date.UTC(year, month - 2, 1));
  const startDate = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth() - (n - 1),
    1,
  ));
  const format = (date: Date) =>
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  const end = format(endDate);
  const start = format(startDate);
  return { start, end };
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}억$`;
  if (abs >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만$`;
  return `$${v.toLocaleString()}`;
}

function SourceBadge({ source }: { source: 'api' }) {
  return (
    <span
      title={`source: ${source}`}
      style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
        background: '#f0fdf4',
        color: '#15803d',
        border: '1px solid #bbf7d0',
      }}
    >
      관세청 원데이터
    </span>
  );
}

function formatPeriod(period: string): string {
  return /^\d{6}$/.test(period)
    ? `${period.slice(0, 4)}.${period.slice(4)}`
    : period;
}

function LatestPeriod({ period }: { period: string | null }) {
  if (!period) return null;
  return (
    <span style={{ fontSize: 12, color: '#64748b', marginRight: 12 }}>
      최신 기준: {period.slice(0, 4)}년 {Number(period.slice(4))}월
    </span>
  );
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#52514e' }}>
      {[['수출', COLOR_EXPORT], ['수입', COLOR_IMPORT]].map(([label, color]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ===== 라인 차트 (수출/수입 2시리즈 공용) =====

interface LinePoint { label: string; exp: number; imp: number }

function DualLineChart({ points, height = 220 }: { points: LinePoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const PAD = { l: 56, r: 64, t: 12, b: 26 };
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;

  const yMax = useMemo(() => {
    const m = Math.max(1, ...points.flatMap((p) => [p.exp, p.imp]));
    return m * 1.1;
  }, [points]);

  if (points.length === 0) return null;
  const x = (i: number) => PAD.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / yMax) * ih;
  const path = (key: 'exp' | 'imp') => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMax * t);
  const last = points.length - 1;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const mx = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.round(((mx - PAD.l) / iw) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, idx)));
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill={INK_MUTED}>{fmtUsd(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={INK_MUTED}>
            {p.label.slice(-2)}월
          </text>
        ))}
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} stroke="#c3c2b7" strokeWidth={1} strokeDasharray="3 3" />
        )}
        <path d={path('exp')} fill="none" stroke={COLOR_EXPORT} strokeWidth={2} strokeLinejoin="round" />
        <path d={path('imp')} fill="none" stroke={COLOR_IMPORT} strokeWidth={2} strokeLinejoin="round" />
        {/* 데이터가 1개 기간뿐이면 선이 그려지지 않으므로 점으로 표시 */}
        {points.length === 1 && (
          <>
            <circle cx={x(0)} cy={y(points[0].exp)} r={5} fill={COLOR_EXPORT} />
            <circle cx={x(0)} cy={y(points[0].imp)} r={5} fill={COLOR_IMPORT} />
          </>
        )}
        {hover !== null && (
          <>
            <circle cx={x(hover)} cy={y(points[hover].exp)} r={4} fill={COLOR_EXPORT} stroke="#fff" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(points[hover].imp)} r={4} fill={COLOR_IMPORT} stroke="#fff" strokeWidth={2} />
          </>
        )}
        {/* 라인 끝 직접 라벨 (색 대비 relief) */}
        <text x={x(last) + 8} y={y(points[last].exp) + 3.5} fontSize={11} fontWeight={600} fill="#52514e">수출</text>
        <text x={x(last) + 8} y={y(points[last].imp) + 3.5} fontSize={11} fontWeight={600} fill="#52514e">수입</text>
      </svg>
      {hover !== null && (
        <div
          style={{
            position: 'absolute', top: 4,
            left: `${(x(hover) / W) * 100}%`,
            transform: hover > points.length / 2 ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
            background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8,
            boxShadow: '0 4px 12px rgba(15,23,42,0.08)', padding: '8px 10px',
            fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{formatPeriod(points[hover].label)}</div>
          <div style={{ color: '#52514e' }}>
            <span style={{ color: COLOR_EXPORT }}>●</span> 수출 {fmtUsd(points[hover].exp)}
          </div>
          <div style={{ color: '#52514e' }}>
            <span style={{ color: COLOR_IMPORT }}>●</span> 수입 {fmtUsd(points[hover].imp)}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== 국가별 가로 막대 =====

function CountryBars({ rows }: { rows: { name: string; exp: number; imp: number }[] }) {
  const W = 640;
  const ROW_H = 42;
  const PAD = { l: 96, r: 76, t: 4, b: 4 };
  const iw = W - PAD.l - PAD.r;
  const height = PAD.t + PAD.b + rows.length * ROW_H;
  const max = Math.max(1, ...rows.flatMap((r) => [r.exp, r.imp]));
  const w = (v: number) => Math.max(2, (v / max) * iw);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {rows.map((r, i) => {
        const top = PAD.t + i * ROW_H;
        return (
          <g key={r.name}>
            <text x={PAD.l - 10} y={top + ROW_H / 2 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill="#1e293b">
              {r.name}
            </text>
            <rect x={PAD.l} y={top + 6} width={w(r.exp)} height={12} rx={3} fill={COLOR_EXPORT}>
              <title>{`${r.name} 수출 ${fmtUsd(r.exp)}`}</title>
            </rect>
            <text x={PAD.l + w(r.exp) + 6} y={top + 16} fontSize={10.5} fill="#52514e">{fmtUsd(r.exp)}</text>
            <rect x={PAD.l} y={top + 22} width={w(r.imp)} height={12} rx={3} fill={COLOR_IMPORT}>
              <title>{`${r.name} 수입 ${fmtUsd(r.imp)}`}</title>
            </rect>
            <text x={PAD.l + w(r.imp) + 6} y={top + 32} fontSize={10.5} fill="#52514e">{fmtUsd(r.imp)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ===== 데이터 테이블 (접근성/검증용 폴백) =====

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details style={{ marginTop: 10 }}>
      <summary style={{ fontSize: 12, color: '#64748b', cursor: 'pointer' }}>표로 보기</summary>
      <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontVariantNumeric: 'tabular-nums' }}>
                  {typeof c === 'number' ? fmtUsd(c) : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function ChartCard({ title, badge, right, children }: {
  title: string; badge?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="form-card" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 className="card-title" style={{ margin: 0, fontSize: 16 }}>{title}</h2>
        {badge}
        <div style={{ marginLeft: 'auto' }}>{right}</div>
      </div>
      {children}
    </div>
  );
}

// ===== 메인 패널 =====

type LoadStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

interface LoadState<T> {
  status: LoadStatus;
  records: T[];
  source: 'api' | null;
  latestPeriod: string | null;
  error: string | null;
}

function idleState<T>(): LoadState<T> {
  return { status: 'idle', records: [], source: null, latestPeriod: null, error: null };
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
      <Loader2 size={14} className="animate-spin" /> 불러오는 중…
    </div>
  );
}

function EmptyState() {
  return <p style={{ fontSize: 13, color: '#64748b' }}>선택한 기간에 조회된 관세청 데이터가 없습니다.</p>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" style={{ padding: '14px 16px', border: '1px solid #fecaca', borderRadius: 8, background: '#fef2f2' }}>
      <p style={{ margin: '0 0 10px', color: '#b91c1c', fontSize: 13 }}>
        관세청 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <button type="button" className="btn-secondary" onClick={onRetry}>재시도</button>
    </div>
  );
}

interface DataAnalysisPanelProps {
  /** 통관 작업실에서 작성 중인 품목 — 있으면 품목 트렌드 초기값으로 사용 */
  currentItem?: { hsCode: string; itemName: string };
}

const cleanHsCode = (v: string) => (v || '').replace(/[^0-9]/g, '');
const isValidHsCode = (v: string) => /^\d{6,10}$/.test(v);

export default function DataAnalysisPanel({ currentItem }: DataAnalysisPanelProps = {}) {
  const range = useMemo(() => recentRange(6), []);
  const [totalState, setTotalState] = useState<LoadState<TotalTradeStat>>(idleState);
  const [countryState, setCountryState] = useState<LoadState<CountryTradeStat>>(idleState);
  const [itemState, setItemState] = useState<LoadState<ItemTradeStat>>(idleState);
  // 작성 중인 거래에 유효한 HS코드가 있으면 그 품목부터 보여준다 (없으면 샘플 코드)
  const currentHs = cleanHsCode(currentItem?.hsCode ?? '');
  const initialHs = isValidHsCode(currentHs) ? currentHs : '8517621010';
  const [hsInput, setHsInput] = useState(initialHs);
  const [hsQuery, setHsQuery] = useState(initialHs);
  // 내 거래 데이터 — "내 무역 현황" 섹션과 품목 칩의 공용 소스
  // (Supabase 미설정 환경(테스트)에서는 스텁 호출이 미처리 거부를 만들므로 조회하지 않는다)
  const [myTrades, setMyTrades] = useState<SavedTrade[] | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const trades = await fetchSavedTrades();
        if (!cancelled) setMyTrades(trades);
      } catch {
        // 조회 실패(미로그인 등) 시 내 거래 섹션만 생략 — 페이지 나머지는 정상 동작
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 품목 칩 — 작성 중 품목 + 저장된 거래 품목 (최대 6개)
  const myItems = useMemo(() => {
    const picked = new Map<string, string>();
    if (isValidHsCode(currentHs)) {
      picked.set(currentHs, currentItem?.itemName?.trim() || `HS ${currentHs}`);
    }
    for (const t of myTrades ?? []) {
      const code = cleanHsCode(t.profile?.hsCode ?? '');
      if (!isValidHsCode(code) || picked.has(code)) continue;
      picked.set(code, t.profile?.itemName?.trim() || `HS ${code}`);
      if (picked.size >= 6) break;
    }
    return [...picked.entries()].map(([hsCode, label]) => ({ hsCode, label }));
    // eslint 미사용 규칙 없음 — currentHs/currentItem은 마운트 후 불변 가정
  }, [myTrades, currentHs, currentItem]);

  // 내 무역 현황 집계 — 건수·상태·통화별 금액·주요 품목·주요 도착지·월별 추이
  const myStats = useMemo(() => {
    if (!myTrades || myTrades.length === 0) return null;
    const submitted = myTrades.filter((t) => t.status === 'submitted').length;
    const byCurrency = new Map<string, number>();
    const byItem = new Map<string, number>();
    const byDest = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const t of myTrades) {
      const amount = Number(t.profile?.totalAmount) || 0;
      if (amount > 0) {
        const cur = (t.profile?.currency || 'USD').toUpperCase();
        byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + amount);
      }
      const item = t.profile?.itemName?.trim();
      if (item) byItem.set(item, (byItem.get(item) ?? 0) + 1);
      const dest = t.profile?.dischargePort?.trim();
      if (dest) byDest.set(dest, (byDest.get(dest) ?? 0) + 1);
      const month = (t.createdAt || '').slice(0, 7);
      if (month) byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    return {
      total: myTrades.length,
      submitted,
      inProgress: myTrades.length - submitted,
      amounts: top(byCurrency, 2),
      topItems: top(byItem, 3),
      topDests: top(byDest, 3),
      months: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6),
    };
  }, [myTrades]);

  const loadTotal = useCallback(async () => {
    setTotalState({ status: 'loading', records: [], source: null, latestPeriod: null, error: null });
    try {
      const result = await getTotalTradeStats(range.start, range.end);
      setTotalState({
        status: result.records.length === 0 ? 'empty' : 'success',
        records: result.records,
        source: result.source,
        latestPeriod: result.latestPeriod,
        error: null,
      });
    } catch {
      setTotalState({
        status: 'error',
        records: [],
        source: null,
        latestPeriod: null,
        error: 'CUSTOMS_API_ERROR',
      });
    }
  }, [range]);

  const loadCountry = useCallback(async () => {
    setCountryState({ status: 'loading', records: [], source: null, latestPeriod: null, error: null });
    try {
      const result = await getCountryTradeStats(range.start, range.end);
      setCountryState({
        status: result.records.length === 0 ? 'empty' : 'success',
        records: result.records,
        source: result.source,
        latestPeriod: result.latestPeriod,
        error: null,
      });
    } catch {
      setCountryState({
        status: 'error',
        records: [],
        source: null,
        latestPeriod: null,
        error: 'CUSTOMS_API_ERROR',
      });
    }
  }, [range]);

  const loadItem = useCallback(async (query: string) => {
    setItemState({ status: 'loading', records: [], source: null, latestPeriod: null, error: null });
    try {
      const result = await getItemTradeStats(query, range.start, range.end);
      setItemState({
        status: result.records.length === 0 ? 'empty' : 'success',
        records: result.records,
        source: result.source,
        latestPeriod: result.latestPeriod,
        error: null,
      });
    } catch {
      setItemState({
        status: 'error',
        records: [],
        source: null,
        latestPeriod: null,
        error: 'CUSTOMS_API_ERROR',
      });
    }
  }, [range]);

  useEffect(() => {
    void loadTotal();
    void loadCountry();
  }, [loadCountry, loadTotal]);

  useEffect(() => {
    void loadItem(hsQuery);
  }, [hsQuery, loadItem]);

  const totalPoints: LinePoint[] = totalState.records.map((t) => ({ label: t.period, exp: t.exportAmount, imp: t.importAmount }));
  const latest = totalState.records.length > 0 ? totalState.records[totalState.records.length - 1] : null;

  const countryRows = useMemo(() => {
    const byCountry = new Map<string, { name: string; exp: number; imp: number }>();
    for (const c of countryState.records) {
      const cur = byCountry.get(c.countryCode) ?? { name: c.countryName || c.countryCode, exp: 0, imp: 0 };
      cur.exp += c.exportAmount;
      cur.imp += c.importAmount;
      byCountry.set(c.countryCode, cur);
    }
    return [...byCountry.values()].sort((a, b) => b.exp - a.exp).slice(0, 8);
  }, [countryState.records]);

  const itemPoints: LinePoint[] = itemState.records.map((t) => ({ label: t.period, exp: t.exportAmount, imp: t.importAmount }));

  const rangeLabel = `${range.start.slice(0, 4)}.${range.start.slice(4)} ~ ${range.end.slice(0, 4)}.${range.end.slice(4)}`;
  const loadingItem = itemState.status === 'loading';
  const submitItem = () => {
    const cleaned = hsInput.replace(/[^0-9]/g, '');
    if (cleaned === hsQuery) void loadItem(cleaned);
    else setHsQuery(cleaned);
  };

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={26} /> 데이터 분석
        </h1>
        <p className="page-subtitle">관세청 수출입 무역통계 · 조회 기간 {rangeLabel} (통계는 약 1개월 지연 공표)</p>
      </div>

      {/* 내 무역 현황 — 저장된 내 거래 데이터를 집계한 개인화 섹션 */}
      {myStats && (
        <ChartCard
          title="내 무역 현황"
          badge={<span className="da-my-badge">내 거래 데이터</span>}
          right={<span style={{ fontSize: 12, color: '#64748b' }}>저장된 거래 {myStats.total}건 기준</span>}
        >
          <div className="da-my-tiles">
            <div className="da-my-tile">
              <span className="da-my-tile-lab">전체 거래</span>
              <span className="da-my-tile-val">{myStats.total}건</span>
            </div>
            <div className="da-my-tile">
              <span className="da-my-tile-lab">제출 완료</span>
              <span className="da-my-tile-val">{myStats.submitted}건</span>
            </div>
            <div className="da-my-tile">
              <span className="da-my-tile-lab">진행 중</span>
              <span className="da-my-tile-val">{myStats.inProgress}건</span>
            </div>
            <div className="da-my-tile">
              <span className="da-my-tile-lab">누적 거래금액</span>
              <span className="da-my-tile-val da-my-tile-amount">
                {myStats.amounts.length > 0
                  ? myStats.amounts.map(([cur, sum]) => `${cur} ${Math.round(sum).toLocaleString()}`).join(' · ')
                  : '—'}
              </span>
            </div>
          </div>

          <div className="da-my-cols">
            {myStats.topItems.length > 0 && (
              <div className="da-my-col">
                <span className="da-my-col-title">주요 품목</span>
                {myStats.topItems.map(([name, count]) => (
                  <div className="da-my-row" key={name}>
                    <span className="da-my-row-name">{name}</span>
                    <span className="da-my-row-bar">
                      <span style={{ width: `${(count / myStats.topItems[0][1]) * 100}%` }} />
                    </span>
                    <span className="da-my-row-count">{count}건</span>
                  </div>
                ))}
              </div>
            )}
            {myStats.topDests.length > 0 && (
              <div className="da-my-col">
                <span className="da-my-col-title">주요 도착지</span>
                {myStats.topDests.map(([name, count]) => (
                  <div className="da-my-row" key={name}>
                    <span className="da-my-row-name">{name}</span>
                    <span className="da-my-row-bar">
                      <span style={{ width: `${(count / myStats.topDests[0][1]) * 100}%` }} />
                    </span>
                    <span className="da-my-row-count">{count}건</span>
                  </div>
                ))}
              </div>
            )}
            {myStats.months.length > 1 && (
              <div className="da-my-col">
                <span className="da-my-col-title">월별 거래</span>
                <div className="da-my-months">
                  {myStats.months.map(([month, count]) => {
                    const max = Math.max(...myStats.months.map(([, c]) => c));
                    return (
                      <div className="da-my-month" key={month} title={`${month} · ${count}건`}>
                        <span className="da-my-month-bar" style={{ height: `${Math.max(12, (count / max) * 100)}%` }} />
                        <span className="da-my-month-lab">{Number(month.slice(5))}월</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ChartCard>
      )}

      {/* 최근월 요약 타일 */}
      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: `${formatPeriod(latest.period)} 수출`, value: latest.exportAmount, color: COLOR_EXPORT },
            { label: `${formatPeriod(latest.period)} 수입`, value: latest.importAmount, color: COLOR_IMPORT },
            { label: `${formatPeriod(latest.period)} 무역수지`, value: latest.balance, color: latest.balance >= 0 ? '#006300' : '#d03b3b' },
          ].map((t) => (
            <div key={t.label} className="form-card" style={{ padding: '18px 22px' }}>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: t.color }}>{fmtUsd(t.value)}</div>
            </div>
          ))}
        </div>
      )}

      <ChartCard
        title="월별 수출입 총괄"
        badge={totalState.source ? <SourceBadge source={totalState.source} /> : undefined}
        right={<><LatestPeriod period={totalState.latestPeriod} /><Legend /></>}
      >
        {totalState.status === 'idle' || totalState.status === 'loading' ? <LoadingState />
          : totalState.status === 'error' ? <ErrorState onRetry={() => void loadTotal()} />
          : totalState.status === 'empty' ? <EmptyState />
          : (
          <>
            <DualLineChart points={totalPoints} />
            <DataTable
              head={['기간', '수출', '수입', '무역수지']}
              rows={totalState.records.map((t) => [formatPeriod(t.period), t.exportAmount, t.importAmount, t.balance])}
            />
          </>
        )}
      </ChartCard>

      <ChartCard
        title="국가별 수출입 (수출액 상위)"
        badge={countryState.source ? <SourceBadge source={countryState.source} /> : undefined}
        right={<><LatestPeriod period={countryState.latestPeriod} /><Legend /></>}
      >
        {countryState.status === 'idle' || countryState.status === 'loading' ? <LoadingState />
          : countryState.status === 'error' ? <ErrorState onRetry={() => void loadCountry()} />
          : countryState.status === 'empty' ? <EmptyState />
          : (
          <>
            <CountryBars rows={countryRows} />
            <DataTable
              head={['국가', '수출', '수입']}
              rows={countryRows.map((r) => [r.name, r.exp, r.imp])}
            />
          </>
        )}
      </ChartCard>

      <ChartCard
        title="품목별 수출입 트렌드 (HS코드)"
        badge={itemState.source ? <SourceBadge source={itemState.source} /> : undefined}
        right={<><LatestPeriod period={itemState.latestPeriod} /><Legend /></>}
      >
        {myItems.length > 0 && (
          <div className="da-mine">
            <span className="da-mine-lab">내 거래 품목</span>
            <div className="da-chips">
              {myItems.map((it) => (
                <button
                  key={it.hsCode}
                  type="button"
                  className={`da-chip${hsQuery === it.hsCode ? ' active' : ''}`}
                  onClick={() => { setHsInput(it.hsCode); setHsQuery(it.hsCode); }}
                >
                  {it.label} <span className="da-chip-code">{it.hsCode}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ maxWidth: 240 }}
            value={hsInput}
            placeholder="HS코드 (6~10자리)"
            onChange={(e) => setHsInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitItem()}
          />
          <button
            className="btn-primary"
            onClick={submitItem}
            disabled={loadingItem || hsInput.trim().replace(/[^0-9]/g, '').length < 6}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {loadingItem ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} 조회
          </button>
        </div>
        {itemState.status === 'idle' || itemState.status === 'loading' ? <LoadingState />
          : itemState.status === 'error' ? <ErrorState onRetry={() => void loadItem(hsQuery)} />
          : itemState.status === 'empty' ? <EmptyState />
          : (
          <>
            <DualLineChart points={itemPoints} />
            <DataTable
              head={['기간', '수출', '수입', '무역수지']}
              rows={itemState.records.map((t) => [formatPeriod(t.period), t.exportAmount, t.importAmount, t.balance])}
            />
          </>
        )}
      </ChartCard>
    </div>
  );
}
