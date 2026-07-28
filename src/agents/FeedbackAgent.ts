import { Agent, FeedbackResult, AgentLog, createLog } from './types';
import { TradeProfile, ValidationIssue } from '../types';
import { generateContextualFeedback } from '../services/claudeService';

export class FeedbackAgent implements Agent<{ profile: TradeProfile; issues: ValidationIssue[]; useLLM?: boolean; logs: AgentLog[] }, FeedbackResult> {
  readonly name = 'Feedback Agent';

  async run(input: { profile: TradeProfile; issues: ValidationIssue[]; useLLM?: boolean; logs: AgentLog[] }): Promise<FeedbackResult> {
    const { profile, issues, useLLM = false, logs } = input;
    let message = '';

    logs.push(createLog(this.name, '발견된 이슈에 대한 사용자 피드백 생성 작업 시작...', 'info'));

    if (issues.length === 0) {
      message = '모든 통관 서류가 규정에 부합합니다. 추가 보완사항이 없습니다.';
      logs.push(createLog(this.name, '이슈가 없으므로 긍정적 피드백 반환.', 'success'));
      return { message };
    }

    if (useLLM) {
      logs.push(createLog(this.name, 'OpenAI에 문맥 기반 피드백 생성 요청 중...', 'info'));
      try {
        message = await generateContextualFeedback(
          {
            tradeType: profile.tradeType,
            itemName: profile.itemName,
            incoterms: profile.incoterms,
            loadPort: profile.loadPort,
            dischargePort: profile.dischargePort
          },
          issues.map(i => i.message)
        );
        logs.push(createLog(this.name, 'AI 피드백 생성 완료.', 'success'));
      } catch (error) {
        logs.push(createLog(this.name, `AI 피드백 생성 실패, 폴백 시뮬레이션 실행: ${error instanceof Error ? error.message : String(error)}`, 'warning'));
        message = this.generateFallbackFeedback(profile, issues);
      }
    } else {
      logs.push(createLog(this.name, '로컬 룰 기반 가이드라인 피드백 생성 중...', 'info'));
      message = this.generateFallbackFeedback(profile, issues);
    }

    logs.push(createLog(this.name, '피드백 에이전트 작업 완료.', 'success'));

    let responsibilityNote = '';
    if (profile.incoterms === 'CIF') {
      responsibilityNote = '💡 [CIF 책임안내] 운임·보험을 도착항까지 매도인이 부담합니다. 적하보험증권을 준비하세요.\n\n';
    } else if (profile.incoterms === 'EXW') {
      responsibilityNote = '💡 [EXW 책임안내] 공장 인도 조건입니다. 이후 운송·통관은 매수인 책임입니다.\n\n';
    } else if (profile.incoterms === 'DDP') {
      responsibilityNote = '💡 [DDP 책임안내] 수입국 통관·관세까지 매도인 부담입니다. 수입국 규정을 확인하세요.\n\n';
    } else if (profile.incoterms === 'DAP') {
      responsibilityNote = '💡 [DAP 책임안내] 지정 목적지 도착까지 운송을 매도인이 부담합니다. 수입통관·관세는 매수인 몫입니다.\n\n';
    } else if (profile.incoterms === 'FCA') {
      responsibilityNote = '💡 [FCA 책임안내] 지정 장소에서 운송인에게 인도하면 위험이 이전됩니다. 이후 운송·보험은 매수인이 수배합니다.\n\n';
    }

    return { message: responsibilityNote + message };
  }

  private generateFallbackFeedback(profile: TradeProfile, issues: ValidationIssue[]): string {
    const tradeText = profile.tradeType === 'export' ? '수출' : '수입';
    const parts: string[] = [];

    parts.push(`[안내] ${profile.itemName || '품목'}을(를) ${profile.incoterms || '미지정'} 조건으로 ${profile.loadPort || '미지정항'}에서 ${tradeText}하시는 건에 대한 피드백입니다.\n`);
    
    for (const issue of issues) {
      if (issue.field === 'weight') {
        parts.push(`📦 [패킹리스트] 총중량(Gross Weight)과 순중량(Net Weight)이 누락되었습니다. kg 단위로 정확히 기입하셔야 세관 심사 시 보완 요구를 피할 수 있습니다.`);
      } else if (issue.field === 'hsCode') {
        parts.push(`🔢 [HS CODE] 관세율 및 수출입 요건을 결정하는 6자리 이상의 정확한 코드가 아닙니다. 품목 명칭과 매칭되는 정확한 HS CODE를 확인하여 채워주시기 바랍니다.`);
      } else if (issue.docType === 'co') {
        parts.push(`🌍 [원산지증명서] ${tradeText} 거래 시 특혜관세를 위해 원산지증명서(C/O) 발급 요건 충족 및 서류 등록을 준비하셔야 합니다.`);
      } else if (issue.field === 'loadPort' || issue.field === 'dischargePort') {
        parts.push(`⚓ [선하증권(B/L)] 해상 선적항 및 도착항 정보가 올바르게 입력되어야 B/L 문서가 정상 발행됩니다.`);
      } else {
        parts.push(`⚠️ [${issue.docType.toUpperCase()}] ${issue.message}`);
      }
    }

    return parts.join('\n');
  }
}
