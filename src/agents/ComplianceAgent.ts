import { Agent, ComplianceResult, AgentLog, createLog, HSCodeResult } from './types';
import { TradeProfile, DocumentStatus, ValidationIssue } from '../types';
import { validateTradeDocumentsAsync } from '../harness/validatorEngine';

export class ComplianceAgent implements Agent<{ profile: TradeProfile; documents: DocumentStatus[]; hsResult?: HSCodeResult; logs: AgentLog[] }, ComplianceResult> {
  readonly name = 'Compliance Agent';

  async run(input: { profile: TradeProfile; documents: DocumentStatus[]; hsResult?: HSCodeResult; logs: AgentLog[] }): Promise<ComplianceResult> {
    const { profile, hsResult, logs } = input;

    logs.push(createLog(this.name, '통관 서류 규정 및 필수 항목 검증 시작...', 'info'));

    // 룰 기반 검증 엔진 실행 (공통 비즈니스 규칙 + 환율·사업자 공공 API 검증)
    const issues: ValidationIssue[] = await validateTradeDocumentsAsync(profile);

    // HSCodeAgent의 검증 결과를 통합
    if (hsResult) {
      if (hsResult.status === 'invalid') {
        const isMissing = !profile.hsCode || profile.hsCode.trim() === '';
        issues.push({
          id: isMissing ? 'hscode-missing' : 'hscode-invalid',
          docType: 'customs_dec',
          severity: isMissing ? 'error' : 'warning',
          message: `통관신고서: HS CODE ${isMissing ? '입력 필요' : '검토 필요'} (${hsResult.validationMessage || (isMissing ? '수출입 신고를 위한 HS CODE 정보가 누락되었습니다.' : 'HS CODE의 정확성 검토가 필요합니다.')})`,
          field: 'hsCode'
        });
      } else if (hsResult.status === 'needs_review') {
        issues.push({
          id: 'hscode-invalid',
          docType: 'customs_dec',
          severity: 'warning',
          message: `통관신고서: HS CODE 검토 필요 (${hsResult.validationMessage || '특수 범위의 Chapter 코드입니다.'})`,
          field: 'hsCode'
        });
      }
    }

    // 각 문서 카테고리별 검증 리포트 작성 및 로그 생성
    const docTypes = ['invoice', 'packing_list', 'bl', 'customs_dec', 'co'] as const;
    const docNames: Record<string, string> = {
      invoice: '상업송장(Invoice)',
      packing_list: '패킹리스트(Packing List)',
      bl: '선하증권(B/L)',
      customs_dec: '통관신고서',
      co: '원산지증명서(C/O)'
    };

    for (const docType of docTypes) {
      logs.push(createLog(this.name, `${docNames[docType]} 검증 중...`, 'info'));
      const docIssues = issues.filter(i => i.docType === docType);
      
      if (docIssues.length === 0) {
        logs.push(createLog(this.name, `${docNames[docType]} ✓ 검증 통과`, 'success'));
      } else {
        for (const issue of docIssues) {
          logs.push(createLog(this.name, `${docNames[docType]} — ${issue.message}`, 
            issue.severity === 'error' ? 'error' : 'warning'));
        }
      }
    }

    logs.push(createLog(this.name, `총 ${issues.length}건의 규정 미비점 발견.`, issues.length > 0 ? 'warning' : 'success'));
    logs.push(createLog(this.name, '규정 검증 에이전트 작업 완료.', 'success'));

    return {
      issues
    };
  }
}
