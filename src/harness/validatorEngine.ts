import { TradeProfile, ValidationIssue } from '../types';
import { getIncotermsRule } from '../agents/incotermsRules';
import { isGrossWeightBelowNet } from '../utils/shipperForm';
import { calcDutiableValue, verifyBusinessRegistration } from '../services/customsApiService';
import { estimateDuty } from '../services/unipassService';
import { getRelatedLawForIssue } from '../services/lawService';

/**
 * 외부 API(Supabase 엣지함수) 호출에 개별 상한을 둔다.
 * 엣지함수 콜드스타트·중단 시 invoke가 무한 대기하면 재검증 전체가 오케스트레이터
 * 30초 타임아웃으로 실패한다("규정 검증 실패: 작업 타임아웃"). 각 호출을 ms 안에
 * 끊어, 지연 시 해당 안내 이슈만 건너뛰고 검증을 계속 진행한다(값은 이미 룰로 확정).
 */
function withTimeout<T>(promise: Promise<T>, ms = 8000, label = '외부 API'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 응답 지연 (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * 거래정보 입력값 검증 (팀원 Python 스펙 "거래정보 입력값 검증 모듈" 포팅)
 * 1) 필수 항목 누락 체크 (단가·금액 포함)
 * 2) 숫자 항목(수량·중량·단가·금액)은 0보다 커야 함
 * 3) 계산 검증 — 수량 × 단가 = 금액이 맞는지
 *
 * 수출 화주 화면에서 더 이상 입력받지 않는 ETA·송장 작성일은 여기서 검증하지 않는다.
 *
 * 중량 누락·항구 누락·HS코드는 기존 룰(validateTradeDocuments/HSCodeAgent)이
 * 전담하므로 여기서 중복 발행하지 않는다.
 */
// 한글 받침 유무로 주격/보조사 선택 — "도착예정일이", "단가가"처럼 자연스럽게(이(가) 병기 제거).
function hasBatchim(word: string): boolean {
  const base = word.replace(/\([^)]*\)\s*$/, '').trim(); // 뒤 영문 병기 괄호는 판정에서 제외
  const c = base.charCodeAt(base.length - 1);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return true; // 비한글은 받침 있는 것으로 간주(이/은)
  return (c - 0xac00) % 28 !== 0;
}
const josaIGa = (w: string) => (hasBatchim(w) ? '이' : '가');
const josaEunNeun = (w: string) => (hasBatchim(w) ? '은' : '는');

export function validateRequiredInputs(profile: TradeProfile): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // 1) 필수 항목 누락 (값이 없거나 빈 문자열이면 누락)
  const required: {
    field: keyof TradeProfile;
    label: string;
    docType: ValidationIssue['docType'];
  }[] = [
    { field: 'itemName', label: '품목명', docType: 'invoice' },
    { field: 'incoterms', label: '거래조건(Incoterms)', docType: 'invoice' },
    { field: 'quantity', label: '화물 수량', docType: 'packing_list' },

    // 선적일(departureDate)은 R2에서 warning으로 처리
    // 인보이스는 선적 전 발행이 흔하므로 여기서 error로 잡지 않음
    { field: 'companyName', label: '업체명', docType: 'invoice' },
    { field: 'partnerName', label: '거래처명(Consignee)', docType: 'invoice' },
    { field: 'contact', label: '담당자 연락처', docType: 'invoice' },
    { field: 'unitPrice', label: '단가', docType: 'invoice' },
    { field: 'totalAmount', label: '금액(Total Amount)', docType: 'invoice' },
  ];

  for (const { field, label, docType } of required) {
    const value = profile[field];

    if (value === undefined || value === null || String(value).trim() === '') {
      issues.push({
        id: `input-missing-${field}`,
        docType,
        severity: 'error',
        message: `${label}${josaIGa(label)} 입력되지 않았습니다.`,
        field
      });
    }
  }

  // 2) 숫자 항목은 0보다 커야 함
  // 입력된 경우에만 검사 — 누락은 위/기존 룰이 처리
  const numericChecks: {
    field: 'quantity' | 'weight' | 'unitPrice' | 'totalAmount';
    label: string;
    docType: ValidationIssue['docType'];
  }[] = [
    { field: 'quantity', label: '화물 수량', docType: 'packing_list' },
    { field: 'weight', label: '중량(kg)', docType: 'packing_list' },
    { field: 'unitPrice', label: '단가', docType: 'invoice' },
    { field: 'totalAmount', label: '금액(Total Amount)', docType: 'invoice' },
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
          message: `${label}${josaEunNeun(label)} 숫자로 입력해야 합니다.`,
          field
        });
      } else if (num <= 0) {
        issues.push({
          id: `input-nonpositive-${field}`,
          docType,
          severity: 'error',
          message: `${label}${josaEunNeun(label)} 0보다 커야 합니다.`,
          field
        });
      }
    }
  }

  // 다품목(shipperItems) 중 계산에 쓸 수 있는 유효 라인
  // 수량·단가가 양수인 품목만 추림
  //
  // 2건 이상이면 총액은 "품목 합계"라 단건 qty × price 검증이
  // 성립하지 않으므로 아래에서 분기한다.
  const validItems = (profile.shipperItems ?? []).filter((it) => {
    const q = Number(it.quantity);
    const p = Number(it.unitPrice);

    return (
      it.quantity !== '' &&
      it.unitPrice !== '' &&
      !Number.isNaN(q) &&
      !Number.isNaN(p) &&
      q > 0 &&
      p > 0
    );
  });

  // 3) 계산 검증 — 수량 × 단가 = 금액
  //
  // 셋 다 유효한 양수로 입력된 경우에만 검사한다.
  // 셋 중 하나라도 누락·비정상이면 위의 필수/숫자 검사가 이미 잡으므로
  // 여기서는 중복 이슈를 발행하지 않는다.
  //
  // 다품목(2건 이상)이면 총액 = 품목 합계이므로
  // 이 단건 검증 대신 아래 A) 품목 합계 검증을 사용한다.
  const qty = Number(profile.quantity);
  const price = Number(profile.unitPrice);
  const total = Number(profile.totalAmount);

  const allAmountsValid =
    profile.quantity !== '' &&
    profile.unitPrice !== '' &&
    profile.totalAmount !== '' &&
    profile.quantity !== undefined &&
    profile.unitPrice !== undefined &&
    profile.totalAmount !== undefined &&
    !Number.isNaN(qty) &&
    !Number.isNaN(price) &&
    !Number.isNaN(total) &&
    qty > 0 &&
    price > 0 &&
    total > 0;

  if (allAmountsValid && validItems.length <= 1) {
    const expected = qty * price;

    // 단가·수량 반올림에서 오는 미세 오차(≤1%)는 허용하고,
    // 자릿수 실수 등 실제 불일치만 잡는다.
    const tolerance = Math.max(0.01, expected * 0.01);

    if (Math.abs(expected - total) > tolerance) {
      issues.push({
        id: 'amount-calc-mismatch',
        docType: 'invoice',
        severity: 'error',
        message: `금액 계산 불일치: 수량(${qty.toLocaleString()}) × 단가(${price.toLocaleString()}) = ${expected.toLocaleString()} 이지만, 입력된 금액은 ${total.toLocaleString()} 입니다. 값을 확인해 주세요.`,
        field: 'totalAmount',
        amounts: {
          expected,
          actual: total,
          currency: profile.currency || 'USD',
        },
      });
    }
  }

  // ===== 문서 내부 논리 검증 (결정론적, 외부 API 불필요) =====

  // A) 다품목 금액 합계 = Invoice 총액
  // 유효 품목 2건 이상 & 단일 통화일 때만 검사
  //
  // 혼합 통화면 합산 자체가 성립하지 않으므로 건너뛴다.
  // 입력폼에서도 혼합 통화의 경우 총액을 미산출한다.
  const itemCurrencies = new Set(validItems.map((it) => it.currency));

  if (
    validItems.length >= 2 &&
    itemCurrencies.size === 1 &&
    !Number.isNaN(total) &&
    total > 0
  ) {
    const itemsSum = validItems.reduce(
      (sum, item) =>
        sum + Number(item.quantity) * Number(item.unitPrice),
      0
    );

    const tolerance = Math.max(0.01, itemsSum * 0.01);

    if (Math.abs(itemsSum - total) > tolerance) {
      issues.push({
        id: 'items-total-mismatch',
        docType: 'invoice',
        severity: 'error',
        message: `품목 합계 불일치: 품목별 금액 합계는 ${itemsSum.toLocaleString()} 이지만, 입력된 Invoice 총액은 ${total.toLocaleString()} 입니다. 값을 확인해 주세요.`,
        field: 'totalAmount',
        amounts: {
          expected: itemsSum,
          actual: total,
          currency: profile.currency || 'USD',
        },
      });
    }
  }

  // B) 순중량(Net) ≤ 총중량(Gross)
  // 둘 다 양수로 입력된 경우에만
  if (isGrossWeightBelowNet(profile.grossWeight, profile.netWeight)) {
    issues.push({
      id: 'weight-net-gross',
      docType: 'packing_list',
      severity: 'error',
      message: `중량 오류: 순중량(Net ${Number(profile.netWeight).toLocaleString()}kg)은 총중량(Gross ${Number(profile.grossWeight).toLocaleString()}kg)보다 클 수 없습니다.`,
      field: 'grossWeight',
    });
  }

  // C) 포장 수량은 0보다 커야 함
  // 입력된 경우에만
  if (profile.packageCount !== '' && profile.packageCount !== undefined) {
    const pkg = Number(profile.packageCount);

    if (Number.isNaN(pkg) || pkg <= 0) {
      issues.push({
        id: 'package-count-nonpositive',
        docType: 'packing_list',
        severity: 'error',
        message: '포장 수량(Packages)은 0보다 큰 값이어야 합니다.',
        field: 'packageCount',
      });
    }
  }

  // D) 수량 단위 누락
  // 수량이 유효 입력됐는데 단위(EA/CT/KG 등)가 비어 있는 경우
  const qtyEntered =
    profile.quantity !== '' &&
    profile.quantity !== undefined &&
    Number(profile.quantity) > 0;

  if (qtyEntered && (!profile.unit || String(profile.unit).trim() === '')) {
    issues.push({
      id: 'unit-missing',
      docType: 'packing_list',
      severity: 'error',
      message: '수량 단위(EA, CT, KG 등)가 입력되지 않았습니다.',
      field: 'unit',
    });
  }

  // E) 통화 누락
  // 금액이 입력됐는데 Currency가 비어 있는 경우
  const anyAmountEntered = [
    profile.unitPrice,
    profile.totalAmount,
    profile.invoiceAmount,
  ].some(
    (value) =>
      value !== '' &&
      value !== undefined &&
      Number(value) > 0
  );

  if (
    anyAmountEntered &&
    (!profile.currency || String(profile.currency).trim() === '')
  ) {
    issues.push({
      id: 'currency-missing',
      docType: 'invoice',
      severity: 'error',
      message: '통화(Currency)가 선택되지 않았습니다. 금액의 통화 단위를 지정해 주세요.',
      field: 'currency',
    });
  }

  // F) 공급자·거래처 주소 누락
  // 상업송장 필수 항목
  const addressRequired: {
    field: 'companyAddress' | 'partnerAddress';
    label: string;
  }[] = [
    {
      field: 'companyAddress',
      label: '공급자(Shipper) 주소',
    },
    {
      field: 'partnerAddress',
      label: '거래처(Consignee) 주소',
    },
  ];

  for (const { field, label } of addressRequired) {
    const value = profile[field];

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ''
    ) {
      issues.push({
        id: `input-missing-${field}`,
        docType: 'invoice',
        severity: 'error',
        message: `${label}${josaIGa(label)} 입력되지 않았습니다.`,
        field
      });
    }
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
      message:
        '패킹리스트: 중량 정보 확인 필요 (총 중량 또는 순중량 정보의 확인이 필요합니다.)',
      field: 'weight',
    });
  }

  // 2. 통관신고서 - HS CODE 검증
  // HSCodeAgent에서 처리하므로 여기서는 중복 제거

  // 3. 원산지증명서 - 필요 여부 확인 → 신청자료 정리 안내
  //
  // 실제 발급은 상공회의소가 하므로 "작성/발급 요청"이 아니라
  // ① 구매자 요청 여부 질문
  // ② yes면 신청자료 정리·발급기관 안내
  // 로 흐른다.
  //
  // 답변이 'no'면 이슈를 발행하지 않는다.
  if (profile.tradeType === 'export' && profile.coNeeded !== 'no') {
    issues.push({
      id: 'co-required',
      docType: 'co',
      severity: 'warning',
      message:
        profile.coNeeded === 'yes'
          ? '원산지증명서: 상공회의소 발급 대상 (아래 신청자료 정리를 참고해 발급기관에서 신청을 진행해 주세요.)'
          : '원산지증명서: 필요 여부 확인 (구매자가 FTA 적용 또는 원산지증명서를 요청했는지 확인해 주세요.)',
      field: 'coNeeded',
    });
  }

  // 4. 수출 운송의뢰서 - 항구 검증
  // EXW 조건이 아닐 때만 항구 누락을 에러로 잡음
  const isEXW = profile.incoterms === 'EXW';

  if (!isEXW && (!profile.loadPort || !profile.dischargePort)) {
    issues.push({
      id: 'ports-missing',
      docType: 'transport_request',
      severity: 'error',
      message:
        '수출 운송의뢰서: 선적항 및 도착항 정보 누락 (해상 운송 경로 설정이 완료되지 않았습니다.)',
      field: 'loadPort',
    });
  }

  // 5. Incoterms 조건별 검증 규칙 추가
  const rule = getIncotermsRule(profile.incoterms);

  if (rule) {
    // 적하보험증권
    //
    // CIF는 Incoterms상 매도인 부보 의무라 질문 없이 준비 확인을 요구하고,
    // 그 외 조건은 C/O처럼 필요 여부(insuranceNeeded)를 먼저 묻는다.
    //
    // error로 두면 해소 수단 없이 제출이 영구 차단되므로
    // warning + 해소 플래그 방식 사용
    const insuranceMandatory = rule.requiredDocuments.includes('insurance');

    if (insuranceMandatory && !profile.insuranceConfirmed) {
      issues.push({
        id: 'insurance-missing',
        docType: 'insurance',
        severity: 'warning',
        message:
          '적하보험증권: 준비 확인 필요 (CIF 조건은 적하보험증권이 필수입니다. 증권 준비 후 완료로 표시해 주세요.)',
        field: 'insuranceConfirmed',
      });
    } else if (!insuranceMandatory && profile.tradeType === 'export') {
      if (profile.insuranceNeeded === undefined) {
        issues.push({
          id: 'insurance-needed-check',
          docType: 'insurance',
          severity: 'warning',
          message:
            '적하보험증권: 보험 필요 여부 확인 (계약상 매도인이 적하보험을 부보하기로 했는지 확인해 주세요.)',
          field: 'insuranceNeeded',
        });
      } else if (
        profile.insuranceNeeded === 'yes' &&
        !profile.insuranceConfirmed
      ) {
        issues.push({
          id: 'insurance-missing',
          docType: 'insurance',
          severity: 'warning',
          message:
            '적하보험증권: 준비 확인 필요 (계약상 매도인 부보 조건입니다. 증권 준비 후 완료로 표시해 주세요.)',
          field: 'insuranceConfirmed',
        });
      }

      // insuranceNeeded === 'no'면 이슈 미발행
    }

    // EXW 조건인 경우 정보성 알림
    if (rule.incoterm === 'EXW') {
      issues.push({
        id: 'exw-responsibility-info',
        docType: 'invoice',
        severity: 'info',
        message:
          '공장 인도(EXW) 조건 안내: 매수인이 운송 및 수출 통관 책임을 전적으로 부담합니다.',
        field: 'incoterms',
      });
    }

    // FOB/CIF(해상 전용)인데 공항이 입력된 경우만 자문 경고
    //
    // 기존 endsWith('항') 방식은
    // "Busan"·"KRPUS" 같은 영문/UN LOCODE 표기를 전부 허위 경고로 잡았으므로
    // 명백한 공항 표기만 잡는다.
    if (rule.transportMode === 'sea') {
      const looksLikeAirport = (port: string) =>
        /공항|airport|air\s?port/i.test(port);

      if (
        looksLikeAirport(profile.loadPort || '') ||
        looksLikeAirport(profile.dischargePort || '')
      ) {
        issues.push({
          id: 'transport-context-mismatch',
          docType: 'transport_request',
          severity: 'info',
          message:
            '운송 맥락 불일치 경고: FOB/CIF 조건은 해상 운송 전용인데 공항이 입력되어 있습니다. 항구를 입력하세요.',
          field: 'loadPort',
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
export async function validateTradeDocumentsAsync(
  profile: TradeProfile
): Promise<ValidationIssue[]> {
  const issues = validateTradeDocuments(profile);

  // 6. 외화 인보이스 → 관세청 주간환율 기준 원화 과세가격 환산 안내
  const currency = profile.currency || 'KRW';

  const amount =
    profile.invoiceAmount !== '' &&
    profile.invoiceAmount !== undefined
      ? profile.invoiceAmount
      : 0;

  if (currency !== 'KRW' && amount > 0) {
    try {
      const dv = await withTimeout(
        calcDutiableValue(amount, currency, profile.tradeType),
        8000,
        '환율 환산'
      );

      // 적용일 YYYYMMDD → YYYY.MM.DD
      const fmtDate = (date: string) =>
        /^\d{8}$/.test(date)
          ? `${date.slice(0, 4)}.${date.slice(4, 6)}.${date.slice(6, 8)}`
          : date;

      const srcNote =
        dv.source === 'api'
          ? `관세청 주간환율 · 적용일 ${fmtDate(dv.effectiveDate)}`
          : '시뮬레이션 환율 — 실환율은 API 키 설정 후 적용';

      const itemNote = profile.itemName
        ? `${profile.itemName} · `
        : '';

      issues.push({
        id: 'dutiable-value-info',
        docType: 'customs_dec',
        severity: 'info',
        message: `과세가격 환산: ${currency} ${amount.toLocaleString()} × ${dv.rate.toLocaleString()}원 = 약 ${dv.totalKrw.toLocaleString()}원 (${srcNote})`,
        field: 'invoiceAmount',

        // 사실 카드
        // 값은 실 환율 API 또는 시뮬레이션 폴백에서 결정론적으로 산출
        card: {
          id: 'dutiable-value',
          title: '과세가격 환산',
          value: `약 ${dv.totalKrw.toLocaleString()}원`,
          formula: `${currency} ${amount.toLocaleString()} × ${dv.rate.toLocaleString()}원`,
          meta: `${itemNote}${srcNote}`,
          basis: {
            label: '근거',
            law: '관세법 제30조',
          },
        },
      });

      // 6-1. 수입 거래 + 유효 HSK 10자리
      // UNI-PASS 관세율 기반 예상 관세액 안내
      const hsCleaned = profile.hsCode.replace(/[^0-9]/g, '');

      if (
        profile.tradeType === 'import' &&
        hsCleaned.length === 10
      ) {
        const duty = await withTimeout(
          estimateDuty(hsCleaned, dv.totalKrw),
          8000,
          '관세율 조회'
        );

        // 실제 UNI-PASS API에서 확인된 관세율일 때만
        // 예상 관세액을 표시한다.
        //
        // API 실패 후 반환되는 시뮬레이션 세율
        // 예: 임의 8%는 사용하지 않는다.
        if (duty?.source === 'api') {
          const dutySrc = 'UNI-PASS 관세율 기준';

          issues.push({
            id: 'estimated-duty-info',
            docType: 'customs_dec',
            severity: 'info',
            message: `예상 관세액: 과세가격 ${duty.dutiableValueKrw.toLocaleString()}원 × ${duty.rate}% (${duty.rateName}) = 약 ${duty.estimatedDutyKrw.toLocaleString()}원 (${dutySrc})`,
            field: 'hsCode',
            card: {
              id: 'estimated-duty',
              title: '예상 관세액',
              value: `약 ${duty.estimatedDutyKrw.toLocaleString()}원`,
              formula: `과세가격 ${duty.dutiableValueKrw.toLocaleString()}원 × ${duty.rate}% (${duty.rateName})`,
              meta: dutySrc,
            },
          });
        }
      }
    } catch (err) {
      // 환산 실패는 치명적이지 않음
      // 이슈 미추가 — 디버깅용 로그만 남김
      console.warn('과세가격 환산 실패 (이슈 미발행):', err);
    }
  }

  // 7. 사업자등록번호 상태 검증 (국세청)
  const bizNo = (profile.businessRegistrationNo || '').replace(
    /[^0-9]/g,
    ''
  );

  if (bizNo.length > 0) {
    try {
      const biz = await withTimeout(
        verifyBusinessRegistration(bizNo),
        8000,
        '사업자번호 조회'
      );

      if (!biz.valid) {
        issues.push({
          id: 'bizno-invalid',
          docType: 'customs_dec',
          severity: 'error',

          // 국세청 실조회 실패 시 사용자가 통제 불가
          // 사유 기록 후 계속 진행 가능
          overridable: true,

          message: `사업자등록번호 확인 필요: ${biz.statusText} (통관 신고인 정보 불일치 시 세관 반려 사유가 됩니다.)`,
          field: 'businessRegistrationNo',
        });
      } else if (biz.source !== 'api') {
        issues.push({
          id: 'bizno-checksum-only',
          docType: 'customs_dec',
          severity: 'info',
          message:
            '사업자등록번호: 형식(체크섬)만 확인됨 — 국세청 실조회는 API 설정 후 확인할 수 있습니다.',
          field: 'businessRegistrationNo',
        });
      }
    } catch (err) {
      // 조회 실패 시 이슈 미추가
      // 네트워크 등 — 디버깅용 로그만 남김
      console.warn(
        '사업자등록번호 조회 실패 (이슈 미발행):',
        err
      );
    }
  }

  // 8. 근거 법령 표기
  // 법제처 매핑 — 해당 이슈 유형에만
  //
  // 구조화 basis 필드에 조문 요약까지 담아
  // UI가 접이식으로 렌더할 수 있게 한다.
  //
  // message 문자열은 기존 UI/알림 백워드 호환을 위해 그대로 유지한다.
  for (const issue of issues) {
    const law = getRelatedLawForIssue(issue.id);

    if (!law) continue;

    if (!issue.basis) {
      issue.basis = {
        label: '근거',
        law: `${law.lawName} ${law.article}`,
        summary: law.summary,
      };
    }

    if (!issue.message.includes('근거:')) {
      issue.message += ` [근거: ${law.lawName} ${law.article}]`;
    }
  }

  return issues;
}