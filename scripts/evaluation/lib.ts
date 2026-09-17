/**
 * 평가 스크립트 공용 유틸 — CSV 파싱, 비율 계산, 파일 입출력, 인자 해석.
 * 새 라이브러리 없이 Node 기본 모듈만 쓴다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PortEntry } from '../../src/services/portLocodeService';
import { portKey } from '../../src/services/portLocodeService';

// ── CSV ───────────────────────────────────────────────────────────────

/** RFC 4180 수준의 CSV 파서 — 따옴표 안 쉼표·줄바꿈, "" 이스케이프, BOM, CRLF 지원. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  if (rows.length === 0) return [];
  const [header, ...body] = rows;
  const keys = header.map((key) => key.trim());
  return body.map((cells) => Object.fromEntries(keys.map((key, index) => [key, (cells[index] ?? '').trim()])));
}

export function requireColumns(rows: Array<Record<string, string>>, columns: string[], label: string): void {
  if (rows.length === 0) return;
  const missing = columns.filter((column) => !(column in rows[0]));
  if (missing.length) throw new Error(`${label}: 필수 열이 없습니다 — ${missing.join(', ')}`);
}

export function toCsv(rows: Array<Record<string, string | number | null>>, columns: string[]): string {
  const escape = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column] ?? '')).join(','))].join('\n') + '\n';
}

export function parseBoolean(value: string | undefined, fallback = true): boolean {
  const text = (value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(text)) return true;
  if (['false', '0', 'no', 'n'].includes(text)) return false;
  return fallback;
}

// ── 지표 ──────────────────────────────────────────────────────────────

export interface Ratio {
  numerator: number;
  denominator: number;
  /** 분모가 0이면 null (NaN을 만들지 않는다) */
  value: number | null;
}

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator > 0 ? numerator / denominator : null };
}

/** F1 — precision/recall 중 하나라도 없거나 둘 다 0이면 null. */
export function f1Score(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return null;
  return (2 * precision * recall) / (precision + recall);
}

/** 보고용 표기 — null·NaN은 N/A. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatRatio(r: Ratio | null | undefined): string {
  if (!r) return 'N/A';
  return `${formatPercent(r.value)} (${r.numerator}/${r.denominator})`;
}

// ── 파일 ──────────────────────────────────────────────────────────────

export function readText(path: string): string {
  return readFileSync(path, 'utf8');
}

export function readCsvFile(path: string): Array<Record<string, string>> {
  return parseCsv(readText(path));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readText(path)) as T;
}

export function writeText(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

export function writeJson(path: string, value: unknown): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** public/data/unlocodePorts.json → PortEntry[] */
export function loadPortEntries(path: string): PortEntry[] {
  const raw = readJson<Array<[string, string]>>(path);
  return raw.map(([locode, name]) => ({ locode, country: locode.slice(0, 2), name, key: portKey(name) }));
}

/** public/data/hsCodes.json → 공식 10자리 HSK 집합 */
export function loadOfficialHskSet(path: string): Set<string> {
  const raw = readJson<Array<[string, ...unknown[]]>>(path);
  return new Set(raw.map(([code]) => String(code)).filter((code) => /^\d{10}$/.test(code)));
}

// ── CLI 인자 ──────────────────────────────────────────────────────────

/** --key value / --flag 형태. 나머지는 positional. */
export function parseArgs(argv: string[]): { options: Record<string, string | true>; positional: string[] } {
  const options: Record<string, string | true> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { options[key] = next; i += 1; } else options[key] = true;
    } else positional.push(arg);
  }
  return { options, positional };
}

export function requireOption(options: Record<string, string | true>, key: string, usage: string): string {
  const value = options[key];
  if (typeof value !== 'string' || !value) {
    console.error(`--${key} 가 필요합니다.\n사용법: ${usage}`);
    process.exit(2);
  }
  return value;
}

/** 스크립트를 직접 실행했을 때만 main을 돌린다(테스트에서 import할 때는 실행 안 함). */
export function isDirectRun(metaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  return normalize(fileURLToPath(metaUrl)) === normalize(resolve(entry));
}

/** 요약 JSON 공통 머리 */
export interface ScoreSummaryBase {
  scorer: string;
  runId: string;
  normalizationVersion?: string;
  generatedAt: string;
}
