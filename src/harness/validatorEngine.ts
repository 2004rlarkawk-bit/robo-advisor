import { TradeProfile, ValidationIssue } from '../types';
import { getIncotermsRule } from '../agents/incotermsRules';
import { calcDutiableValue, verifyBusinessRegistration } from '../services/customsApiService';

/**
 * 거래정보 입력값 검증 (팀원 Python 스펙 "거래정보 입력값 검증 모듈" 포팅)
 * 1) 필수 항목 누락 체크
 * 2) 숫자 항목(수량·중량)은 0보다 커야 함
 * 3) 도착예정일이 출발일보다 빠르면 오류
 *
 * 중량 누락·항구 누락·HS코드는 기존 룰(validateTradeDocuments/HSCodeAgent)이
 * 전담하므로 여기서 중복 발행하지 않는다.
 */
export function validateRequiredInputs(profile: TradeProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1) 필수 항목 누락 (값이 없거나 빈 문자열이면 누락)
  const required: { field: keyof TradeProfile; label: string; docType: ValidationIssue['docType'] }[] = [
    { field: 'itemName', label: '품목명', docType: 'invoice' },
    { field: 'incoterms', label: '거래조건(Incoterms)', docType: 'invoice' },
    { field: 'quantity', label: '화물 수량', docType: 'packing_list' },
    { field: 'departureDate', label: '출발일', docType: 'bl' },
    { field: 'arrivalDate', label: '도착예정일', docType: 'bl' },
    { field: 'companyName', label: '업체명', docType: 'invoice' },
    { field: 'partnerName', label: '거래처명(Consignee)', docType: 'invoice' },
    { field: 'contact', label: '담당자 연락처', docType: 'invoice' },
  ];

  for (const { field, label, docType } of required) {
    const value = profile[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      issues.push({
        id: `input-missing-${field}`,
        docType,
        severity: 'error',
        message: `${label}이(가) 입력되지 않았습니다.`,
        field
      });
    }
  }

  // 2) 숫자 항목은 0보다 커야 함 (입력된 경우에만 — 누락은 위/기존 룰이 처리)
  const numericChecks: { field: 'quantity' | 'weight'; label: string; docType: ValidationIssue['docType'] }[] = [
    { field: 'quantity', label: '화물 수량', docType: 'packing_list' },
    { field: 'weight', label: '중량(kg)', docType: 'packing_list' },
  ];

  for (const { field, label, docType } of numericChecks) {
    const value = profile[field];
    if (value !== '' && value !== undefined) {
      const num = Number(value);
      if (Number.isNaN(num)) {
        issues.push({
          id: `input-nan-${field}`,
          docType,
          severity: 'error',
          message: `${label}은(는) 숫자로 입력해야 합니다.`,
          field
        });
      } else if (num <= 0) {
        issues.push({
          id: `input-nonpositive-${field}`,
          docType,
          severity: 'error',
          message: `${label}은(는) 0보다 커야 합니다.`,
          field
        });
      }
    }
  }

  // 3) 날짜 순서 확인 (도착예정일이 출발일보다 빠르면 오류)
  if (profile.departureDate && profile.arrivalDate && profile.departureDate > profile.arrivalDate) {
    issues.push({
      id: 'input-date-order',
      docType: 'bl',
      severity: 'error',
      message: '도착예정일이 출발일보다 빠를 수 없습니다.',
      field: 'arrivalDate'
    });
  }

  return issues;
}

export function validateTradeDocuments(profile: TradeProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [...validateRequiredInputs(profile)];

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

/**
 * 공공 API 기반 비동기 검증 (동기 룰 + 환율·사업자 룰).
 * API 키 미설정/호출 실패 시에도 시뮬레이션 폴백으로 항상 완료됨.
 */
export async function validateTradeDocumentsAsync(profile: TradeProfile): Promise<ValidationIssue[]> {
  const issues = validateTradeDocuments(profile);

  // 6. 외화 인보이스 → 관세청 주간환율 기준 원화 과세가격 환산 안내
  const currency = profile.currency || 'KRW';
  const amount = profile.invoiceAmount !== '' && profile.invoiceAmount !== undefined ? profile.invoiceAmount : 0;
  if (currency !== 'KRW' && amount > 0) {
    try {
      const dv = await calcDutiableValue(amount, currency, profile.tradeType);
      const srcNote = dv.source === 'api' ? `관세청 주간환율, 적용일 ${dv.effectiveDate}` : '시뮬레이션 환율 — 실환율은 API 키 설정 후 적용';
      issues.push({
        id: 'dutiable-value-info',
        docType: 'customs_dec',
        severity: 'info',
        message: `과세가격 환산: ${currency} ${amount.toLocaleString()} × ${dv.rate.toLocaleString()}원 = 약 ${dv.totalKrw.toLocaleString()}원 (${srcNote})`,
        field: 'invoiceAmount'
      });
    } catch {
      // 환산 실패는 치명적이지 않음 — 이슈 미추가
    }
  }

  // 7. 사업자등록번호 상태 검증 (국세청)
  const bizNo = (profile.businessRegistrationNo || '').replace(/[^0-9]/g, '');
  if (bizNo.length > 0) {
    try {
      const biz = await verifyBusinessRegistration(bizNo);
      if (!biz.valid) {
        issues.push({
          id: 'bizno-invalid',
          docType: 'customs_dec',
          severity: 'error',
          message: `사업자등록번호 확인 필요: ${biz.statusText} (통관 신고인 정보 불일치 시 세관 반려 사유가 됩니다.)`,
          field: 'businessRegistrationNo'
        });
      } else if (biz.source === 'simulation') {
        issues.push({
          id: 'bizno-checksum-only',
          docType: 'customs_dec',
          severity: 'info',
          message: '사업자등록번호: 형식(체크섬)만 확인됨 — 국세청 실조회는 설정에서 API 키 등록 후 가능합니다.',
          field: 'businessRegistrationNo'
        });
      }
    } catch {
      // 조회 실패 시 이슈 미추가 (네트워크 등)
    }
  }

  return issues;
}
