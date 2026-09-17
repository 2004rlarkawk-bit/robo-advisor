import { describe, expect, it } from 'vitest';
import { buildSyntheticPdf, CONFIRM_VALUE, missingEnv, parseEnvFile, SYNTHETIC_PROBE_LINES } from '../probe-import-analysis';

describe('eval:probe 안전장치', () => {
  it('환경 파일의 KEY=VALUE 를 읽고 주석·따옴표를 처리한다', () => {
    expect(parseEnvFile('# comment\nEVAL_TEST_EMAIL="a@example.com"\nBROKEN\n')).toEqual({ EVAL_TEST_EMAIL: 'a@example.com' });
  });

  it('필요한 값이 없으면 누락 목록을 돌려준다 (호출 전 종료 조건)', () => {
    expect(missingEnv({})).toEqual(expect.arrayContaining(['EVAL_SUPABASE_URL', 'EVAL_TEST_PASSWORD', 'EVAL_PROBE_CONFIRM']));
  });

  it('호출 동의 값이 정확하지 않으면 누락으로 본다', () => {
    const env = {
      EVAL_SUPABASE_URL: 'https://example.supabase.co', EVAL_SUPABASE_PUBLISHABLE_KEY: 'pk', EVAL_TEST_EMAIL: 'a@example.com',
      EVAL_TEST_PASSWORD: 'x', EVAL_PROBE_CONFIRM: 'yes',
    };
    expect(missingEnv(env)).toEqual([`EVAL_PROBE_CONFIRM(=${CONFIRM_VALUE})`]);
    expect(missingEnv({ ...env, EVAL_PROBE_CONFIRM: CONFIRM_VALUE })).toEqual([]);
  });

  it('가상 PDF 는 PDF 헤더·EOF 를 갖고 가상 값만 담는다', () => {
    const pdf = buildSyntheticPdf(SYNTHETIC_PROBE_LINES).toString('latin1');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('SYNTHETIC SAMPLE - NOT A REAL DOCUMENT');
  });
});
