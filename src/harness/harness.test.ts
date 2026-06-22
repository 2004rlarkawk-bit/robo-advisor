import { describe, it, expect } from 'vitest';
import { determineRequiredDocuments } from './rulesEngine';
import { validateTradeDocuments } from './validatorEngine';
import { GeneratorAgent } from './agents/generatorAgent';
import { TestingAgent } from './agents/testingAgent';
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

  it('HS Code가 숫자가 아니거나 6자리 미만이면 통관신고서 검토 필요 경고가 발생한다', () => {
    const invalidHSProfile: TradeProfile = {
      ...mockValidProfile,
      hsCode: 'ABC-12' // 잘못된 HS Code
    };

    const issues = validateTradeDocuments(invalidHSProfile);
    const hsIssue = issues.find(i => i.id === 'hscode-invalid');
    expect(hsIssue).toBeDefined();
    expect(hsIssue?.severity).toBe('warning');
    expect(hsIssue?.message).toContain('HS CODE 검토 필요');
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

  it('문서 생성 및 테스트 에이전트가 에러 없이 작업 일지를 생성하고 결과를 연계한다', async () => {
    const genAgent = new GeneratorAgent();
    const testAgent = new TestingAgent();

    // 1. Generator Agent 실행
    const genResult = await genAgent.generateDocuments(testProfile);
    expect(genResult.documents).toHaveLength(5);
    expect(genResult.logs.length).toBeGreaterThan(0);
    
    // 생성 에이전트 로그 확인
    const startLog = genResult.logs.find(l => l.message.includes('시작'));
    expect(startLog).toBeDefined();

    // 2. Testing Agent 실행
    const testResult = await testAgent.testDocuments(testProfile);
    expect(testResult.logs.length).toBeGreaterThan(0);

    // 중량 누락 경고가 포함되어 있는지 검증
    const weightWarning = testResult.issues.find(i => i.id === 'weight-missing');
    expect(weightWarning).toBeDefined();
    
    const warningLog = testResult.logs.find(l => l.type === 'warning' && l.message.includes('검증 실패'));
    expect(warningLog).toBeDefined();
  });
});
