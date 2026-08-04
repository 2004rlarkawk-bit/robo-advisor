/**
 * 결과 화면 "이 품목 수출입 동향" 카드 —
 * 데이터 분석 탭을 별도 메뉴 대신 작업 흐름 안으로 이식한 것.
 * 거래에 입력된 HS CODE로 관세청 무역통계를 조회해
 * 최근 6개월 추이 미니 차트 + 요약 수치 + 자동 인사이트 한 줄을 보여준다.
 * 통계가 없거나 조회 실패 시엔 조용히 사라진다(작업 흐름을 방해하지 않음).
 */
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getItemTradeStats, type ItemTradeStat } from '../services/customsApiService';
import { recentRange } from './DataAnalysisPanel';

interface Props {
  hsCode: string;
  tradeType: 'export' | 'import';
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })}억$`;
  if (abs >= 1e4) return `${Math.round(v / 1e4).toLocaleString()}만$`;
  return `$${v.toLocaleString()}`;
}

function fmtMonth(period: string): string {
  return /^\d{6}$/.test(period) ? `${Number(period.slice(4))}월` : period;
}

export default function ItemTradeInsightCard({ hsCode, tradeType }: Props) {
  const cleaned = (hsCode || '').replace(/[^0-9]/g, '');
  const [records, setRecords] = useState<ItemTradeStat[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!/^\d{6,10}$/.test(cleaned)) return;
    let cancelled = false;
    setRecords(null);
    setFailed(false);
    const { start, end } = recentRange(6);
    getItemTradeStats(cleaned, start, end)
      .then((result) => { if (!cancelled) setRecords(result.records); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [cleaned]);

  const isExport = tradeType !== 'import';
  const amountOf = (r: ItemTradeStat) => (isExport ? r.exportAmount : r.importAmount);

  const view = useMemo(() => {
    if (!records || records.length === 0) return null;
    const sorted = [...records].sort((a, b) => a.period.localeCompare(b.period));
    const amounts = sorted.map(amountOf);
    const total = amounts.reduce((s, v) => s + v, 0);
    if (total <= 0) return { sorted, amounts, total, last: 0, delta: null as number | null };
    const last = amounts[amounts.length - 1];
    const prev = amounts.length > 1 ? amounts[amounts.length - 2] : 0;
    const delta = prev > 0 ? Math.round(((last - prev) / prev) * 100) : null;
    return { sorted, amounts, total, last, delta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, isExport]);

  // HS 미입력·형식 불량·조회 실패·데이터 없음 → 카드 자체를 숨긴다
  if (!/^\d{6,10}$/.test(cleaned) || failed) return null;
  if (records === null) return null; // 로딩 중에도 자리 차지하지 않음 (도착하면 나타남)
  if (!view) return null;

  const dirLabel = isExport ? '수출' : '수입';
  const { sorted, amounts, total, last, delta } = view;

  // 미니 라인차트 좌표 (300×64)
  const W = 300; const H = 64; const PAD = 6;
  const maxV = Math.max(1, ...amounts);
  const x = (i: number) => PAD + (amounts.length === 1 ? (W - PAD * 2) / 2 : (i / (amounts.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - (v / maxV) * (H - PAD * 2);
  const points = amounts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  // 자동 인사이트 한 줄
  const insight = total <= 0
    ? `최근 6개월 국내 ${dirLabel} 실적이 거의 없는 품목이에요 — 통계상 희소 품목이라 서류 정확성이 더 중요해요.`
    : delta === null
      ? `최근 6개월 누적 ${dirLabel}액은 ${fmtUsd(total)}이에요.`
      : delta >= 0
        ? `전월 대비 ${dirLabel}액이 ${delta}% 늘어난 상승 흐름의 품목이에요.`
        : `전월 대비 ${dirLabel}액이 ${Math.abs(delta)}% 줄어든 품목이에요.`;

  const DeltaIcon = delta === null ? Minus : delta >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="iti-card">
      <div className="iti-head">
        <span className="iti-title">이 품목 {dirLabel} 동향 <span className="iti-hs">HS {cleaned}</span></span>
        <span className="iti-src">관세청 무역통계</span>
      </div>

      <div className="iti-body">
        <div className="iti-stats">
          <div className="iti-stat">
            <span className="iti-stat-lab">최근월 {dirLabel}액</span>
            <span className="iti-stat-val">
              {fmtUsd(last)}
              {delta !== null && (
                <span className={`iti-delta ${delta >= 0 ? 'up' : 'down'}`}>
                  <DeltaIcon size={13} /> {Math.abs(delta)}%
                </span>
              )}
            </span>
          </div>
          <div className="iti-stat">
            <span className="iti-stat-lab">6개월 누적</span>
            <span className="iti-stat-val">{fmtUsd(total)}</span>
          </div>
        </div>

        {total > 0 && (
          <div className="iti-chart">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              <polyline points={points} fill="none" stroke="var(--primary-color)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={x(amounts.length - 1)} cy={y(amounts[amounts.length - 1])} r={3.5} fill="var(--primary-color)" />
            </svg>
            <div className="iti-chart-lab">
              <span>{fmtMonth(sorted[0].period)}</span>
              <span>{fmtMonth(sorted[sorted.length - 1].period)}</span>
            </div>
          </div>
        )}
      </div>

      <p className="iti-insight">{insight}</p>
      <p className="iti-note">관세청 공표 기준(약 1개월 지연) · 대한민국 전체 {dirLabel} 통계</p>
    </div>
  );
}
