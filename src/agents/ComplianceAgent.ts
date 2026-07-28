import { Agent, ComplianceResult, AgentLog, createLog, HSCodeResult } from './types';
import { TradeProfile, DocumentStatus, ValidationIssue } from '../types';
import { validateTradeDocumentsAsync } from '../harness/validatorEngine';
import { getRelatedLawForIssue } from '../services/lawService';
import { runComplianceRules } from './complianceRules';

export class ComplianceAgent implements Agent<{ profile: TradeProfile; documents: DocumentStatus[]; hsResult?: HSCodeResult; logs: AgentLog[] }, ComplianceResult> {
  readonly name = 'Compliance Agent';

  async run(input: { profile: TradeProfile; documents: DocumentStatus[]; hsResult?: HSCodeResult; logs: AgentLog[] }): Promise<ComplianceResult> {
    const { profile, hsResult, logs } = input;

    logs.push(createLog(this.name, '통관 서류 규정 및 필수 항목 검증 시작...', 'info'));

    // 룰 기반 검증 엔진 실행 (공통 비즈니스 규칙 + 환율·사업자 공공 API 검증)
    const issues: ValidationIssue[] = await validateTradeDocumentsAsync(profile);

    // R1~R8 통관 검증 룰 (원산지·품명충분성·Incoterms↔항구·운송수단·동일국가항구·HS단위·한글필드·금액산술)
    // 정책은 RULE_POLICY로 타입 강제(error=차단/overridable, warning=배지).
    issues.push(...runComplianceRules(profile, logs));

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

    // 근거 법령 표기 — validatorEngine의 주석 루프는 위 HS 이슈 push보다 먼저 끝나므로
    // 여기서 다시 적용해야 hscode-* 이슈에도 관세법 조문이 붙는다 (중복 방지 검사 포함)
    for (const issue of issues) {
      const law = getRelatedLawForIssue(issue.id);
      if (law && !issue.message.includes('근거:')) {
        issue.message += ` [근거: ${law.lawName} ${law.article}]`;
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
