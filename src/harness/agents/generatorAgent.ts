import { TradeProfile, DocumentStatus } from '../../types';
import { determineRequiredDocuments } from '../rulesEngine';

export interface AgentLog {
  timestamp: string;
  agentName: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface GenerationResult {
  documents: DocumentStatus[];
  logs: AgentLog[];
}

export class GeneratorAgent {
  private name = 'Server Document Generator Agent';

  public async generateDocuments(profile: TradeProfile): Promise<GenerationResult> {
    const logs: AgentLog[] = [];
    const addLog = (message: string, type: AgentLog['type'] = 'info') => {
      logs.push({
        timestamp: new Date().toLocaleTimeString(),
        agentName: this.name,
        message,
        type
      });
    };

    addLog('거래 정보 입력값 분석 시작...', 'info');
    
    // Simulate thinking/steps
    addLog(`수출입 유형 확인: ${profile.tradeType === 'export' ? '수출 (Export)' : '수입 (Import)'}`, 'info');
    addLog(`거래 조건 확인: ${profile.incoterms || '미지정'}`, 'info');
    addLog(`선적항: ${profile.loadPort || '미지정'}, 도착항: ${profile.dischargePort || '미지정'}`, 'info');

    // Determine documents
    const requiredDocs = determineRequiredDocuments(profile);
    
    addLog(`필요 서류 목록 식별 완료: ${requiredDocs.map(d => d.name).join(', ')}`, 'success');

    // Process each document
    for (const doc of requiredDocs) {
      if (doc.statusText === '해당 없음') {
        addLog(`${doc.name}: 현재 시나리오에서 제외됨`, 'info');
        continue;
      }

      addLog(`${doc.name} 템플릿 로딩 중...`, 'info');
      
      if (doc.id === 'invoice') {
        if (profile.itemName && profile.companyName && profile.incoterms) {
          addLog(`상업송장 데이터 매핑 완료 (품명: ${profile.itemName}, 거래처: ${profile.companyName})`, 'success');
        } else {
          addLog('상업송장 생성 중 필수 정보 누락 감지 (품명, 거래처 또는 인도조건)', 'warning');
        }
      } else if (doc.id === 'packing_list') {
        if (profile.quantity !== '' && profile.weight !== '') {
          addLog(`패킹리스트 중량/수량 데이터 매핑 완료 (${profile.quantity}개, ${profile.weight}kg)`, 'success');
        } else {
          addLog('패킹리스트 생성 중 중량 또는 수량 정보가 누락되어 검토가 필요합니다.', 'warning');
        }
      } else if (doc.id === 'bl') {
        if (profile.loadPort && profile.dischargePort) {
          addLog(`선하증권(B/L) 해상 경로 매핑 완료 (${profile.loadPort} -> ${profile.dischargePort})`, 'success');
        } else {
          addLog('선하증권 생성 실패: 선적항 또는 도착항 정보가 없습니다.', 'error');
        }
      } else if (doc.id === 'customs_dec') {
        if (profile.hsCode) {
          addLog(`통관신고서 HS Code 매핑 완료 (${profile.hsCode})`, 'success');
        } else {
          addLog('통관신고서 생성 실패: HS Code가 입력되지 않았습니다.', 'error');
        }
      } else if (doc.id === 'co') {
        addLog('원산지증명서 초안 생성 시작 (수출국 요건 확인 중...)', 'info');
      }
    }

    addLog('서버 문서 생성 에이전트 작업 완료.', 'success');

    return {
      documents: requiredDocs,
      logs
    };
  }
}
