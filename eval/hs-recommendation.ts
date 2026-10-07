import { supabase } from '../src/lib/supabase';
import { recommendShipperHSCode } from '../src/services/shipperHSCodeSuggestionService';
import type { HSCodeItemDetails, HSCodeRecommendationTrace } from '../src/types/hsCodeSuggestion';
import { summarize } from './score.mjs';

type Item = { id: number; name: string; details?: HSCodeItemDetails; gold: string };
type Row = Item & {
  directions: 3 | 5;
  traces: HSCodeRecommendationTrace[];
  pred: string[];
  needsInfo: boolean;
  requiredInfo: string[];
  ms: number;
  error?: string;
};
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = element('status');
const summaryBody = element('summary');
const rowBody = element('rows');
const run3 = element<HTMLButtonElement>('run3');
const run5 = element<HTMLButtonElement>('run5');
const stop = element<HTMLButtonElement>('stop');
const download = element<HTMLButtonElement>('download');
const load = element<HTMLButtonElement>('load');
let items: Item[] = [];
let results: Row[] = [];
let running = false;
let stopped = false;
let startedAt = '';
let datasetHash = '';
let authenticated = false;

function report() {
  return {
    schemaVersion: 1,
    startedAt,
    datasetHash,
    datasetSize: items.length,
    inputFields: ['name', 'details'],
    concurrency: 3,
    finalLimit: 3,
    candidateLimit: 60,
    source: 'recommendShipperHSCode: actual pipeline traces, not a separate discovery call',
    summaries: [3, 5].map((limit) => summarize(results.filter((row) => row.directions === limit))),
    results,
  };
}

function render() {
  summaryBody.replaceChildren();
  for (const limit of [3, 5]) {
    const rows = results.filter((row) => row.directions === limit);
    if (!rows.length) continue;
    const s = summarize(rows);
    const tr = document.createElement('tr');
    for (const value of [limit, s.n, s.directionCoverage6, s.expandedCoverage6, s.transmittedCoverage6,
      s.decisionTop3_6, s.finalTop3_4, s.finalTop3_6, s.needsInfo, s.errors, s.medianSeconds]) {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.append(td);
    }
    summaryBody.append(tr);
  }
  element('report').textContent = JSON.stringify(report(), null, 2);
  download.disabled = !results.length;
}

function appendRow(row: Row) {
  const tr = document.createElement('tr');
  const direction = row.traces.find((trace) => trace.stage === 'direction')?.codes ?? [];
  const sent = row.traces.find((trace) => trace.stage === 'transmitted')?.codes ?? [];
  for (const [index, value] of [row.directions, row.id, row.name, row.gold.slice(0, 6),
    direction.join(', '), sent.length, row.error ?? row.pred.map((code) => code.slice(0, 6)).join(', '),
    (row.ms / 1000).toFixed(1)].entries()) {
    const td = document.createElement('td');
    td.textContent = String(value);
    if (index === 2) td.className = 'item';
    tr.append(td);
  }
  if (row.error) tr.className = 'error';
  rowBody.append(tr);
}

async function run(directions: 3 | 5) {
  if (running || !items.length || !authenticated) return;
  running = true;
  stopped = false;
  startedAt ||= new Date().toISOString();
  run3.disabled = run5.disabled = load.disabled = true;
  stop.disabled = false;
  let next = 0;
  let completed = 0;
  const completedIds = new Set(results.filter((row) => row.directions === directions).map((row) => row.id));
  const pending = items.filter((item) => !completedIds.has(item.id));
  const worker = async () => {
    while (!stopped && next < pending.length) {
      const item = pending[next++];
      const begin = performance.now();
      const traces: HSCodeRecommendationTrace[] = [];
      const row: Row = { ...item, directions, traces, pred: [], needsInfo: false, requiredInfo: [], ms: 0 };
      try {
        // Gold stays in the report only; it is never an input to recommendation.
        const response = await recommendShipperHSCode(item.name, item.details, `eval-${directions}-${item.id}`, null, {
          discoveryPrefixLimit: directions,
          onTrace: (trace) => traces.push({ ...trace, codes: [...trace.codes] }),
        });
        row.pred = response.suggestions.map(({ code }) => code);
        row.needsInfo = response.additionalInformationRequired;
        row.requiredInfo = response.requiredAdditionalInfo;
      } catch (error) {
        row.error = error instanceof Error ? error.message : String(error);
      }
      row.ms = performance.now() - begin;
      results.push(row);
      appendRow(row);
      render();
      status.textContent = `${directions} directions: ${++completed}/${pending.length} completed`;
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  running = false;
  stop.disabled = true;
  load.disabled = false;
  run3.disabled = run5.disabled = !authenticated;
  status.textContent = `${directions} directions: ${completed}/${pending.length} completed${stopped ? ' (stopped)' : ' (done)'}`;
}

load.addEventListener('click', async () => {
  if (running) return;
  try {
    const url = new URL(element<HTMLInputElement>('dataset').value, location.href);
    if (url.origin !== location.origin) throw new Error('Dataset must be local to this origin');
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Dataset HTTP ${response.status}`);
    const json = await response.text();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed) || !parsed.length || parsed.some((item) =>
      typeof item.id !== 'number' || typeof item.name !== 'string' || !/^\d{6,10}$/.test(item.gold))) {
      throw new Error('Invalid dataset');
    }
    if (new Set(parsed.map((item) => item.id)).size !== parsed.length) throw new Error('Duplicate IDs');
    items = parsed;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json));
    datasetHash = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    results = [];
    startedAt = '';
    rowBody.replaceChildren();
    render();
    run3.disabled = run5.disabled = !authenticated;
    status.textContent = `${items.length} items loaded. Authenticated: ${authenticated}`;
  } catch (error) {
    status.textContent = String(error);
  }
});
run3.addEventListener('click', () => void run(3));
run5.addEventListener('click', () => void run(5));
stop.addEventListener('click', () => { stopped = true; stop.disabled = true; });
download.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `portai-hs-eval-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
try {
  const { data, error } = await supabase.auth.getUser();
  authenticated = !error && Boolean(data.user);
  status.textContent = authenticated ? 'Authenticated. Dataset not loaded.' : 'Login required on the local PortAI app.';
} catch (error) {
  status.textContent = String(error);
}
