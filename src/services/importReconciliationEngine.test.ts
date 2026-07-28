import { describe, it, expect } from 'vitest';
import {
  runImportReconciliation,
  summarizeReconciliation,
  buildReconciliationInput,
  reconcileFromAnalysis,
  evaluateReconciliationGate,
} from './importReconciliationEngine';
import { parseNumeric, jaccard, descTokens } from './importReconciliationRules';
import type {
  ImportAnalysisResult,
  ImportExtractedFields,
  ImportReconciliationInput,
  ReconciliationRuleResult,
} from '../types/importTrade';

function byId(results: ReconciliationRuleResult[], id: string): ReconciliationRuleResult {
  const hit = results.find((r) => r.ruleId === id);
  if (!hit) throw new Error(`규칙 ${id} 결과 없음`);
  return hit;
}

/** 전 룰 통과하는 정상 입력 기준선 */
function cleanInput(): ImportReconciliationInput {
  return {
    commercial_invoice: {
      productDescription: 'Wireless Bluetooth Earphone',
      quantity: '1000',
      unitPrice: '18',
      totalAmount: '18000',
      currency: 'USD',
      hsCode: '8518.30',
      incoterms: 'FOB',
    },
    packing_list: {
      productDescription: 'Wireless Bluetooth Earphone',
      quantity: '1000',
      packageCount: '30',
      grossWeight: '520',
      netWeight: '480',
    },
    bill_of_lading: {
      productDescription: 'Wireless Bluetooth Earphone',
      grossWeight: '520',
      packageCount: '30',
    },
  };
}

describe('파싱 헬퍼', () => {
  it('parseNumeric: 콤마·단위·통화기호 제거', () => {
    expect(parseNumeric('1,020개')).toBe(1020);
    expect(parseNumeric('USD 18,000')).toBe(18000);
    expect(parseNumeric('3.5 CBM')).toBe(3.5);
    expect(parseNumeric('')).toBeNull();
    expect(parseNumeric('없음')).toBeNull();
    expect(parseNumeric(undefined)).toBeNull();
  });

  it('descTokens/jaccard: 표기 유사도', () => {
    expect(jaccard(descTokens('Wireless Earphone'), descTokens('Wireless Earphone'))).toBe(1);
    expect(jaccard(descTokens('Wireless Earphone'), descTokens('Bluetooth Headset'))).toBe(0);
  });
});

describe('IR1~IR10 개별 판정', () => {
  it('기준선 입력은 error 불일치가 없다', () => {
    const results = runImportReconciliation(cleanInput());
    expect(results).toHaveLength(10);
    expect(results.filter((r) => r.status === 'fail' && r.severity === 'error')).toHaveLength(0);
  });

  it('IR1 품명: 상이하면 fail, 동일하면 pass, 1건뿐이면 skip', () => {
    const base = cleanInput();
    base.bill_of_lading!.productDescription = 'Bluetooth Headset';
    expect(byId(runImportReconciliation(base), 'IR1').status).toBe('fail');

    expect(byId(runImportReconciliation(cleanInput()), 'IR1').status).toBe('pass');

    const one: ImportReconciliationInput = { commercial_invoice: { productDescription: 'Earphone' } };
    expect(byId(runImportReconciliation(one), 'IR1').status).toBe('skip');
  });

  it('IR2 수량: C/I 1000 vs P/L 1020 → fail(20 차이), 값 없으면 skip', () => {
    const base = cleanInput();
    base.packing_list!.quantity = '1020';
    const fail = byId(runImportReconciliation(base), 'IR2');
    expect(fail.status).toBe('fail');
    expect(fail.evidence).toContain('20');

    const skip = cleanInput();
    delete skip.packing_list!.quantity;
    expect(byId(runImportReconciliation(skip), 'IR2').status).toBe('skip');
  });

  it('IR3 총중량: ±1kg 이내 pass, 초과 fail', () => {
    const within = cleanInput();
    within.bill_of_lading!.grossWeight = '520.4';
    expect(byId(runImportReconciliation(within), 'IR3').status).toBe('pass');

    const beyond = cleanInput();
    beyond.bill_of_lading!.grossWeight = '540';
    expect(byId(runImportReconciliation(beyond), 'IR3').status).toBe('fail');
  });

  it('IR3 총중량: 큰 값에서는 0.5% 허용오차 적용', () => {
    const input = cleanInput();
    input.packing_list!.grossWeight = '10000';
    input.bill_of_lading!.grossWeight = '10040'; // 0.4% 차이 → 허용
    expect(byId(runImportReconciliation(input), 'IR3').status).toBe('pass');
    input.bill_of_lading!.grossWeight = '10600'; // 6% 차이 → 초과
    expect(byId(runImportReconciliation(input), 'IR3').status).toBe('fail');
  });

  it('IR4 순≤총: 순>총이면 fail', () => {
    const base = cleanInput();
    base.packing_list!.netWeight = '540';
    base.packing_list!.grossWeight = '520';
    expect(byId(runImportReconciliation(base), 'IR4').status).toBe('fail');
    expect(byId(runImportReconciliation(cleanInput()), 'IR4').status).toBe('pass');
  });

  it('IR5 포장수: P/L 30 vs B/L 28 → fail', () => {
    const base = cleanInput();
    base.bill_of_lading!.packageCount = '28';
    expect(byId(runImportReconciliation(base), 'IR5').status).toBe('fail');
  });

  it('IR6 금액정합: 단가×수량 ≠ 총액이면 fail, 반올림 오차는 pass', () => {
    const base = cleanInput();
    base.commercial_invoice!.totalAmount = '12000';
    expect(byId(runImportReconciliation(base), 'IR6').status).toBe('fail');

    const rounding = cleanInput();
    rounding.commercial_invoice!.unitPrice = '18.005';
    rounding.commercial_invoice!.quantity = '1000';
    rounding.commercial_invoice!.totalAmount = '18000'; // 18005 기대, 1% 이내
    expect(byId(runImportReconciliation(rounding), 'IR6').status).toBe('pass');
  });

  it('IR7 통화: 없으면 fail(warning)', () => {
    const base = cleanInput();
    base.commercial_invoice!.currency = '';
    const r = byId(runImportReconciliation(base), 'IR7');
    expect(r.status).toBe('fail');
    expect(r.severity).toBe('warning');
  });

  it('IR8 HS: 6자리 미만·미기재(C/I 있음)는 fail(warning), C/I 자체가 없으면 skip', () => {
    const short = cleanInput();
    short.commercial_invoice!.hsCode = '8518';
    expect(byId(runImportReconciliation(short), 'IR8').status).toBe('fail');

    const missing = cleanInput();
    delete missing.commercial_invoice!.hsCode; // 미기재 → 수입신고 위해 경고
    expect(byId(runImportReconciliation(missing), 'IR8').status).toBe('fail');

    const noCI: ImportReconciliationInput = { packing_list: { quantity: '10' } };
    expect(byId(runImportReconciliation(noCI), 'IR8').status).toBe('skip');
  });

  it('IR9 Incoterms: 비표준 조건 fail', () => {
    const base = cleanInput();
    base.commercial_invoice!.incoterms = 'XYZ';
    expect(byId(runImportReconciliation(base), 'IR9').status).toBe('fail');
    expect(byId(runImportReconciliation(cleanInput()), 'IR9').status).toBe('pass');
  });

  it('IR10 필수서류: B/L 누락 시 fail(error)', () => {
    const base = cleanInput();
    delete base.bill_of_lading;
    const r = byId(runImportReconciliation(base), 'IR10');
    expect(r.status).toBe('fail');
    expect(r.severity).toBe('error');
    expect(r.evidence).toContain('B/L');
  });
});

describe('2→3단계 전이 게이트 (evaluateReconciliationGate)', () => {
  it('IR10은 blocking=true, 내용 불일치 룰(IR2)은 blocking=false로 전파된다', () => {
    const results = runImportReconciliation(cleanInput());
    expect(results.find((r) => r.ruleId === 'IR10')?.blocking).toBe(true);
    expect(results.find((r) => r.ruleId === 'IR2')?.blocking).toBe(false);
  });

  it('클린 입력 → clear', () => {
    const gate = evaluateReconciliationGate(runImportReconciliation(cleanInput()));
    expect(gate.status).toBe('clear');
  });

  it('수량 불일치(IR2 error, overridable) → override_required, 사유 입력 시 clear', () => {
    const input = cleanInput();
    input.packing_list!.quantity = '1020';
    const results = runImportReconciliation(input);

    const gate = evaluateReconciliationGate(results);
    expect(gate.status).toBe('override_required');
    expect(gate.overridable.map((r) => r.ruleId)).toContain('IR2');
    expect(gate.blocking).toHaveLength(0);

    const cleared = evaluateReconciliationGate(results, { IR2: '수출자 확인 완료' });
    expect(cleared.status).toBe('clear');
  });

  it('필수서류 누락(B/L 없음, IR10 blocking) → blocked, 사유로도 안 풀림', () => {
    const input = cleanInput();
    delete input.bill_of_lading;
    const results = runImportReconciliation(input);

    const gate = evaluateReconciliationGate(results);
    expect(gate.status).toBe('blocked');
    expect(gate.blocking.map((r) => r.ruleId)).toContain('IR10');

    // IR10에 사유를 넣어도 blocking은 유지된다
    const stillBlocked = evaluateReconciliationGate(results, { IR10: '그냥 진행' });
    expect(stillBlocked.status).toBe('blocked');
  });
});

describe('데모 시나리오 — 오류를 심은 무선 이어폰 수입 건', () => {
  it('수량·총중량·품명 불일치가 동시에 잡히고 차단(error) 개수가 집계된다', () => {
    const input = cleanInput();
    input.packing_list!.quantity = '1020';          // IR2 수량 불일치
    input.bill_of_lading!.grossWeight = '540';       // IR3 총중량 불일치
    input.bill_of_lading!.productDescription = 'Bluetooth Headset'; // IR1 품명 상이
    delete input.commercial_invoice!.hsCode;         // IR8 HS 미기재 → warning

    const results = runImportReconciliation(input);
    expect(byId(results, 'IR2').status).toBe('fail');
    expect(byId(results, 'IR3').status).toBe('fail');
    expect(byId(results, 'IR1').status).toBe('fail');
    expect(byId(results, 'IR8').status).toBe('fail');

    const summary = summarizeReconciliation(results);
    expect(summary.blocking).toBe(2); // IR2, IR3 (error)
    expect(summary.warnings).toBe(2); // IR1, IR8 (warning)
  });
});

describe('buildReconciliationInput 어댑터 (실 OCR analysis → per-doc)', () => {
  function emptyExtracted(): ImportExtractedFields {
    return {
      shipper: '', consignee: '', notifyParty: '', importer: '', invoiceNo: '',
      productDescription: '', quantity: '', grossWeight: '', netWeight: '',
      originCountry: '', destinationCountry: '', currency: 'USD', totalAmount: '18000',
      loadPort: '', dischargePort: '', blNo: '', containerNo: '', sealNo: '',
      vesselName: '', voyageNo: '',
    };
  }

  it('자유서식 comparison 라벨을 문서별 필드로 복원하고 판정한다', () => {
    const analysis: ImportAnalysisResult = {
      extracted: emptyExtracted(),
      validations: [],
      comparison: [
        { field: '품명', invoice: 'Wireless Earphone', packingList: 'Wireless Earphone', billOfLading: 'Bluetooth Headset', matches: false, detail: '' },
        { field: '수량', invoice: '1,000', packingList: '1,020', billOfLading: 'N/A', matches: false, detail: '' },
        { field: '총중량(G/W)', invoice: '-', packingList: '520 kg', billOfLading: '521 kg', matches: true, detail: '' },
      ],
    };
    const input = buildReconciliationInput(analysis, ['commercial_invoice', 'packing_list', 'bill_of_lading']);
    expect(input.commercial_invoice?.quantity).toBe('1,000');
    expect(input.packing_list?.quantity).toBe('1,020');
    expect(input.bill_of_lading?.quantity).toBeUndefined(); // 'N/A' → 무시

    const results = reconcileFromAnalysis(analysis, ['commercial_invoice', 'packing_list', 'bill_of_lading']);
    expect(byId(results, 'IR2').status).toBe('fail'); // 1000 vs 1020
    expect(byId(results, 'IR1').status).toBe('fail'); // 품명 상이
    expect(byId(results, 'IR3').status).toBe('pass'); // 520 vs 521 → 1kg 차이(허용 ±1kg 이내)
    expect(byId(results, 'IR10').status).toBe('pass'); // 3종 존재
  });

  it('업로드되지 않은 문서 종류는 필드가 세팅되지 않아 IR10이 누락을 잡는다', () => {
    const analysis: ImportAnalysisResult = {
      extracted: emptyExtracted(),
      validations: [],
      comparison: [
        { field: '수량', invoice: '1000', packingList: '1000', billOfLading: '', matches: true, detail: '' },
      ],
    };
    const results = reconcileFromAnalysis(analysis, ['commercial_invoice', 'packing_list']);
    expect(byId(results, 'IR10').status).toBe('fail');
    expect(byId(results, 'IR10').evidence).toContain('B/L');
  });
});
