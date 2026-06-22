import { describe, it, expect } from 'vitest';
import { determineRequiredDocuments } from './rulesEngine';
import { validateTradeDocuments } from './validatorEngine';
import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import { HSCodeAgent } from '../agents/HSCodeAgent';
import { TradeProfile } from '../types';

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

  it('수출 거래의 경우 원산지증명서가 필요(작성 필요)하다', () => {
    const docs = determineRequiredDocuments(mockValidProfile);
    const coDoc = docs.find(d => d.id === 'co');
    expect(coDoc).toBeDefined();
    expect(coDoc?.statusText).toBe('작성 필요');
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

  it('모든 필수 항목이 올바르게 채워지면 송장, 패킹리스트, B/L은 완료(생성 완료) 상태여야 한다', () => {
    const docs = determineRequiredDocuments(mockValidProfile);
    
    const invoice = docs.find(d => d.id === 'invoice');
    const packing = docs.find(d => d.id === 'packing_list');
    const bl = docs.find(d => d.id === 'bl');

    expect(invoice?.status).toBe('completed');
    expect(packing?.status).toBe('completed');
    expect(bl?.status).toBe('completed');
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
    expect(result.hs.topCode).toBe('8517.62-0000');
    expect(result.hs.candidates.length).toBeGreaterThan(0);

    // 2. Documents 결과 검증 (CIF 조건이므로 보험증서 포함 총 6개)
    expect(result.documents.documents).toHaveLength(6);
    expect(result.documents.generatedDocs.invoice).toBeDefined();
    expect(result.documents.generatedDocs.packingList).toBeDefined();

    // 3. Issues 결과 검증 (중량 누락 경고 확인)
    const weightIssue = result.issues.issues.find(i => i.id === 'weight-missing');
    expect(weightIssue).toBeDefined();

    // 4. Feedback 결과 검증
    expect(result.feedback.message).toContain('IT 기기');
    expect(result.feedback.message).toContain('중량');

    // 5. 전체 실행 로그 확인
    expect(result.logs.length).toBeGreaterThan(0);
    const startLog = result.logs.find(l => l.message.includes('가동 시작'));
    expect(startLog).toBeDefined();
  });

  it('CIF 조건의 경우 적하보험증권 누락 에러 및 책임 안내 피드백이 발생한다', async () => {
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
    const insuranceDoc = result.documents.documents.find(d => d.id === 'insurance');
    expect(insuranceDoc).toBeDefined();

    // 누락 에러 검증
    const insuranceIssue = result.issues.issues.find(i => i.id === 'insurance-missing');
    expect(insuranceIssue).toBeDefined();
    expect(insuranceIssue?.severity).toBe('error');

    // 피드백 검증
    expect(result.feedback.message).toContain('적하보험증권을 준비하세요');
  });

  it('EXW 조건의 경우 B/L이 비필수(not_needed) 처리되고 정보성 안내가 발생한다', async () => {
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

    // B/L 비필수 검증
    const blDoc = result.documents.documents.find(d => d.id === 'bl');
    expect(blDoc?.status).toBe('not_needed');

    // 정보성 알림 검증
    const exwIssue = result.issues.issues.find(i => i.id === 'exw-responsibility-info');
    expect(exwIssue).toBeDefined();
    expect(exwIssue?.severity).toBe('info');

    // 피드백 검증
    expect(result.feedback.message).toContain('공장 인도 조건입니다');
  });
});
