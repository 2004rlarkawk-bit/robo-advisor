import { TradeProfile, ValidationIssue } from '../types';

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

  // 2. 통관신고서 - HS CODE 검증
  if (profile.hsCode) {
    const cleanHSCode = profile.hsCode.replace(/-/g, '');
    const isNumeric = /^\d+$/.test(cleanHSCode);
    if (!isNumeric || cleanHSCode.length < 6) {
      issues.push({
        id: 'hscode-invalid',
        docType: 'customs_dec',
        severity: 'warning',
        message: '통관신고서: HS CODE 검토 필요 (HS CODE의 정확성 검토가 필요합니다.)',
        field: 'hsCode'
      });
    }
  } else {
    issues.push({
      id: 'hscode-missing',
      docType: 'customs_dec',
      severity: 'error',
      message: '통관신고서: HS CODE 입력 필요 (수출입 신고를 위한 HS CODE 정보가 누락되었습니다.)',
      field: 'hsCode'
    });
  }

  // 3. 원산지증명서 - 작성 여부 검증
  if (profile.tradeType === 'export') {
    // 수출인데 원산지증명서 서류가 완료되지 않은 경우 (가상으로 시뮬레이션)
    // 원산지 정보가 없거나 회사명이 없는 경우 등
    issues.push({
      id: 'co-required',
      docType: 'co',
      severity: 'info',
      message: '원산지증명서: 작성 필요 (원산지증명서 작성을 진행해 주세요.)',
      field: 'tradeType'
    });
  }

  // 4. 선하증권 (B/L) - 항구 검증
  if (!profile.loadPort || !profile.dischargePort) {
    issues.push({
      id: 'ports-missing',
      docType: 'bl',
      severity: 'error',
      message: '선하증권(B/L): 선적항 및 도착항 정보 누락 (해상 운송 경로 설정이 완료되지 않았습니다.)',
      field: 'loadPort'
    });
  }

  return issues;
}
