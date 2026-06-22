import { TradeProfile, ValidationIssue } from '../../types';
import { validateTradeDocuments } from '../validatorEngine';
import { AgentLog } from './generatorAgent';

export interface TestingResult {
  issues: ValidationIssue[];
  logs: AgentLog[];
}

export class TestingAgent {
  private name = 'Document Testing Agent';

  public async testDocuments(profile: TradeProfile): Promise<TestingResult> {
    const logs: AgentLog[] = [];
    const addLog = (message: string, type: AgentLog['type'] = 'info') => {
      logs.push({
        timestamp: new Date().toLocaleTimeString(),
        agentName: this.name,
        message,
        type
      });
    };

    addLog('생성된 통관 문서의 정밀 검증 시작...', 'info');

    // Run validator rules
    const issues = validateTradeDocuments(profile);

    // Simulated step-by-step checks
    addLog('상업송장(Invoice) 필수 기재 항목 검증 중...', 'info');
    const invoiceIssues = issues.filter(i => i.docType === 'invoice');
    if (invoiceIssues.length === 0) {
      addLog('상업송장 적합성 검증 완료: 모든 필수 필드가 정확합니다.', 'success');
    } else {
      addLog(`상업송장 경고 감지: ${invoiceIssues.map(i => i.message).join(', ')}`, 'warning');
    }

    addLog('패킹리스트(Packing List) 중량 및 수량 대조 검사 중...', 'info');
    const packingIssues = issues.filter(i => i.docType === 'packing_list');
    if (packingIssues.length === 0) {
      addLog('패킹리스트 검증 완료: 수량 대비 총중량 정보가 일치합니다.', 'success');
    } else {
      for (const issue of packingIssues) {
        addLog(`검증 실패: ${issue.message}`, 'warning');
      }
    }

    addLog('선하증권(B/L) 항구 경로 정보 검사 중...', 'info');
    const blIssues = issues.filter(i => i.docType === 'bl');
    if (blIssues.length === 0) {
      addLog('선하증권 검증 완료: 유효한 해상 운송 루트가 정의되었습니다.', 'success');
    } else {
      addLog(`경로 오류 감지: ${blIssues.map(i => i.message).join(', ')}`, 'error');
    }

    addLog('통관신고서 및 관세청 연동 HS Code 유효성 심사 중...', 'info');
    const customsIssues = issues.filter(i => i.docType === 'customs_dec');
    if (customsIssues.length === 0) {
      addLog('통관신고 관련 검증 완료: 표준 HS CODE 포맷 확인.', 'success');
    } else {
      for (const issue of customsIssues) {
        addLog(`분석 결과 오류: ${issue.message}`, issue.severity === 'error' ? 'error' : 'warning');
      }
    }

    addLog('원산지증명서 발급 요건 및 규제 준수 여부 심사 중...', 'info');
    const coIssues = issues.filter(i => i.docType === 'co');
    if (coIssues.length === 0) {
      addLog('원산지증명서 상태 완료 또는 검증 통과.', 'success');
    } else {
      addLog(`규제 알림: ${coIssues.map(i => i.message).join(', ')}`, 'info');
    }

    addLog(`총 ${issues.length}건의 문서 이슈 및 보완 필요사항 발견.`, issues.length > 0 ? 'warning' : 'success');
    addLog('문서 검증 에이전트 작업 완료.', 'success');

    return {
      issues,
      logs
    };
  }
}
