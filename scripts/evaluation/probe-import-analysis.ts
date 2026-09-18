/**
 * CLI에서 수입 문서 분석 Edge Function을 "합성 문서 1개로 1회" 호출할 수 있는지 확인한다 (npm run eval:probe).
 *
 * - 평가를 실행하지 않는다. 응답 JSON을 evaluation/results/raw/(커밋 금지 경로)에 저장만 한다.
 * - 환경변수는 저장소 루트의 .env.evaluation.local 에서만 읽는다(커밋 금지, .gitignore 등록).
 * - 필요한 값이 없으면 안내를 출력하고 종료 코드 0으로 끝난다.
 * - 실제 문서 금지: EVAL_PROBE_FILE 은 evaluation/fixtures/synthetic/ 아래 파일만 허용한다.
 *   지정하지 않으면 메모리에서 가상 값만 담은 1페이지 PDF를 만들어 보낸다.
 * - 서비스 역할 키를 쓰지 않는다. 기존 테스트 계정으로 로그인한 세션 토큰만 쓴다(계정 자동 생성 없음).
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isDirectRun, writeJson } from './lib';

export const REQUIRED_ENV = ['EVAL_SUPABASE_URL', 'EVAL_SUPABASE_PUBLISHABLE_KEY', 'EVAL_TEST_EMAIL', 'EVAL_TEST_PASSWORD', 'EVAL_PROBE_CONFIRM'] as const;
export const CONFIRM_VALUE = 'single-synthetic-call';
const ENV_FILE = '.env.evaluation.local';
const SYNTHETIC_DIR = resolve('evaluation/fixtures/synthetic');

/** KEY=VALUE 형식만 읽는다(따옴표 제거). */
export function parseEnvFile(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    env[key] = value;
  }
  return env;
}

export function missingEnv(env: Record<string, string>): string[] {
  const missing: string[] = REQUIRED_ENV.filter((key) => !env[key]);
  if (env.EVAL_PROBE_CONFIRM && env.EVAL_PROBE_CONFIRM !== CONFIRM_VALUE) missing.push(`EVAL_PROBE_CONFIRM(=${CONFIRM_VALUE})`);
  return missing;
}

/** 가상 텍스트만 담은 최소 1페이지 PDF (외부 라이브러리 없음). */
export function buildSyntheticPdf(lines: string[]): Buffer {
  const escape = (text: string) => text.replace(/[\\()]/g, (ch) => `\\${ch}`);
  const content = ['BT', '/F1 11 Tf', '14 TL', '50 780 Td', ...lines.map((line) => `(${escape(line)}) Tj T*`), 'ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

export const SYNTHETIC_PROBE_LINES = [
  'COMMERCIAL INVOICE (SYNTHETIC SAMPLE - NOT A REAL DOCUMENT)',
  'Seller: EXAMPLE TRADING CO., LTD.  1 Example-ro, Example City',
  'Buyer: SAMPLE IMPORTS CORPORATION  99 Sample Street',
  'Invoice No.: EX-INV-PROBE-0001   Date: 2026-09-30',
  'Port of Loading: BUSAN, KOREA   Port of Discharge: LOS ANGELES, USA',
  'Terms: FOB BUSAN   Currency: USD',
  'Description: EXAMPLE COTTON SHIRT   Qty: 1,500 PCS   Unit Price: 9.60   Amount: 14,400.00',
  'Country of Origin: KOREA   Gross Weight: 550 KG   Packages: 30 CTNS',
];

async function main(): Promise<void> {
  const envPath = resolve(ENV_FILE);
  const env = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
  const missing = missingEnv(env);
  if (missing.length) {
    console.log([
      '[eval:probe] 호출하지 않고 종료합니다.',
      existsSync(envPath) ? `  ${ENV_FILE} 에 다음 값이 없습니다: ${missing.join(', ')}` : `  ${ENV_FILE} 파일이 없습니다.`,
      '  필요한 값 (자세한 내용: evaluation/CLI_FEASIBILITY.md)',
      '    EVAL_SUPABASE_URL=https://<project>.supabase.co',
      '    EVAL_SUPABASE_PUBLISHABLE_KEY=<공개 키 — 서비스 역할 키 금지>',
      '    EVAL_TEST_EMAIL=<평가 전용 기존 테스트 계정>',
      '    EVAL_TEST_PASSWORD=<비밀번호>',
      `    EVAL_PROBE_CONFIRM=${CONFIRM_VALUE}   # 1회 호출에 동의한다는 표시`,
      '    EVAL_PROBE_FILE=evaluation/fixtures/synthetic/<파일>   # 선택. 없으면 가상 PDF를 만들어 보냄',
    ].join('\n'));
    return;
  }

  let fileName = 'synthetic_probe.pdf';
  let bytes: Buffer;
  let mimeType = 'application/pdf';
  if (env.EVAL_PROBE_FILE) {
    const target = resolve(env.EVAL_PROBE_FILE);
    const rel = relative(SYNTHETIC_DIR, target);
    if (rel.startsWith('..') || resolve(SYNTHETIC_DIR, rel) !== target || !existsSync(target)) {
      console.error('[eval:probe] EVAL_PROBE_FILE 은 evaluation/fixtures/synthetic/ 아래의 존재하는 합성 파일만 허용합니다. 호출하지 않고 종료합니다.');
      process.exitCode = 2;
      return;
    }
    bytes = readFileSync(target);
    fileName = target.split(/[\\/]/).pop() ?? fileName;
    const lower = fileName.toLowerCase();
    mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.jpg') || lower.endsWith('.jpeg') ? 'image/jpeg' : 'application/pdf';
  } else {
    bytes = buildSyntheticPdf(SYNTHETIC_PROBE_LINES);
  }

  const supabase = createClient(env.EVAL_SUPABASE_URL, env.EVAL_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: env.EVAL_TEST_EMAIL, password: env.EVAL_TEST_PASSWORD });
  if (authError || !auth.session) {
    console.error(`[eval:probe] 테스트 계정 로그인 실패 — 호출하지 않습니다: ${authError?.message ?? '세션 없음'}`);
    process.exitCode = 1;
    return;
  }

  const startedAt = Date.now();
  // 분류 힌트 편향을 피하려고 documentType 은 unknown 으로 보낸다(BASELINE_NOTES §1).
  const body = { documents: [{ id: 'probe-synthetic-1', fileName, mimeType, documentType: 'unknown', dataUrl: `data:${mimeType};base64,${bytes.toString('base64')}` }] };
  let status = 0;
  let payload: unknown = null;
  try {
    const response = await fetch(`${env.EVAL_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/import-document-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}`, apikey: env.EVAL_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify(body),
    });
    status = response.status;
    const text = await response.text();
    try { payload = JSON.parse(text); } catch { payload = { rawText: text.slice(0, 2000) }; }
  } finally {
    await supabase.auth.signOut();
  }

  const out = `evaluation/results/raw/probe-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeJson(out, { probedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt, httpStatus: status, synthetic: true, fileName, response: payload });
  const result = payload as { success?: boolean; model?: string; classifications?: unknown[]; error?: string } | null;
  console.log([
    `[eval:probe] HTTP ${status} · success=${String(result?.success)} · model=${result?.model ?? '(없음)'} · classifications=${Array.isArray(result?.classifications) ? result!.classifications!.length : 0}`,
    result?.error ? `  오류: ${result.error}` : '',
    `  응답 저장(커밋 금지 경로): ${out}`,
  ].filter(Boolean).join('\n'));
}

if (isDirectRun(import.meta.url)) {
  main().catch((error) => {
    console.error(`[eval:probe] 예외로 종료: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
