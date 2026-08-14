import { Agent, ComplianceResult, AgentLog, createLog, HSCodeResult } from './types';
import { TradeProfile, DocumentStatus, ValidationIssue, GeneratedDocuments } from '../types';
import { validateTradeDocumentsAsync } from '../harness/validatorEngine';
import { getRelatedLawForIssue } from '../services/lawService';
import { runComplianceRules, checkPackingInvoiceConsistency } from './complianceRules';

export class ComplianceAgent implements Agent<{ profile: TradeProfile; documents: DocumentStatus[]; hsResult?: HSCodeResult; generatedDocs?: GeneratedDocuments; logs: AgentLog[] }, ComplianceResult> {
  readonly name = 'Compliance Agent';

  async run(input: { profile: TradeProfile; documents: DocumentStatus[]; hsResult?: HSCodeResult; generatedDocs?: GeneratedDocuments; logs: AgentLog[] }): Promise<ComplianceResult> {
    const { profile, hsResult, generatedDocs, logs } = input;

    logs.push(createLog(this.name, '통관 서류 규정 및 필수 항목 검증 시작...', 'info'));

    // 룰 기반 검증 엔진 실행 (공통 비즈니스 규칙 + 환율·사업자 공공 API 검증)
    const issues: ValidationIssue[] = await validateTradeDocumentsAsync(profile);

    // R1~R8 통관 검증 룰 (원산지·품명충분성·Incoterms↔항구·운송수단·동일국가항구·HS단위·한글필드·금액산술)
    // 정책은 RULE_POLICY로 타입 강제(error=차단/overridable, warning=배지).
    issues.push(...runComplianceRules(profile, logs));

    // R10. 패킹리스트 ↔ 상업송장 교차 대조 (두 문서가 모두 생성된 경우에만)
    if (generatedDocs?.invoice && generatedDocs?.packingList) {
      issues.push(...checkPackingInvoiceConsistency(generatedDocs.invoice, generatedDocs.packingList, logs));
    }

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
      if (law) {
        // 구조화 근거(배지 렌더용) — card가 이미 자체 basis를 가지면 덮어쓰지 않는다.
        // summary 를 함께 넘겨 UI 에서 접이식 상세 조문 설명을 노출한다.
        if (!issue.basis && !issue.card) issue.basis = { label: '근거', law: `${law.lawName} ${law.article}`, summary: law.summary };
        // 문자열 접미사(레거시 내러티브·테스트 호환)
        if (!issue.message.includes('근거:')) issue.message += ` [근거: ${law.lawName} ${law.article}]`;
      }
    }

    // 각 문서 카테고리별 검증 리포트 작성 및 로그 생성
    const docTypes = ['invoice', 'packing_list', 'transport_request', 'customs_dec', 'co'] as const;
    const docNames: Record<string, string> = {
      invoice: '상업송장(Invoice)',
      packing_list: '패킹리스트(Packing List)',
      bl: '선하증권(B/L)',
      transport_request: '수출 운송의뢰서(Transport Request)',
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
