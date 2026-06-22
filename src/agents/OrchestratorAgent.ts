import { Agent, OrchestratorResult, AgentLog, createLog } from './types';
import { TradeProfile } from '../types';
import { HSCodeAgent } from './HSCodeAgent';
import { DocumentAgent } from './DocumentAgent';
import { ComplianceAgent } from './ComplianceAgent';
import { FeedbackAgent } from './FeedbackAgent';

export class OrchestratorAgent implements Agent<{ profile: TradeProfile; useLLM?: boolean }, OrchestratorResult> {
  readonly name = 'Orchestrator Agent';

  private hsCodeAgent = new HSCodeAgent();
  private documentAgent = new DocumentAgent();
  private complianceAgent = new ComplianceAgent();
  private feedbackAgent = new FeedbackAgent();

  async run(input: { profile: TradeProfile; useLLM?: boolean }): Promise<OrchestratorResult> {
    const { profile, useLLM = false } = input;
    const logs: AgentLog[] = [];

    logs.push(createLog(this.name, '오케스트레이터 파이프라인 가동 시작...', 'info'));

    // 1. HSCodeAgent 실행 (품목명 및 기입력 HS Code -> 검증 및 추천)
    const hsResult = await this.hsCodeAgent.run({ itemName: profile.itemName, hsCode: profile.hsCode, useLLM, logs });

    // 2. 프로필 보완: 입력된 HS Code가 없다면 추천된 상위 코드를 적용
    const updatedProfile: TradeProfile = {
      ...profile,
      hsCode: profile.hsCode || hsResult.topCode
    };

    if (!profile.hsCode && hsResult.topCode) {
      logs.push(createLog(this.name, `프로필에 HS Code가 누락되어 추천 상위 코드 "${hsResult.topCode}"을(를) 자동 보완했습니다.`, 'info'));
    }

    // 3. DocumentAgent 실행 (필요 서류 식별 및 실제 본문 데이터 생성)
    const docResult = await this.documentAgent.run({ profile: updatedProfile, hsResult, useLLM, logs });

    // 4. ComplianceAgent 실행 (작성된 서류의 누락/규정 미비 여부 검증)
    const compResult = await this.complianceAgent.run({ profile: updatedProfile, documents: docResult.documents, hsResult, logs });

    // 5. FeedbackAgent 실행 (검증 결과를 토대로 사용자용 피드백 안내 생성)
    const feedResult = await this.feedbackAgent.run({ profile: updatedProfile, issues: compResult.issues, useLLM, logs });

    logs.push(createLog(this.name, '오케스트레이터 전체 에이전트 협업 루프 완료.', 'success'));

    return {
      hs: hsResult,
      documents: docResult,
      issues: compResult,
      feedback: feedResult,
      logs
    };
  }
}
