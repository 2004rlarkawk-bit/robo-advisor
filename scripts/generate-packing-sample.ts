/**
 * 패킹리스트 샘플/데모 xlsx 생성기 (영구 스크립트).
 *
 * 핵심 규칙: **문서 생성 전에 반드시 실제 에이전트 파이프라인(ComplianceAgent 포함) 검증을 거친다.**
 * 검증에서 error(차단 이슈)가 하나라도 나오면 문서를 만들지 않고 중단한다.
 * 검증 실패 상태의 샘플을 일부러 만들려면 `--skip-validation` 플래그를 명시적으로 줘야 한다.
 *
 * (과거 임시 스크립트 gen.mjs가 검증을 건너뛰고 T/T+L/C 같은 모순 문서를 찍어내
 *  실제 버그로 오인하게 만든 사고를 재발 방지하기 위함.)
 *
 * 사용:
 *   npm run sample:packing                         # 검증 통과 샘플(valid)
 *   npm run sample:packing -- --case tt-lc-conflict --skip-validation   # 의도된 실패 샘플
 *   npm run sample:packing -- --out /path/out.xlsx
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OrchestratorAgent } from '../src/agents/OrchestratorAgent';
import { mapPackingListToSchema, exportPackingListWithTemplate } from '../src/services/packingListXlsxCore';
import { createPerfectTestProfile } from '../src/services/devTestDataService';
import type { TradeProfile, ValidationIssue } from '../src/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(ROOT, 'templates/packing_list_template.xlsx');
// 결정적 산출을 위한 고정 기준일(스크립트는 Date.now에 의존하지 않게).
const FIXED_DATE = new Date('2026-07-28T00:00:00Z');

// 프리셋 케이스 — createPerfectTestProfile(검증 통과 기본값) 위에 덧씌운다.
const CASES: Record<string, Partial<TradeProfile>> = {
  // 검증 통과(차단 error 없음). 그대로 문서 생성.
  valid: {},
  // R11 위반: 비신용장(T/T)인데 L/C 정보 존재 → error. --skip-validation 없으면 차단된다.
  'tt-lc-conflict': { paymentTerms: 'T/T', lcNo: 'LC-88-2026', lcBank: 'KEB HANA BANK' },
};

interface Args { skipValidation: boolean; caseName: string; out?: string; }

function parseArgs(argv: string[]): Args {
  const a: Args = { skipValidation: false, caseName: 'valid' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--skip-validation') a.skipValidation = true;
    else if (arg === '--case') a.caseName = argv[++i] ?? a.caseName;
    else if (arg === '--out') a.out = argv[++i];
    else { console.error(`알 수 없는 인자: ${arg}`); process.exit(2); }
  }
  if (!CASES[a.caseName]) {
    console.error(`알 수 없는 --case "${a.caseName}". 가능: ${Object.keys(CASES).join(', ')}`);
    process.exit(2);
  }
  return a;
}

function fmt(issues: ValidationIssue[]): string {
  return issues.map(i => `  · [${i.severity}] ${i.id}: ${i.message}`).join('\n');
}

async function main() {
  const { skipValidation, caseName, out } = parseArgs(process.argv.slice(2));
  const profile = createPerfectTestProfile(CASES[caseName] as TradeProfile, FIXED_DATE);

  console.log(`▶ 케이스="${caseName}"  검증=${skipValidation ? 'SKIP(명시적)' : '필수'}`);

  // 실제 파이프라인으로 문서 생성 + 검증(ComplianceAgent 포함)을 그대로 실행한다.
  const result = await new OrchestratorAgent().run({ profile, useLLM: false });
  if (result.error) {
    console.error(`✖ 파이프라인 오류: ${result.error.message}`);
    process.exit(1);
  }
  const issues: ValidationIssue[] = result.issues?.issues ?? [];
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  if (warnings.length) console.log(`  경고 ${warnings.length}건(차단 아님):\n${fmt(warnings)}`);

  // 게이트: 차단 error가 있으면 --skip-validation 없이는 생성 불가.
  if (errors.length > 0) {
    if (!skipValidation) {
      console.error(`\n✖ 검증 실패 — 차단 오류 ${errors.length}건. 문서 생성 중단.\n${fmt(errors)}`);
      console.error(`\n의도된 실패 샘플이면 --skip-validation 을 명시적으로 주세요.`);
      process.exit(1);
    }
    console.warn(`\n⚠ --skip-validation: 차단 오류 ${errors.length}건을 무시하고 생성합니다(의도된 실패 샘플).\n${fmt(errors)}`);
  }

  const packingList = result.documents?.generatedDocs?.packingList;
  if (!packingList) {
    console.error('✖ 패킹리스트 데이터가 생성되지 않았습니다(필요 서류에 포함되지 않음).');
    process.exit(1);
  }

  const buf = await fs.readFile(TEMPLATE);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const blob = await exportPackingListWithTemplate(mapPackingListToSchema(packingList), ab);
  const outPath = out ?? path.join(ROOT, `packing_sample_${caseName}.xlsx`);
  await fs.writeFile(outPath, Buffer.from(await blob.arrayBuffer()));

  console.log(`✔ 생성 완료: ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
