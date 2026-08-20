import { describe, it, expect, vi, afterEach } from 'vitest';
import { determineRequiredDocuments, calculateReadiness } from './rulesEngine';
import { validateTradeDocuments, validateTradeDocumentsAsync, validateRequiredInputs } from './validatorEngine';
import { runComplianceRules } from '../agents/complianceRules';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { HSCodeAgent } from '../agents/HSCodeAgent';
import { TradeProfile } from '../types';
import * as customsApiService from '../services/customsApiService';
import * as unipassService from '../services/unipassService';

vi.setConfig({
  testTimeout: 30_000,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PortAI Harness Engineering - 비즈니스 규칙 및 검증 엔진 테스트', () => {
  
  const mockValidProfile: TradeProfile = {
    tradeType: 'export',
    itemName: '산업용 부품',
    hsCode: '8479-89-9090',
    loadPort: '부산항',
    dischargePort: '상하이항',
    incoterms: 'FOB',
    quantity: 1500,
    weight: 4500,
    departureDate: '2026-07-01',
    arrivalDate: '2026-07-05',
    companyName: '인천테크',
    contact: '010-1234-5678'
  };

  it('수출 거래의 원산지증명서는 필요 여부 답변(coNeeded)에 따라 3상태로 나뉜다', () => {
    // 미확인 → 필요 여부 확인
    const unanswered = determineRequiredDocuments(mockValidProfile).find(d => d.id === 'co');
    expect(unanswered?.status).toBe('external_pending');
    expect(unanswered?.statusText).toBe('필요 여부 확인');

    // 예 → 상공회의소 발급 대상 (여전히 화주가 생성하지 않는 external_pending)
    const yes = determineRequiredDocuments({ ...mockValidProfile, coNeeded: 'yes' }).find(d => d.id === 'co');
    expect(yes?.status).toBe('external_pending');
    expect(yes?.statusText).toBe('상공회의소 발급 대상');

    // 아니오 → 불필요 처리
    const no = determineRequiredDocuments({ ...mockValidProfile, coNeeded: 'no' }).find(d => d.id === 'co');
    expect(no?.status).toBe('not_needed');
    expect(no?.statusText).toBe('불필요 (구매자 요청 없음)');
  });

  it('수입 거래의 경우 원산지증명서는 해당 없음으로 나타나야 한다', () => {
    const importProfile: TradeProfile = {
      ...mockValidProfile,
      tradeType: 'import'
    };
    const docs = determineRequiredDocuments(importProfile);
    const coDoc = docs.find(d => d.id === 'co');
    expect(coDoc).toBeDefined();
    expect(coDoc?.statusText).toBe('해당 없음');
  });

  it('수량은 입력되었으나 중량이 0 또는 누락된 경우 패킹리스트에 검토 필요 경고가 발생한다', () => {
    const invalidWeightProfile: TradeProfile = {
      ...mockValidProfile,
      weight: '' // 중량 누락
    };
    
    // 1. 규칙 엔진에서 검토 필요 상태로 표시되는지 검증
    const docs = determineRequiredDocuments(invalidWeightProfile);
    const packingDoc = docs.find(d => d.id === 'packing_list');
    expect(packingDoc?.status).toBe('review_required');
    expect(packingDoc?.statusText).toBe('검토 필요');

    // 2. 검증 엔진에서 중량 누락 경고 이슈를 발행하는지 검증
    const issues = validateTradeDocuments(invalidWeightProfile);
    const weightIssue = issues.find(i => i.id === 'weight-missing');
    expect(weightIssue).toBeDefined();
    expect(weightIssue?.severity).toBe('warning');
    expect(weightIssue?.message).toContain('중량 정보 확인 필요');
  });

  it('HSCodeAgent가 잘못된 HS Code 형태(비숫자, 자릿수 불일치, 범위 외 Chapter) 및 올바른 형태를 올바르게 검증한다', async () => {
    const hsAgent = new HSCodeAgent();
    
    // 1. 비숫자 검증
    const resNonNumeric = await hsAgent.run({ itemName: '테스트', hsCode: 'ABC-12', logs: [] });
    expect(resNonNumeric.status).toBe('invalid');
    expect(resNonNumeric.validationMessage).toContain('숫자만');

    // 2. 자릿수 오류 검증 (8자리)
    const resWrongLength = await hsAgent.run({ itemName: '테스트', hsCode: '12345678', logs: [] });
    expect(resWrongLength.status).toBe('invalid');
    expect(resWrongLength.validationMessage).toContain('6자리');
    expect(resWrongLength.validationMessage).toContain('10자리');

    // 3. 특수 Chapter (범위 외 Chapter, e.g. 99)
    const resSpecialChapter = await hsAgent.run({ itemName: '테스트', hsCode: '9912345678', logs: [] });
    expect(resSpecialChapter.status).toBe('needs_review');
    expect(resSpecialChapter.validationMessage).toContain('특수 범위');

    // 4. 올바른 HSK 10자리 검증 및 포맷팅
    const resValid10 = await hsAgent.run({ itemName: '테스트', hsCode: '8517620000', logs: [] });
    expect(resValid10.status).toBe('valid');
    expect(resValid10.formattedCode).toBe('8517.62-0000');

    // 5. 올바른 HS6 6자리 검증 및 포맷팅
    const resValid6 = await hsAgent.run({ itemName: '테스트', hsCode: '851762', logs: [] });
    expect(resValid6.status).toBe('valid');
    expect(resValid6.formattedCode).toBe('8517.62');
  });

  it('필수 항목이 채워지면 송장·패킹리스트와 수출 운송의뢰서 초안이 생성된다', () => {
    const docs = determineRequiredDocuments(mockValidProfile);

    const invoice = docs.find(d => d.id === 'invoice');
    const packing = docs.find(d => d.id === 'packing_list');
    const transportRequest = docs.find(d => d.id === 'transport_request');

    expect(invoice?.status).toBe('completed');
    expect(packing?.status).toBe('completed');
    expect(transportRequest?.status).toBe('completed');
    expect(transportRequest?.statusText).toBe('초안');
    expect(docs.find(d => d.id === 'bl')).toBeUndefined();
  });

  it('자동 생성 대상(C/I·P/L·E/D)만 채워지면 준비도 100% — 타 주체 발급 서류는 준비도 분모에서 제외된다', () => {
    const docs = determineRequiredDocuments(mockValidProfile);
    const readiness = calculateReadiness(docs);

    // C/I·P/L·수출신고서·운송의뢰서 초안이 모두 완료 → 100%. C/O는 분모에 없음.
    expect(readiness.percent).toBe(100);
    expect(readiness.applicableCount).toBe(4);
    expect(readiness.nextStepDocId).toBeUndefined();
  });

  it('원산지증명서 필요 여부와 무관하게 C/O는 준비도 분모에 들어가지 않는다', () => {
    // yes(발급기관 대상)·no(불필요) 모두 화주 자동 생성 대상이 아니므로 준비도는 변하지 않는다.
    for (const coNeeded of ['yes', 'no'] as const) {
      const docs = determineRequiredDocuments({ ...mockValidProfile, coNeeded });
      const readiness = calculateReadiness(docs);
      expect(readiness.percent).toBe(100);
      expect(readiness.nextStepDocId).toBeUndefined();
    }
  });

  it('수입 거래는 해당 없음(C/O)을 분모에서 제외하고 준비도를 계산한다', () => {
    const importProfile: TradeProfile = {
      ...mockValidProfile,
      tradeType: 'import',
    };
    const docs = determineRequiredDocuments(importProfile);
    const readiness = calculateReadiness(docs);

    // 준비도 분모 = not_needed·external_pending 제외(자동 생성 대상만).
    expect(readiness.applicableCount).toBe(docs.filter(d => d.status !== 'not_needed' && d.status !== 'external_pending').length);
    expect(readiness.percent).toBe(100);
  });
});

describe('PortAI Agent Pipeline - 다중 에이전트 연동 테스트', () => {
  const testProfile: TradeProfile = {
    tradeType: 'export',
    itemName: 'IT 기기',
    hsCode: '8517-62-0000',
    loadPort: '인천항',
    dischargePort: '로스앤젤레스항',
    incoterms: 'CIF',
    quantity: 500,
    weight: '', // 의도적 중량 누락
    departureDate: '2026-08-10',
    arrivalDate: '2026-08-25',
    companyName: '글로벌코리아',
    contact: '010-9876-5432'
  };

  it('OrchestratorAgent가 모든 하위 에이전트를 성공적으로 통합 조율하여 실행 결과를 도출한다', async () => {
    const orchestrator = new OrchestratorAgent();
    const result = await orchestrator.run({ profile: testProfile, useLLM: false });

    // 1. HSCode 결과 검증
    expect(result.hs?.topCode).toBe('8517.62-0000');
    expect(result.hs?.candidates.length).toBeGreaterThan(0);

    // 2. Documents 결과 검증 (CIF 조건이므로 보험증서 포함 총 6개)
    expect(result.documents?.documents).toHaveLength(6);
    expect(result.documents?.generatedDocs.invoice).toBeDefined();
    expect(result.documents?.generatedDocs.packingList).toBeDefined();

    // 3. Issues 결과 검증 (중량 누락 경고 확인)
    const weightIssue = result.issues?.issues.find(i => i.id === 'weight-missing');
    expect(weightIssue).toBeDefined();

    // 4. Feedback 결과 검증
    expect(result.feedback?.message).toContain('IT 기기');
    expect(result.feedback?.message).toContain('중량');

    // 5. 전체 실행 로그 확인
    expect(result.logs.length).toBeGreaterThan(0);
    const startLog = result.logs.find(l => l.message.includes('가동 시작'));
    expect(startLog).toBeDefined();
  });

  it('CIF 조건의 경우 적하보험증권 준비 확인 경고 및 책임 안내 피드백이 발생한다', async () => {
    const cifProfile: TradeProfile = {
      tradeType: 'export',
      itemName: '기계부품',
      hsCode: '8479-89-9090',
      loadPort: '부산항',
      dischargePort: '상하이항',
      incoterms: 'CIF',
      quantity: 100,
      weight: 500,
      departureDate: '2026-07-01',
      arrivalDate: '2026-07-05',
      companyName: '수출상사',
      contact: '010-1234-5678'
    };

    const orchestrator = new OrchestratorAgent();
    const result = await orchestrator.run({ profile: cifProfile, useLLM: false });

    // 적하보험증권 포함 확인
    const insuranceDoc = result.documents?.documents.find(d => d.id === 'insurance');
    expect(insuranceDoc).toBeDefined();
    expect(insuranceDoc?.status).toBe('not_started');

    // 준비 확인 경고 검증 — 해소 수단(insuranceConfirmed)이 있으므로 error가 아닌 warning
    const insuranceIssue = result.issues?.issues.find(i => i.id === 'insurance-missing');
    expect(insuranceIssue).toBeDefined();
    expect(insuranceIssue?.severity).toBe('warning');

    // 피드백 검증
    expect(result.feedback?.message).toContain('적하보험증권을 준비하세요');
  });

  it('CIF 조건에서 적하보험증권 준비를 확인하면 이슈가 해소되고 서류가 완료 처리된다', async () => {
    const cifConfirmedProfile: TradeProfile = {
      tradeType: 'export',
      itemName: '기계부품',
      hsCode: '8479-89-9090',
      loadPort: '부산항',
      dischargePort: '상하이항',
      incoterms: 'CIF',
      quantity: 100,
      weight: 500,
      departureDate: '2026-07-01',
      arrivalDate: '2026-07-05',
      companyName: '수출상사',
      contact: '010-1234-5678',
      insuranceConfirmed: true
    };

    const orchestrator = new OrchestratorAgent();
    const result = await orchestrator.run({ profile: cifConfirmedProfile, useLLM: false });

    const insuranceIssue = result.issues?.issues.find(i => i.id === 'insurance-missing');
    expect(insuranceIssue).toBeUndefined();

    const insuranceDoc = result.documents?.documents.find(d => d.id === 'insurance');
    expect(insuranceDoc?.status).toBe('completed');
  });

  it('수출 거래의 co-required 이슈는 coNeeded 답변에 따라 노출·해소된다', async () => {
    const base: TradeProfile = {
      tradeType: 'export',
      itemName: '기계부품',
      hsCode: '8479-89-9090',
      loadPort: '부산항',
      dischargePort: '상하이항',
      incoterms: 'FOB',
      quantity: 100,
      weight: 500,
      departureDate: '2026-07-01',
      arrivalDate: '2026-07-05',
      companyName: '수출상사',
      contact: '010-1234-5678'
    };

    const orchestrator = new OrchestratorAgent();

    // 미확인 → 필요 여부 확인 질문 이슈(warning) 노출.
    const before = await orchestrator.run({ profile: base, useLLM: false });
    const beforeIssue = before.issues?.issues.find(i => i.id === 'co-required');
    expect(beforeIssue).toBeDefined();
    expect(beforeIssue?.severity).toBe('warning');
    expect(beforeIssue?.message).toContain('필요 여부 확인');
    expect(before.documents?.documents.find(d => d.id === 'co')?.status).toBe('external_pending');

    // 예 → 발급기관 안내 이슈로 전환(여전히 확인 목록에 남음), 문서는 external_pending 유지.
    const yes = await orchestrator.run({ profile: { ...base, coNeeded: 'yes', countryOfOrigin: '대한민국' }, useLLM: false });
    const yesIssue = yes.issues?.issues.find(i => i.id === 'co-required');
    expect(yesIssue).toBeDefined();
    expect(yesIssue?.message).toContain('상공회의소 발급 대상');
    expect(yes.documents?.documents.find(d => d.id === 'co')?.status).toBe('external_pending');

    // 아니오 → 이슈 미발행 + 문서 불필요 처리.
    const no = await orchestrator.run({ profile: { ...base, coNeeded: 'no' }, useLLM: false });
    expect(no.issues?.issues.find(i => i.id === 'co-required')).toBeUndefined();
    expect(no.documents?.documents.find(d => d.id === 'co')?.status).toBe('not_needed');
  });

  it('레거시 EXW 거래도 B/L 대신 운송의뢰서 초안을 만들고 책임 안내를 유지한다', async () => {
    const exwProfile: TradeProfile = {
      tradeType: 'export',
      itemName: '기계부품',
      hsCode: '8479-89-9090',
      loadPort: '부산항',
      dischargePort: '상하이항',
      incoterms: 'EXW',
      quantity: 100,
      weight: 500,
      departureDate: '2026-07-01',
      arrivalDate: '2026-07-05',
      companyName: '수출상사',
      contact: '010-1234-5678'
    };

    const orchestrator = new OrchestratorAgent();
    const result = await orchestrator.run({ profile: exwProfile, useLLM: false });

    const transportRequest = result.documents?.documents.find(d => d.id === 'transport_request');
    expect(transportRequest?.status).toBe('completed');
    expect(result.documents?.documents.find(d => d.id === 'bl')).toBeUndefined();

    // 정보성 알림 검증
    const exwIssue = result.issues?.issues.find(i => i.id === 'exw-responsibility-info');
    expect(exwIssue).toBeDefined();
    expect(exwIssue?.severity).toBe('info');

    // 피드백 검증
    expect(result.feedback?.message).toContain('공장 인도 조건입니다');
  });

  const baseAsyncProfile: TradeProfile = {
    tradeType: 'export',
    itemName: '산업용 부품',
    hsCode: '8479-89-9090',
    loadPort: '부산항',
    dischargePort: '상하이항',
    incoterms: 'FOB',
    quantity: 1500,
    weight: 4500,
    departureDate: '2026-07-01',
    arrivalDate: '2026-07-05',
    companyName: '인천테크',
    contact: '010-1234-5678',
    unitPrice: 10,
    totalAmount: 15000, // 1500 × 10 = 15000 (계산 일치)
    invoiceDate: '2026-06-25' // 출발일(2026-07-01) 이전
  };

  it('외화(USD) 인보이스 입력 시 원화 과세가격 환산 info 이슈가 추가된다', async () => {
    const usdProfile: TradeProfile = {
      ...baseAsyncProfile,
      currency: 'USD',
      invoiceAmount: 100000
    };
    const issues = await validateTradeDocumentsAsync(usdProfile);
    const dutiable = issues.find(i => i.id === 'dutiable-value-info');
    expect(dutiable).toBeDefined();
    expect(dutiable?.severity).toBe('info');
    expect(dutiable?.message).toContain('과세가격 환산');
    expect(dutiable?.message).toContain('USD');
  });

  it('KRW 거래 또는 금액 미입력 시 과세가격 환산 이슈가 없다', async () => {
    const krwProfile: TradeProfile = { ...baseAsyncProfile, currency: 'KRW', invoiceAmount: 5000000 };
    const noAmountProfile: TradeProfile = { ...baseAsyncProfile, currency: 'USD', invoiceAmount: '' };

    const krwIssues = await validateTradeDocumentsAsync(krwProfile);
    const noAmtIssues = await validateTradeDocumentsAsync(noAmountProfile);

    expect(krwIssues.find(i => i.id === 'dutiable-value-info')).toBeUndefined();
    expect(noAmtIssues.find(i => i.id === 'dutiable-value-info')).toBeUndefined();
  });

  it('체크섬이 틀린 사업자등록번호는 error, 올바른 번호는 (키 미설정 시) 형식확인 info가 된다', async () => {
    const businessSpy = vi.spyOn(
      customsApiService,
      'verifyBusinessRegistration'
    );

    businessSpy
      .mockResolvedValueOnce({
        bizNo: '1234567890',
        valid: false,
        statusText: '유효하지 않은 사업자등록번호 형식입니다.',
        source: 'simulation',
      })
      .mockResolvedValueOnce({
        bizNo: '1248100998',
        valid: true,
        statusText: '형식 유효 (체크섬 확인)',
        source: 'simulation',
      });

    // 123-45-67890: 체크섬 불일치 → warning(보완 권장 — 생성은 차단하지 않음)
    const badBizProfile: TradeProfile = {
      ...baseAsyncProfile,
      businessRegistrationNo: '123-45-67890',
    };

    const badIssues = await validateTradeDocumentsAsync(badBizProfile);
    const badIssue = badIssues.find(i => i.id === 'bizno-invalid');

    expect(badIssue).toBeDefined();
    expect(badIssue?.severity).toBe('warning');

    // 124-81-00998: 체크섬 유효, 국세청 API 미사용 → 형식확인 info
    const okBizProfile: TradeProfile = {
      ...baseAsyncProfile,
      businessRegistrationNo: '124-81-00998',
    };

    const okIssues = await validateTradeDocumentsAsync(okBizProfile);

    expect(okIssues.find(i => i.id === 'bizno-invalid')).toBeUndefined();

    const checksumInfo = okIssues.find(i => i.id === 'bizno-checksum-only');

    expect(checksumInfo).toBeDefined();
    expect(checksumInfo?.severity).toBe('info');
  });

  // ===== 입력값 검증 모듈 (팀원 Python 스펙 포팅) =====

  it('필수 항목이 모두 입력된 경우 입력값 검증 오류가 없다 (Python 시나리오 B)', () => {
    const fullProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      unit: 'EA',
      currency: 'USD',
      companyAddress: '인천 남동구 1로',
      partnerAddress: '100 Test St, LA'
    };
    const issues = validateRequiredInputs(fullProfile);
    expect(issues).toHaveLength(0);
  });

  it('품목명·거래처명 등 필수 항목 누락 시 error 이슈가 발생한다', () => {
    const missingProfile: TradeProfile = {
      ...baseAsyncProfile,
      itemName: '',
      partnerName: ''
    };
    const issues = validateRequiredInputs(missingProfile);
    expect(issues.find(i => i.id === 'input-missing-itemName')?.severity).toBe('error');
    expect(issues.find(i => i.id === 'input-missing-partnerName')?.severity).toBe('error');
  });

  it('수량·중량이 0 이하이면 error 이슈가 발생한다 (Python 시나리오 A 핵심)', () => {
    const zeroProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      quantity: 0,
      weight: -5
    };
    const issues = validateRequiredInputs(zeroProfile);
    expect(issues.find(i => i.id === 'input-nonpositive-quantity')).toBeDefined();
    expect(issues.find(i => i.id === 'input-nonpositive-weight')).toBeDefined();
  });

  it('관세 API를 사용할 수 없으면 임의 8% 예상 관세액 이슈를 만들지 않는다', async () => {
    vi.spyOn(
      customsApiService,
      'calcDutiableValue'
    ).mockResolvedValue({
      totalForeign: 10000,
      currency: 'USD',
      rate: 1385.5,
      totalKrw: 13855000,
      effectiveDate: '20260729',
      source: 'simulation',
    });

    vi.spyOn(
      unipassService,
      'estimateDuty'
    ).mockResolvedValue(null);

    const importProfile: TradeProfile = {
      ...baseAsyncProfile,
      tradeType: 'import',
      partnerName: 'ABC Corp',
      hsCode: '8517130000',
      currency: 'USD',
      invoiceAmount: 10000,
    };

    const issues = await validateTradeDocumentsAsync(importProfile);

    const duty = issues.find(i => i.id === 'estimated-duty-info');
    expect(duty).toBeUndefined();

    const dutiable = issues.find(i => i.id === 'dutiable-value-info');
    expect(dutiable).toBeDefined();
    expect(dutiable?.message).toContain('13,855,000');
  });

  it('수출 거래에서는 예상 관세액 이슈가 없다', async () => {
    const exportProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      hsCode: '8517130000',
      currency: 'USD',
      invoiceAmount: 10000
    };
    const issues = await validateTradeDocumentsAsync(exportProfile);
    expect(issues.find(i => i.id === 'estimated-duty-info')).toBeUndefined();
  });

  it('수출 화주 입력에서 제거된 도착예정일은 생성 차단 검증에 사용하지 않는다', () => {
    const badDateProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      departureDate: '2026-07-15',
      arrivalDate: '2026-07-10'
    };
    const issues = validateRequiredInputs(badDateProfile);
    expect(issues.find(i => i.id === 'input-date-order')).toBeUndefined();
  });

  it('단가·금액은 필수지만 자동 생성되는 송장 작성일은 입력 누락 오류가 아니다', () => {
    const missingAmountProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      unitPrice: '',
      totalAmount: '',
      invoiceDate: ''
    };
    const issues = validateRequiredInputs(missingAmountProfile);
    expect(issues.find(i => i.id === 'input-missing-unitPrice')?.severity).toBe('error');
    expect(issues.find(i => i.id === 'input-missing-totalAmount')?.severity).toBe('error');
    expect(issues.find(i => i.id === 'input-missing-invoiceDate')).toBeUndefined();
  });

  // 2026-08 통합: 단건 금액산술은 complianceRules.ts R8(r8-amount-arithmetic)로 이관됐다.
  // validateRequiredInputs는 더 이상 이 이슈를 내지 않는다(아래 "이중 error 표시 제거" 참고).
  it('수량 × 단가 ≠ 금액이 1% 허용오차를 넘으면 R8 계산 불일치 error가 발생한다', () => {
    const wrongTotalProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      quantity: 1500,
      unitPrice: 10,
      totalAmount: 12000 // 올바른 값은 15000
    };
    expect(validateRequiredInputs(wrongTotalProfile).find(i => i.id === 'amount-calc-mismatch'))
      .toBeUndefined(); // validatorEngine은 더 이상 발행하지 않음
    const calcIssue = runComplianceRules(wrongTotalProfile).find(i => i.id === 'r8-amount-arithmetic');
    expect(calcIssue).toBeDefined();
    expect(calcIssue?.severity).toBe('error');
    expect(calcIssue?.message).toContain('15,000');
    expect(calcIssue?.message).toContain('12,000');
    expect(calcIssue?.amounts).toEqual({ expected: 15000, actual: 12000, currency: 'USD' });
  });

  it('수량 × 단가 = 금액이 맞으면 R8 계산 불일치 error가 없다', () => {
    const okTotalProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      quantity: 200,
      unitPrice: 12.5,
      totalAmount: 2500 // 200 × 12.5 = 2500
    };
    expect(runComplianceRules(okTotalProfile).find(i => i.id === 'r8-amount-arithmetic')).toBeUndefined();
  });

  it('1% 이내 오차(반올림 등)는 R8이 통과시킨다(허용오차 정책)', () => {
    // 기대값 15000의 0.5% = 75 → 14930은 허용오차 안
    const roundingProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      quantity: 1500,
      unitPrice: 10,
      totalAmount: 14930,
    };
    expect(runComplianceRules(roundingProfile).find(i => i.id === 'r8-amount-arithmetic')).toBeUndefined();
  });

  it('큰 불일치(허용오차 초과)는 R8·validatorEngine 합쳐도 금액 이슈가 정확히 1개다(이중 error 표시 제거 확인)', () => {
    const wrongTotalProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      quantity: 1500,
      unitPrice: 10,
      totalAmount: 12000, // 15000 대비 20% 어긋남
    };
    // ComplianceAgent가 실제로 하는 것과 같이 두 엔진 결과를 합쳐서 센다.
    const combined = [
      ...validateTradeDocuments(wrongTotalProfile),
      ...runComplianceRules(wrongTotalProfile),
    ];
    const amountIssues = combined.filter(i => i.field === 'totalAmount' && i.amounts);
    expect(amountIssues).toHaveLength(1);
    expect(amountIssues[0].id).toBe('r8-amount-arithmetic');
  });

  it('레거시 송장 작성일은 새 문서 생성 검증을 차단하지 않는다', () => {
    const lateInvoiceProfile: TradeProfile = {
      ...baseAsyncProfile,
      partnerName: 'ABC Corp',
      invoiceDate: '2026-07-10',
      departureDate: '2026-07-01',
      arrivalDate: '2026-07-20'
    };
    const issues = validateRequiredInputs(lateInvoiceProfile);
    expect(issues.find(i => i.id === 'invoice-date-after-shipment')).toBeUndefined();
  });

  // ===== 문서 내부 논리 검증 (Layer 1 추가 규칙) =====

  const layer1Base: TradeProfile = {
    ...baseAsyncProfile,
    partnerName: 'ABC Corp',
    unit: 'EA',
    currency: 'USD',
    companyAddress: '인천 남동구 1로',
    partnerAddress: '100 Test St, LA'
  };

  it('순중량(Net)이 총중량(Gross)보다 크면 error가 발생한다', () => {
    const issues = validateRequiredInputs({ ...layer1Base, netWeight: 500, grossWeight: 450 });
    const issue = issues.find(i => i.id === 'weight-net-gross');
    expect(issue?.severity).toBe('error');
    expect(validateRequiredInputs({ ...layer1Base, netWeight: 450, grossWeight: 500 })
      .find(i => i.id === 'weight-net-gross')).toBeUndefined();
  });

  it('포장 수량이 0 이하이면 error가 발생한다', () => {
    expect(validateRequiredInputs({ ...layer1Base, packageCount: 0 })
      .find(i => i.id === 'package-count-nonpositive')?.severity).toBe('error');
    expect(validateRequiredInputs({ ...layer1Base, packageCount: 10 })
      .find(i => i.id === 'package-count-nonpositive')).toBeUndefined();
  });

  it('수량이 있는데 단위가 누락되면 error가 발생한다', () => {
    expect(validateRequiredInputs({ ...layer1Base, unit: '' })
      .find(i => i.id === 'unit-missing')?.severity).toBe('error');
  });

  it('금액이 있는데 통화가 누락되면 error가 발생한다', () => {
    expect(validateRequiredInputs({ ...layer1Base, currency: '' })
      .find(i => i.id === 'currency-missing')?.severity).toBe('error');
  });

  it('공급자·거래처 주소가 누락되면 각각 error가 발생한다', () => {
    const issues = validateRequiredInputs({ ...layer1Base, companyAddress: '', partnerAddress: '' });
    expect(issues.find(i => i.id === 'input-missing-companyAddress')?.severity).toBe('error');
    expect(issues.find(i => i.id === 'input-missing-partnerAddress')?.severity).toBe('error');
  });

  it('다품목 금액 합계 ≠ Invoice 총액이면 error, 일치하면 없음', () => {
    const items = [
      { id: '1', itemName: 'A', hsCode: '620211', quantity: 100 as const, unit: 'EA' as const, unitPrice: 250 as const, currency: 'USD' as const },
      { id: '2', itemName: 'B', hsCode: '620211', quantity: 10 as const, unit: 'EA' as const, unitPrice: 100 as const, currency: 'USD' as const },
    ];
    // 합계 = 100×250 + 10×100 = 26,000. 총액을 25,000으로 넣으면 불일치.
    const bad = validateRequiredInputs({ ...layer1Base, shipperItems: items, quantity: 100, unitPrice: 250, totalAmount: 25000 });
    const badIssue = bad.find(i => i.id === 'items-total-mismatch');
    expect(badIssue?.severity).toBe('error');
    expect(badIssue?.message).toContain('26,000');
    // 총액을 합계와 맞추면 불일치 없음. 단건 계산 오류(amount-calc-mismatch)도 다품목이라 미발행.
    const ok = validateRequiredInputs({ ...layer1Base, shipperItems: items, quantity: 100, unitPrice: 250, totalAmount: 26000 });
    expect(ok.find(i => i.id === 'items-total-mismatch')).toBeUndefined();
    // R8(단건 계산)도 다품목(2건 이상)이면 가드로 스킵 — profile.quantity×unitPrice(25000)가
    // totalAmount(26000)와 달라도 다품목 총액 비교(items-total-mismatch)로 대체되므로 미발행.
    expect(runComplianceRules({ ...layer1Base, shipperItems: items, quantity: 100, unitPrice: 250, totalAmount: 26000 })
      .find(i => i.id === 'r8-amount-arithmetic')).toBeUndefined();
  });
});

describe('항구 누락 검증 — R3(Incoterms별 정밀판정) 전담, ports-missing은 Incoterms 공란일 때만 폴백', () => {
  const portBase: TradeProfile = {
    tradeType: 'export',
    itemName: 'FROZEN HAIRTAIL, WHOLE ROUND',
    hsCode: '0303892000',
    incoterms: 'FOB',
    quantity: 500,
    weight: 5400,
    loadPort: '',
    dischargePort: '',
    departureDate: '',
    arrivalDate: '',
    companyName: 'DAEHAN',
    contact: '02-1',
    countryOfOrigin: 'REPUBLIC OF KOREA',
  };
  // ComplianceAgent가 실제로 하는 것과 같이 두 엔진의 이슈를 합쳐 loadPort 관련 항목만 본다.
  const portIssues = (profile: TradeProfile) =>
    [...validateTradeDocuments(profile), ...runComplianceRules(profile)]
      .filter(i => i.id === 'ports-missing' || i.id.startsWith('r3-incoterm-port'));

  it('FOB + 선적항 누락 → 이슈 1개(r3-incoterm-port만, ports-missing 중복 없음)', () => {
    const issues = portIssues({ ...portBase, loadPort: '', dischargePort: 'OSAKA, JAPAN' });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('r3-incoterm-port');
  });

  it('FOB + 도착항만 누락 → 이슈 0개(FOB는 도착항 불필요, ports-missing 오탐 제거 확인)', () => {
    const issues = portIssues({ ...portBase, loadPort: 'BUSAN, KOREA', dischargePort: '' });
    expect(issues).toHaveLength(0);
  });

  it('Incoterms 공란 + 항구 둘 다 누락 → ports-missing 발동(R3가 판단 못 하는 유일한 폴백)', () => {
    const issues = portIssues({ ...portBase, incoterms: '', loadPort: '', dischargePort: '' });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('ports-missing');
  });
});
