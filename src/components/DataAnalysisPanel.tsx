/**
 * 데이터 분석 페이지 — 관세청 무역통계 시각화
 *
 * 구성: 내 무역 대시보드(저장된 거래 집계 + 내 시장 리포트) → 내 품목 시장 트렌드(관세청).
 * 국가별 관세청 통계는 화면에 그리지 않고 '내 시장 리포트' 조인 계산에만 쓴다.
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
  getCountryTradeStats,
  getItemTradeStats,
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

// 항구 문자열 → 국가 코드/한글명. 'ROTTERDAM, NETHERLANDS' 형식과 구버전 'Rotterdam Port' 형식 모두 지원.
const COUNTRY_BY_NAME: Record<string, { code: string; ko: string }> = {
  KOREA: { code: 'KR', ko: '한국' },
  JAPAN: { code: 'JP', ko: '일본' },
  CHINA: { code: 'CN', ko: '중국' },
  USA: { code: 'US', ko: '미국' },
  VIETNAM: { code: 'VN', ko: '베트남' },
  GERMANY: { code: 'DE', ko: '독일' },
  NETHERLANDS: { code: 'NL', ko: '네덜란드' },
  SINGAPORE: { code: 'SG', ko: '싱가포르' },
};
const LEGACY_PORT_COUNTRY: Record<string, string> = {
  'Los Angeles Port': 'USA',
  'Long Beach Port': 'USA',
  'New York Port': 'USA',
  'Rotterdam Port': 'NETHERLANDS',
  'Hamburg Port': 'GERMANY',
  'Shanghai Port': 'CHINA',
  'Qingdao Port': 'CHINA',
  'Singapore Port': 'SINGAPORE',
  'Tokyo Port': 'JAPAN',
  'Osaka Port': 'JAPAN',
  'Busan Port': 'KOREA',
  'Incheon Port': 'KOREA',
  'Gwangyang Port': 'KOREA',
  'Ulsan Port': 'KOREA',
  'Pyeongtaek Port': 'KOREA',
};
function portToCountry(port: string): { code: string; ko: string } | null {
  const p = (port || '').trim();
  if (!p) return null;
  const nameKey = p.includes(',')
    ? p.split(',').pop()!.trim().toUpperCase()
    : (LEGACY_PORT_COUNTRY[p] ?? '');
  return COUNTRY_BY_NAME[nameKey] ?? null;
}

interface DataAnalysisPanelProps {
  /** 통관 작업실에서 작성 중인 품목 — 있으면 품목 트렌드 초기값으로 사용 */
  currentItem?: { hsCode: string; itemName: string };
}

const cleanHsCode = (v: string) => (v || '').replace(/[^0-9]/g, '');
const isValidHsCode = (v: string) => /^\d{6,10}$/.test(v);

export default function DataAnalysisPanel({ currentItem }: DataAnalysisPanelProps = {}) {
  const range = useMemo(() => recentRange(6), []);
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

  // 내 무역 현황 집계 — 품목별 그룹·통화별 금액·도착 국가·월별 추이
  const myStats = useMemo(() => {
    if (!myTrades || myTrades.length === 0) return null;
    const submitted = myTrades.filter((t) => t.status === 'submitted').length;
    const byCurrency = new Map<string, number>();
    const byMonth = new Map<string, number>();
    type ItemAgg = { name: string; hsCode: string; count: number; amounts: Map<string, number>; dests: Set<string> };
    const itemMap = new Map<string, ItemAgg>();
    const countryMap = new Map<string, { ko: string; ports: Set<string>; count: number }>();
    const monthAmounts = new Map<string, Map<string, number>>();
    for (const t of myTrades) {
      const amount = Number(t.profile?.totalAmount) || 0;
      const cur = (t.profile?.currency || 'USD').toUpperCase();
      if (amount > 0) byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + amount);

      const name = t.profile?.itemName?.trim() || '(품목명 없음)';
      const code = cleanHsCode(t.profile?.hsCode ?? '');
      const key = `${name}::${code}`;
      const agg = itemMap.get(key) ?? { name, hsCode: code, count: 0, amounts: new Map<string, number>(), dests: new Set<string>() };
      agg.count += 1;
      if (amount > 0) agg.amounts.set(cur, (agg.amounts.get(cur) ?? 0) + amount);
      const dest = t.profile?.dischargePort?.trim();
      if (dest) {
        agg.dests.add(dest);
        const country = portToCountry(dest);
        if (country && country.code !== 'KR') {
          const c = countryMap.get(country.code) ?? { ko: country.ko, ports: new Set<string>(), count: 0 };
          c.ports.add(dest);
          c.count += 1;
          countryMap.set(country.code, c);
        }
      }
      itemMap.set(key, agg);

      const month = (t.createdAt || '').slice(0, 7);
      if (month) {
        byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
        if (amount > 0) {
          const m = monthAmounts.get(month) ?? new Map<string, number>();
          m.set(cur, (m.get(cur) ?? 0) + amount);
          monthAmounts.set(month, m);
        }
      }
    }
    // 월별 금액 차트는 누적액이 가장 큰 통화 기준으로 그린다 (혼합 통화 왜곡 방지)
    const domCurrency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'USD';
    return {
      total: myTrades.length,
      submitted,
      inProgress: myTrades.length - submitted,
      amounts: [...byCurrency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2),
      items: [...itemMap.values()].sort((a, b) => b.count - a.count),
      destCountries: [...countryMap.entries()].map(([code, v]) => ({ code, ...v })),
      months: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
        .map(([month, count]) => ({
          month,
          count,
          amount: monthAmounts.get(month)?.get(domCurrency) ?? 0,
        })),
      domCurrency,
    };
  }, [myTrades]);

  // 내 시장 리포트 — 내 도착 국가를 이미 로드된 관세청 국가별 통계와 조인
  const marketReport = useMemo(() => {
    if (!myStats || myStats.destCountries.length === 0 || countryState.status !== 'success') return [];
    const periods = [...new Set(countryState.records.map((r) => r.period))].sort();
    if (periods.length === 0) return [];
    const firstPeriod = periods[0];
    const lastPeriod = periods[periods.length - 1];
    const agg = new Map<string, { name: string; total: number; first: number; last: number }>();
    for (const r of countryState.records) {
      const cur = agg.get(r.countryCode) ?? { name: r.countryName || r.countryCode, total: 0, first: 0, last: 0 };
      cur.total += r.exportAmount;
      if (r.period === firstPeriod) cur.first += r.exportAmount;
      if (r.period === lastPeriod) cur.last += r.exportAmount;
      agg.set(r.countryCode, cur);
    }
    const rankOf = new Map([...agg.entries()].sort((a, b) => b[1].total - a[1].total).map(([code], i) => [code, i + 1]));
    return myStats.destCountries.flatMap((dc) => {
      const stat = agg.get(dc.code);
      if (!stat) return [];
      const trendPct = stat.first > 0 ? Math.round(((stat.last - stat.first) / stat.first) * 100) : null;
      return [{
        code: dc.code,
        ko: dc.ko,
        ports: [...dc.ports],
        tradeCount: dc.count,
        rank: rankOf.get(dc.code) ?? null,
        rankTotal: agg.size,
        lastExport: stat.last,
        trendPct,
      }];
    });
  }, [myStats, countryState]);

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
    void loadCountry();
  }, [loadCountry]);

  useEffect(() => {
    void loadItem(hsQuery);
  }, [hsQuery, loadItem]);

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

      {/* 내 무역 대시보드 — 내 서류(저장된 거래)에서 나온 데이터가 페이지의 주인공 */}
      {myTrades !== null && myTrades.length === 0 && (
        <div className="da-empty-my">
          <div className="da-empty-my-title">아직 내 무역 데이터가 없어요</div>
          <p>통관 작업실에서 거래를 만들면 품목·거래액·시장 리포트가 여기에 자동으로 쌓입니다.</p>
        </div>
      )}
      {myStats && (
        <ChartCard
          title="내 무역 대시보드"
          badge={<span className="da-my-badge">내 거래 데이터</span>}
          right={<span style={{ fontSize: 12, color: '#64748b' }}>저장된 거래 {myStats.total}건 기준</span>}
        >
          {/* 핵심 지표 — 큼지막하게 */}
          <div className="da-my-tiles da-my-tiles-big">
            <div className="da-my-tile"><span className="da-my-tile-lab">전체 거래</span><span className="da-my-tile-val">{myStats.total}건</span></div>
            <div className="da-my-tile"><span className="da-my-tile-lab">제출 완료</span><span className="da-my-tile-val">{myStats.submitted}건</span></div>
            <div className="da-my-tile"><span className="da-my-tile-lab">진행 중</span><span className="da-my-tile-val">{myStats.inProgress}건</span></div>
            <div className="da-my-tile"><span className="da-my-tile-lab">누적 거래금액</span><span className="da-my-tile-val da-my-tile-amount">{myStats.amounts.map(([cur, sum]) => `${cur} ${Math.round(sum).toLocaleString()}`).join(' · ') || '—'}</span></div>
          </div>

          {/* 내 시장 리포트 — 내 도착 국가 × 한국 전체 수출 실적 조인 */}
          {marketReport.length > 0 && (
            <div className="da-block da-block--divided">
              <span className="da-my-col-title">내 시장 리포트</span>
              <div className="da-markets">
                {marketReport.map((m) => {
                  // 같은 항구가 표기만 다르게 중복 저장된 경우("Long Beach Port"/"LONG BEACH PORT, USA") 정리
                  const seenPorts = new Set<string>();
                  const ports = m.ports.filter((p) => {
                    const key = p.toUpperCase().replace(/,.*$/, '').replace(/\s+PORT$/, '').trim();
                    if (seenPorts.has(key)) return false;
                    seenPorts.add(key);
                    return true;
                  });
                  return (
                    <div className="da-market" key={m.code}>
                      <div className="da-market-head">
                        <span className="da-market-route">{ports.join(' / ')} → <b>{m.ko}</b></span>
                        {m.rank && <span className="da-market-rank">수출 대상국 {m.rank}위</span>}
                      </div>
                      <div className="da-market-stats">
                        <div className="da-market-stat">
                          <span className="da-market-stat-lab">최근월 수출액</span>
                          <span className="da-market-stat-val">
                            {(m.lastExport / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            <small> 억 달러</small>
                          </span>
                        </div>
                        {m.trendPct !== null && (
                          <div className="da-market-stat">
                            <span className="da-market-stat-lab">최근 6개월</span>
                            <span className={`da-market-stat-val da-market-trend ${m.trendPct >= 0 ? 'up' : 'down'}`}>
                              {m.trendPct >= 0 ? '+' : ''}{m.trendPct}% {m.trendPct >= 0 ? '↗' : '↘'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </ChartCard>
      )}

      <ChartCard
        title="내 품목 시장 트렌드 (관세청)"
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
