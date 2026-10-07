const digits = (code) => String(code).replace(/\D/g, '');
const covers = (codes, gold, length) => codes.some((code) => digits(code).slice(0, length) === gold.slice(0, length));
const stage = (row, name) => row.traces.find((trace) => trace.stage === name)?.codes ?? [];

export function summarize(rows) {
  const n = rows.length;
  const count = (predicate) => rows.filter((row) => !row.error && predicate(row)).length;
  const percent = (value) => n ? Math.round(value / n * 10000) / 100 : 0;
  const times = rows.map((row) => row.ms / 1000).sort((a, b) => a - b);
  return {
    n,
    directions: rows[0]?.directions ?? null,
    directionCoverage6: percent(count((row) => stage(row, 'direction').some((prefix) => row.gold.startsWith(digits(prefix))))),
    expandedCoverage6: percent(count((row) => covers(stage(row, 'expanded'), row.gold, 6))),
    transmittedCoverage6: percent(count((row) => covers(stage(row, 'transmitted'), row.gold, 6))),
    decisionTop3_6: percent(count((row) => covers(stage(row, 'decision').slice(0, 3), row.gold, 6))),
    finalTop1_4: percent(count((row) => covers(row.pred.slice(0, 1), row.gold, 4))),
    finalTop1_6: percent(count((row) => covers(row.pred.slice(0, 1), row.gold, 6))),
    finalTop3_4: percent(count((row) => covers(row.pred.slice(0, 3), row.gold, 4))),
    finalTop3_6: percent(count((row) => covers(row.pred.slice(0, 3), row.gold, 6))),
    needsInfo: rows.filter((row) => row.needsInfo).length,
    errors: rows.filter((row) => row.error).length,
    medianSeconds: n ? Math.round((times[Math.floor((n - 1) / 2)] + times[Math.floor(n / 2)]) * 50) / 100 : 0,
  };
}
