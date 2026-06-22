import { TradeProfile, ValidationIssue } from '../types';
import { getIncotermsRule } from '../agents/incotermsRules';

export function validateTradeDocuments(profile: TradeProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1. 패킹리스트 - 중량 검증
  const hasPackingQty = profile.quantity !== '' && profile.quantity > 0;
  const hasPackingWeight = profile.weight !== '' && profile.weight > 0;

  if (hasPackingQty && !hasPackingWeight) {
    issues.push({
      id: 'weight-missing',
      docType: 'packing_list',
      severity: 'warning',
      message: '패킹리스트: 중량 정보 확인 필요 (총 중량 또는 순중량 정보의 확인이 필요합니다.)',
      field: 'weight'
    });
  }

  // 2. 통관신고서 - HS CODE 검증 (HSCodeAgent에서 처리하므로 여기서는 중복 제거)

  // 3. 원산지증명서 - 작성 여부 검증
  if (profile.tradeType === 'export' && !profile.companyName.includes('산')) {
    issues.push({
      id: 'co-required',
      docType: 'co',
      severity: 'info',
      message: '원산지증명서: 작성 필요 (원산지증명서 작성을 진행해 주세요.)',
      field: 'tradeType'
    });
  }

  // 4. 선하증권 (B/L) - 항구 검증 (EXW 조건이 아닐 때만 항구 누락을 에러로 잡음)
  const isEXW = profile.incoterms === 'EXW';
  if (!isEXW && (!profile.loadPort || !profile.dischargePort)) {
    issues.push({
      id: 'ports-missing',
      docType: 'bl',
      severity: 'error',
      message: '선하증권(B/L): 선적항 및 도착항 정보 누락 (해상 운송 경로 설정이 완료되지 않았습니다.)',
      field: 'loadPort'
    });
  }

  // 5. Incoterms 조건별 검증 규칙 추가
  const rule = getIncotermsRule(profile.incoterms);
  if (rule) {
    // CIF 조건인 경우 적하보험증권 누락 에러
    if (rule.incoterm === 'CIF') {
      issues.push({
        id: 'insurance-missing',
        docType: 'insurance',
        severity: 'error',
        message: '적하보험증권: 필수 누락 (CIF 조건은 적하보험증권 필수입니다. 적하보험증권을 준비하세요.)',
        field: 'incoterms'
      });
    }

    // EXW 조건인 경우 정보성 알림
    if (rule.incoterm === 'EXW') {
      issues.push({
        id: 'exw-responsibility-info',
        docType: 'invoice',
        severity: 'info',
        message: '공장 인도(EXW) 조건 안내: 매수인이 운송 및 수출 통관 책임을 전적으로 부담합니다.',
        field: 'incoterms'
      });
    }

    // FOB/CIF(해상 전용)인데 운송 맥락 불일치 (선적항/도착항 입력값에 '항' 자가 없는 경우 자문 경고)
    if (rule.transportMode === 'sea') {
      const isLoadPortSea = !profile.loadPort || profile.loadPort.endsWith('항');
      const isDischargePortSea = !profile.dischargePort || profile.dischargePort.endsWith('항');
      if (!isLoadPortSea || !isDischargePortSea) {
        issues.push({
          id: 'transport-context-mismatch',
          docType: 'bl',
          severity: 'info', // 자문 경고 (info/advisory)
          message: '운송 맥락 불일치 경고: FOB/CIF 조건은 해상 운송 전용이므로 선적항/도착항은 항구여야 합니다.',
          field: 'loadPort'
        });
      }
    }
  }

  return issues;
}
