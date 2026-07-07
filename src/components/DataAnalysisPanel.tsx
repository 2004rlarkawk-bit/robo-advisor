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
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2, Search } from 'lucide-react';
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

/** 직전 완료월 기준 최근 n개월 범위 (관세청 통계는 약 1개월 지연) */
function recentRange(n: number): { start: string; end: string } {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1); // 지난달 = 마지막 완료월
  const end = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  d.setMonth(d.getMonth() - (n - 1));
  const start = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return { start, end };
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}억$`;
  if (abs >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만$`;
  return `$${v.toLocaleString()}`;
}

function SourceBadge({ source }: { source: 'api' | 'simulation' }) {
  const api = source === 'api';
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
        background: api ? '#f0fdf4' : '#fffbeb',
        color: api ? '#15803d' : '#b45309',
        border: `1px solid ${api ? '#bbf7d0' : '#fde68a'}`,
      }}
    >
      {api ? '관세청 실데이터' : '시뮬레이션 — 설정에서 API 키 등록 시 실데이터'}
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
            {p.label.slice(5)}월
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
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{points[hover].label}</div>
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

export default function DataAnalysisPanel() {
  const range = useMemo(() => recentRange(6), []);

  const [total, setTotal] = useState<TotalTradeStat[] | null>(null);
  const [country, setCountry] = useState<CountryTradeStat[] | null>(null);
  const [item, setItem] = useState<ItemTradeStat[] | null>(null);
  const [hsInput, setHsInput] = useState('8517621010');
  const [hsQuery, setHsQuery] = useState('8517621010');
  const [loadingItem, setLoadingItem] = useState(false);

  useEffect(() => {
    getTotalTradeStats(range.start, range.end).then(setTotal).catch(() => setTotal([]));
    getCountryTradeStats(range.start, range.end).then(setCountry).catch(() => setCountry([]));
  }, [range]);

  useEffect(() => {
    setLoadingItem(true);
    getItemTradeStats(hsQuery, range.start, range.end)
      .then(setItem)
      .catch(() => setItem([]))
      .finally(() => setLoadingItem(false));
  }, [hsQuery, range]);

  const totalPoints: LinePoint[] = (total ?? []).map((t) => ({ label: t.period, exp: t.exportAmount, imp: t.importAmount }));
  const latest = total && total.length > 0 ? total[total.length - 1] : null;

  const countryRows = useMemo(() => {
    if (!country) return [];
    const byCountry = new Map<string, { name: string; exp: number; imp: number }>();
    for (const c of country) {
      const cur = byCountry.get(c.countryCode) ?? { name: c.countryName || c.countryCode, exp: 0, imp: 0 };
      cur.exp += c.exportAmount;
      cur.imp += c.importAmount;
      byCountry.set(c.countryCode, cur);
    }
    return [...byCountry.values()].sort((a, b) => b.exp - a.exp).slice(0, 8);
  }, [country]);

  const itemPoints: LinePoint[] = (item ?? []).map((t) => ({ label: t.period, exp: t.exportAmount, imp: t.importAmount }));

  const rangeLabel = `${range.start.slice(0, 4)}.${range.start.slice(4)} ~ ${range.end.slice(0, 4)}.${range.end.slice(4)}`;

  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <BarChart3 size={26} /> 데이터 분석
        </h1>
        <p className="page-subtitle">관세청 수출입 무역통계 · 조회 기간 {rangeLabel} (통계는 약 1개월 지연 공표)</p>
      </div>

      {/* 최근월 요약 타일 */}
      {latest && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { label: `${latest.period} 수출`, value: latest.exportAmount, color: COLOR_EXPORT },
            { label: `${latest.period} 수입`, value: latest.importAmount, color: COLOR_IMPORT },
            { label: `${latest.period} 무역수지`, value: latest.balance, color: latest.balance >= 0 ? '#006300' : '#d03b3b' },
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
        badge={total && total[0] ? <SourceBadge source={total[0].source} /> : undefined}
        right={<Legend />}
      >
        {total === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> 불러오는 중…
          </div>
        ) : (
          <>
            <DualLineChart points={totalPoints} />
            <DataTable
              head={['기간', '수출', '수입', '무역수지']}
              rows={(total ?? []).map((t) => [t.period, t.exportAmount, t.importAmount, t.balance])}
            />
          </>
        )}
      </ChartCard>

      <ChartCard
        title="국가별 수출입 (수출액 상위)"
        badge={country && country[0] ? <SourceBadge source={country[0].source} /> : undefined}
        right={<Legend />}
      >
        {country === null ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> 불러오는 중…
          </div>
        ) : (
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
        badge={item && item[0] ? <SourceBadge source={item[0].source} /> : undefined}
        right={<Legend />}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            className="form-input"
            style={{ maxWidth: 240 }}
            value={hsInput}
            placeholder="HS코드 (6~10자리)"
            onChange={(e) => setHsInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setHsQuery(hsInput.trim())}
          />
          <button
            className="btn-primary"
            onClick={() => setHsQuery(hsInput.trim())}
            disabled={loadingItem || hsInput.trim().replace(/[^0-9]/g, '').length < 6}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {loadingItem ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} 조회
          </button>
        </div>
        {item === null || loadingItem ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> 불러오는 중…
          </div>
        ) : itemPoints.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748b' }}>해당 HS코드의 실적 데이터가 없습니다.</p>
        ) : (
          <>
            <DualLineChart points={itemPoints} />
            <DataTable
              head={['기간', '수출', '수입', '무역수지']}
              rows={(item ?? []).map((t) => [t.period, t.exportAmount, t.importAmount, t.balance])}
            />
          </>
        )}
      </ChartCard>
    </div>
  );
}
