import { Agent, ComplianceResult, AgentLog, createLog, HSCodeResult } from './types';
import { TradeProfile, DocumentStatus, ValidationIssue, GeneratedDocuments } from '../types';
import { validateTradeDocumentsAsync } from '../harness/validatorEngine';
import { getRelatedLawForIssue } from '../services/lawService';
import { runComplianceRules, checkPackingInvoiceConsistency, checkHsChapterMismatch } from './complianceRules';
import { loadPortData } from '../services/portLocodeService';
import { collectAnomalyFields, flagFieldAnomalies } from '../services/fieldAnomalyService';

interface ComplianceInput {
  profile: TradeProfile;
  documents: DocumentStatus[];
  hsResult?: HSCodeResult;
  generatedDocs?: GeneratedDocuments;
  /** true 면 회사명·주소·품명 같은 자유 텍스트를 LLM 에 보내 이상치를 추가로 본다(실패해도 무시). */
  useLLM?: boolean;
  logs: AgentLog[];
}

export class ComplianceAgent implements Agent<ComplianceInput, ComplianceResult> {
  readonly name = 'Compliance Agent';

  async run(input: ComplianceInput): Promise<ComplianceResult> {
    const { profile, hsResult, generatedDocs, useLLM = false, logs } = input;

    logs.push(createLog(this.name, '통관 서류 규정 및 필수 항목 검증 시작...', 'info'));

    // UN/LOCODE 항구 사전을 먼저 준비한다(1회 fetch 후 캐시). 실패해도 룰은 정규식 폴백으로 진행.
    const ports = await loadPortData();
    if (ports.length) logs.push(createLog(this.name, `UN/LOCODE 항구 사전 ${ports.length.toLocaleString()}건 준비 — 항구명 실존·국가 대조에 사용`, 'info'));

    // 룰 기반 검증 엔진 실행 (공통 비즈니스 규칙 + 환율·사업자 공공 API 검증)
    const issues: ValidationIssue[] = await validateTradeDocumentsAsync(profile);

    // R1~R8 통관 검증 룰 (원산지·품명충분성·Incoterms↔항구·운송수단·동일국가항구·HS단위·한글필드·금액산술)
    // 정책은 RULE_POLICY로 타입 강제(error=차단/overridable, warning=배지).
    issues.push(...runComplianceRules(profile, logs));

    // R10. 패킹리스트 ↔ 상업송장 교차 대조 (두 문서가 모두 생성된 경우에만)
    if (generatedDocs?.invoice && generatedDocs?.packingList) {
      issues.push(...checkPackingInvoiceConsistency(generatedDocs.invoice, generatedDocs.packingList, logs));
    }

    // HSCodeAgent의 검증 결과를 통합.
    // 수출은 화주 폼에서 HS Code 입력 시 추천·재추천·되묻기로 이미 안내하므로 결과 화면에서
    // HS 항목(미입력·형식 검토·R17 류 불일치)을 다시 띄우지 않는다(2026-09-15 결정). 수입 경로는 그대로 둔다.
    if (hsResult && profile.tradeType !== 'export') {
      // R17. 품명 기반 추천 분류와 입력 코드의 류(Chapter) 대조 — 복붙·앞자리 착각 검출
      issues.push(...checkHsChapterMismatch(profile, hsResult, logs));

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

    // LLM 보조 검증 — 룰이 못 보는 자유 텍스트(회사명·주소·품명)의 임시값·필드 뒤바뀜을 "AI 참고"로 안내한다.
    // 생성을 막지 않는 warning 이며, API 실패·시간 초과 시 조용히 건너뛴다.
    if (useLLM) {
      const fields = collectAnomalyFields(profile);
      if (fields.length) {
        try {
          const anomalies = await flagFieldAnomalies(fields);
          logs.push(createLog(this.name, `AI 자유 텍스트 검토 ${fields.length}개 항목 — 이상 ${anomalies.length}건`, 'info'));
          for (const anomaly of anomalies) {
            const label = fields.find((entry) => entry.field === anomaly.field)?.label ?? anomaly.field;
            const isItem = /itemName/.test(anomaly.field);
            issues.push({
              id: `llm-anomaly-${anomaly.field}`,
              docType: 'invoice',
              // 다품목 필드("shipperItems.1.itemName")는 폼 이동용으로 itemName 으로 묶는다.
              field: isItem ? 'itemName' : anomaly.field,
              severity: 'warning',
              title: 'AI 참고',
              message: `AI 참고 — ${label}: ${anomaly.reason}`,
            });
          }
        } catch (error) {
          logs.push(createLog(this.name, `AI 자유 텍스트 검토 건너뜀 — ${error instanceof Error ? error.message : String(error)}`, 'warning'));
        }
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
