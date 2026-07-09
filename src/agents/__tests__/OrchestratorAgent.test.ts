import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OrchestratorAgent } from '../OrchestratorAgent';
import { TradeProfile } from '../../types';
import { Agent, HSCodeResult, DocumentResult, ComplianceResult, FeedbackResult } from '../types';

// Mock agents
const createMockAgent = (name: string, result: any): Agent => ({
  name,
  run: vi.fn().mockResolvedValue(result)
});

// 모킹 결과를 실제 에이전트 계약 타입으로 선언 — 계약이 바뀌면 이 파일이 컴파일 단계에서 깨진다
const hsMockResult: HSCodeResult = {
  topCode: '847330',
  candidates: [
    { code: '8473.30', description: '사무용 기계의 부분품', confidence: '높음', reasoning: '모킹 후보 1' },
    { code: '8473.50', description: '기타 부분품과 부속품', confidence: '보통', reasoning: '모킹 후보 2' }
  ],
  status: 'valid',
  formattedCode: '8473.30',
  validationMessage: '유효한 HS CODE 형식입니다.'
};

const docMockResult: DocumentResult = {
  documents: [
    { id: 'invoice', name: '상업송장(Invoice)', status: 'completed', statusText: '생성 완료' },
    { id: 'packing_list', name: '패킹리스트(Packing List)', status: 'completed', statusText: '생성 완료' }
  ],
  generatedDocs: {},
  htmlTemplates: {}
};

const compMockResult: ComplianceResult = { issues: [] };

const feedMockResult: FeedbackResult = { message: '모든 통관 서류가 규정에 부합합니다.' };

describe('OrchestratorAgent', () => {
  let orchestrator: OrchestratorAgent;
  let mockHSCodeAgent: Agent;
  let mockDocumentAgent: Agent;
  let mockComplianceAgent: Agent;
  let mockFeedbackAgent: Agent;

  const validProfile: TradeProfile = {
    tradeType: 'export',
    itemName: '전자제품',
    hsCode: '847330',
    loadPort: 'KRPUS',
    dischargePort: 'USLAX',
    incoterms: 'CIF',
    quantity: 100,
    weight: 500,
    departureDate: '2026-07-10',
    arrivalDate: '2026-07-25',
    companyName: '테스트무역',
    contact: '010-0000-0000'
  };

  beforeEach(() => {
    mockHSCodeAgent = createMockAgent('HSCodeAgent', hsMockResult);
    mockDocumentAgent = createMockAgent('DocumentAgent', docMockResult);
    mockComplianceAgent = createMockAgent('ComplianceAgent', compMockResult);
    mockFeedbackAgent = createMockAgent('FeedbackAgent', feedMockResult);

    orchestrator = new OrchestratorAgent(
      { timeout: 5000, validateInput: true },
      mockHSCodeAgent,
      mockDocumentAgent,
      mockComplianceAgent,
      mockFeedbackAgent
    );
  });

  describe('정상 동작 케이스', () => {
    it('모든 에이전트가 성공적으로 완료되어야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      expect(result.hs).toBeDefined();
      expect(result.documents).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.feedback).toBeDefined();
      expect(result.executionId).toBeDefined();
      expect(result.logs.length).toBeGreaterThan(0);
    });

    it('HS Code가 없을 때 추천 코드를 자동 보완해야 함', async () => {
      const profileWithoutHS = { ...validProfile, hsCode: '' };
      const result = await orchestrator.run({ profile: profileWithoutHS, useLLM: false });

      expect(result.hs?.topCode).toBe('847330');
      const logMessages = result.logs.map(l => l.message);
      expect(logMessages.some(msg => msg.includes('자동 보완'))).toBe(true);

      // 보완된 코드가 하위 에이전트(DocumentAgent)에 실제로 전파되는지 검증
      expect(mockDocumentAgent.run).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({ hsCode: '847330' })
        })
      );
    });

    it('실행 시간을 기록해야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      expect(result.executionTime).toBeDefined();
      expect(typeof result.executionTime).toBe('number');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('LLM 옵션을 에이전트들에 전달해야 함', async () => {
      await orchestrator.run({ profile: validProfile, useLLM: true });

      expect(mockHSCodeAgent.run).toHaveBeenCalledWith(
        expect.objectContaining({ useLLM: true })
      );
    });

    it('로그에 executionId를 포함해야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      const firstLog = result.logs[0];
      expect(firstLog.message).toContain(result.executionId);
    });

    it('성공 로그 메시지를 기록해야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      expect(result.logs.some(log => log.level === 'success')).toBe(true);
    });
  });

  describe('에러 처리 - 에이전트 실패', () => {
    it('HSCodeAgent 실패 시 에러를 처리해야 함', async () => {
      const failingMockHSCodeAgent = createMockAgent('HSCodeAgent', null);
      (failingMockHSCodeAgent.run as any).mockRejectedValueOnce(new Error('HS Code lookup failed'));

      const orchestratorWithFailingAgent = new OrchestratorAgent(
        { timeout: 5000 },
        failingMockHSCodeAgent,
        mockDocumentAgent,
        mockComplianceAgent,
        mockFeedbackAgent
      );

      const result = await orchestratorWithFailingAgent.run({
        profile: validProfile,
        useLLM: false
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('HS Code 검증 실패');
      expect(result.logs.some(log => log.level === 'error')).toBe(true);
    });

    it('DocumentAgent 실패 시 에러를 처리해야 함', async () => {
      const failingMockDocumentAgent = createMockAgent('DocumentAgent', null);
      (failingMockDocumentAgent.run as any).mockRejectedValueOnce(
        new Error('Document generation failed')
      );

      const orchestratorWithFailingAgent = new OrchestratorAgent(
        { timeout: 5000 },
        mockHSCodeAgent,
        failingMockDocumentAgent,
        mockComplianceAgent,
        mockFeedbackAgent
      );

      const result = await orchestratorWithFailingAgent.run({
        profile: validProfile,
        useLLM: false
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('문서 생성 실패');
    });

    it('ComplianceAgent 실패 시 에러를 처리해야 함', async () => {
      const failingMockComplianceAgent = createMockAgent('ComplianceAgent', null);
      (failingMockComplianceAgent.run as any).mockRejectedValueOnce(
        new Error('Compliance check failed')
      );

      const orchestratorWithFailingAgent = new OrchestratorAgent(
        { timeout: 5000 },
        mockHSCodeAgent,
        mockDocumentAgent,
        failingMockComplianceAgent,
        mockFeedbackAgent
      );

      const result = await orchestratorWithFailingAgent.run({
        profile: validProfile,
        useLLM: false
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('규정 검증 실패');
    });

    it('FeedbackAgent 실패 시 에러를 처리해야 함', async () => {
      const failingMockFeedbackAgent = createMockAgent('FeedbackAgent', null);
      (failingMockFeedbackAgent.run as any).mockRejectedValueOnce(
        new Error('Feedback generation failed')
      );

      const orchestratorWithFailingAgent = new OrchestratorAgent(
        { timeout: 5000 },
        mockHSCodeAgent,
        mockDocumentAgent,
        mockComplianceAgent,
        failingMockFeedbackAgent
      );

      const result = await orchestratorWithFailingAgent.run({
        profile: validProfile,
        useLLM: false
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('피드백 생성 실패');
    });
  });

  describe('입력값 검증', () => {
    it('itemName이 없으면 검증 오류를 반환해야 함', async () => {
      const invalidProfile = { ...validProfile, itemName: '' };
      const result = await orchestrator.run({ profile: invalidProfile, useLLM: false });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('상품명');
    });

    it('itemName이 너무 길면 검증 오류를 반환해야 함', async () => {
      const invalidProfile = {
        ...validProfile,
        itemName: 'a'.repeat(501)
      };
      const result = await orchestrator.run({ profile: invalidProfile, useLLM: false });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('500자');
    });

    it('HS Code 형식이 잘못되어도 파이프라인은 계속 진행해야 함 (HSCodeAgent에 위임)', async () => {
      const invalidProfile = { ...validProfile, hsCode: 'ABC123' };
      const result = await orchestrator.run({ profile: invalidProfile, useLLM: false });

      expect(result.error).toBeUndefined();
      expect(result.hs).toBeDefined();
      expect(
        result.logs.some(log => log.level === 'warning' && log.message.includes('HS Code'))
      ).toBe(true);
    });

    it('profile이 null이면 검증 오류를 반환해야 함', async () => {
      const result = await orchestrator.run({ profile: null as any, useLLM: false });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Profile');
    });

    it('검증 비활성화 시 입력값을 검증하지 않아야 함', async () => {
      const orchestratorNoValidation = new OrchestratorAgent(
        { timeout: 5000, validateInput: false },
        mockHSCodeAgent,
        mockDocumentAgent,
        mockComplianceAgent,
        mockFeedbackAgent
      );

      const invalidProfile = { ...validProfile, itemName: '' };
      const result = await orchestratorNoValidation.run({
        profile: invalidProfile,
        useLLM: false
      });

      // 주의: 실패 경로에서도 result.hs는 null로 채워져 toBeDefined()가 통과하므로
      // 파이프라인이 실제로 성공했는지(error 없음 + 에이전트 실행됨)를 검증해야 한다.
      expect(result.error).toBeUndefined();
      expect(result.hs?.topCode).toBe('847330');
      expect(mockHSCodeAgent.run).toHaveBeenCalled();
    });
  });

  describe('엣지 케이스', () => {
    it('공백 문자열만 있는 상품명을 처리해야 함', async () => {
      const profileWithEmptyFields = {
        ...validProfile,
        itemName: '   '
      };
      const result = await orchestrator.run({
        profile: profileWithEmptyFields,
        useLLM: false
      });

      expect(result.error).toBeDefined();
    });

    it('특수 문자를 포함한 itemName을 처리해야 함', async () => {
      const profileWithSpecialChars = {
        ...validProfile,
        itemName: '전자제품-ABC_123 (Spec)'
      };
      const result = await orchestrator.run({
        profile: profileWithSpecialChars,
        useLLM: false
      });

      expect(result.error).toBeUndefined();
      expect(result.hs?.topCode).toBe('847330');
    });

    it('매우 긴 HS Code는 경고 후 계속 진행해야 함', async () => {
      const profileWithLongHSCode = {
        ...validProfile,
        hsCode: '12345678901' // 11자리
      };
      const result = await orchestrator.run({
        profile: profileWithLongHSCode,
        useLLM: false
      });

      expect(result.error).toBeUndefined();
      expect(
        result.logs.some(log => log.level === 'warning' && log.message.includes('HS Code'))
      ).toBe(true);
    });

    it('HS Code가 null 값을 반환할 때 처리해야 함', async () => {
      const mockHSCodeAgentReturningNull = createMockAgent('HSCodeAgent', {
        topCode: null
      });

      const orchestratorWithNullHSCode = new OrchestratorAgent(
        { timeout: 5000 },
        mockHSCodeAgentReturningNull,
        mockDocumentAgent,
        mockComplianceAgent,
        mockFeedbackAgent
      );

      const profileWithoutHS = { ...validProfile, hsCode: '' };
      const result = await orchestratorWithNullHSCode.run({
        profile: profileWithoutHS,
        useLLM: false
      });

      expect(result.error).toBeDefined();
    });
  });

  describe('타임아웃', () => {
    it('타임아웃 설정이 올바르게 적용되어야 함', async () => {
      const slowMockAgent = createMockAgent('SlowAgent', {
        topCode: '847330'
      });

      (slowMockAgent.run as any).mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve({}), 6000))
      );

      const orchestratorWithShortTimeout = new OrchestratorAgent(
        { timeout: 1000 },
        slowMockAgent,
        mockDocumentAgent,
        mockComplianceAgent,
        mockFeedbackAgent
      );

      const result = await orchestratorWithShortTimeout.run({
        profile: validProfile,
        useLLM: false
      });

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('타임아웃');
    });
  });

  describe('로깅', () => {
    it('각 단계별 로그를 기록해야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      const logs = result.logs;
      expect(logs.some(l => l.message.includes('가동 시작'))).toBe(true);
      expect(logs.some(l => l.message.includes('완료'))).toBe(true);
    });

    it('에러 발생 시 에러 로그를 기록해야 함', async () => {
      const invalidProfile = { ...validProfile, itemName: '' };
      const result = await orchestrator.run({ profile: invalidProfile, useLLM: false });

      expect(result.logs.some(log => log.level === 'error')).toBe(true);
    });

    it('로그에 타임스탐프를 포함해야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      expect(result.logs[0].timestamp).toBeDefined();
      expect(typeof result.logs[0].timestamp).toBe('string');
    });
  });

  describe('동시성', () => {
    it('동시에 여러 요청을 처리할 수 있어야 함', async () => {
      const promises = Array.from({ length: 3 }, (_, i) => ({
        ...validProfile,
        itemName: `상품${i}`
      })).map(profile => orchestrator.run({ profile, useLLM: false }));

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.executionId).toBeDefined();
        expect(result.error).toBeUndefined();
        expect(result.hs?.topCode).toBe('847330');
      });

      // 각 실행이 고유한 executionId를 가져야 함
      const executionIds = results.map(r => r.executionId);
      const uniqueIds = new Set(executionIds);
      expect(uniqueIds.size).toBe(3);
    });
  });

  describe('성능', () => {
    it('합리적인 시간 내에 완료되어야 함', async () => {
      const result = await orchestrator.run({ profile: validProfile, useLLM: false });

      expect(result.executionTime).toBeLessThan(5000);
    });

    it('대량의 문서를 처리할 수 있어야 함', async () => {
      const largeDocumentResult: DocumentResult = {
        documents: Array.from({ length: 100 }, (_, i) => ({
          id: `doc_${i}`,
          name: `문서 ${i}`,
          status: 'completed' as const,
          statusText: '생성 완료'
        })),
        generatedDocs: {},
        htmlTemplates: {}
      };

      const mockLargeDocumentAgent = createMockAgent('DocumentAgent', largeDocumentResult);
      const orchestratorWithLargeData = new OrchestratorAgent(
        { timeout: 10000 },
        mockHSCodeAgent,
        mockLargeDocumentAgent,
        mockComplianceAgent,
        mockFeedbackAgent
      );

      const result = await orchestratorWithLargeData.run({
        profile: validProfile,
        useLLM: false
      });

      expect(result.documents?.documents.length).toBe(100);
    });
  });
});
