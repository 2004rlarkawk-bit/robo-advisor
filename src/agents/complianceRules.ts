import { TradeProfile, ValidationIssue, DocumentType, InvoiceData, PackingListData, InvoiceItem } from '../types';
import { AgentLog, createLog } from './types';
import { isLcPayment, isNonLcPayment } from './paymentTerms';

/**
 * 검증 정책 (타입으로 강제)
 * - error  : 생성 차단. overridable=true면 사유 입력 시 우회 가능.
 * - warning: 생성하되 결과에 배지 표시(차단 안 함).
 *
 * RULE_POLICY는 `satisfies`로 룰마다 severity/overridable을 반드시 명시하게 강제한다.
 */
export type RuleSeverity = 'error' | 'warning';
export interface RulePolicy {
  severity: RuleSeverity;
  overridable: boolean; // severity==='error'일 때만 의미(우회 허용 여부)
}

export const RULE_POLICY = {
  'r1-origin-missing':        { severity: 'error',   overridable: true },
  'r1-itemname-insufficient': { severity: 'error',   overridable: true },
  'r2-departure-missing':     { severity: 'warning', overridable: false },
  'r3-incoterm-port':         { severity: 'error',   overridable: true },
  'r3-incoterm-port-flex':    { severity: 'warning', overridable: false },
  'r4-transport-mode':        { severity: 'warning', overridable: false },
  'r5-same-country-ports':    { severity: 'error',   overridable: true },
  'r6-hs-unit':               { severity: 'warning', overridable: false },
  'r7-nonlatin-lc':           { severity: 'error',   overridable: true },
  'r7-nonlatin':              { severity: 'warning', overridable: false },
  'r8-amount-arithmetic':     { severity: 'error',   overridable: false },
  'r10-packing-qty-mismatch': { severity: 'warning', overridable: false },
  'r10-packing-desc-mismatch':{ severity: 'warning', overridable: false },
  'r11-payment-lc-conflict':  { severity: 'error',   overridable: true },
  'r11-lc-missing':           { severity: 'warning', overridable: false },
  'r11-lc-date-missing':      { severity: 'warning', overridable: false },
} as const satisfies Record<string, RulePolicy>;

export type ComplianceRuleId = keyof typeof RULE_POLICY;

/** 정책 레지스트리에서 severity/overridable을 읽어 이슈를 만든다(수기 지정 방지). */
function mk(id: ComplianceRuleId, docType: DocumentType, field: string, message: string): ValidationIssue {
  const p = RULE_POLICY[id];
  return {
    id,
    docType,
    field,
    message,
    severity: p.severity,
    overridable: p.severity === 'error' ? p.overridable : undefined,
  };
}

// ── 공통 유틸 ────────────────────────────────────────────────
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const hasHangul = (s?: string) => !!s && HANGUL.test(s);
const hasLatin = (s?: string) => !!s && /[A-Za-z]/.test(s);
const up = (s?: string) => (s || '').toUpperCase();

// Incoterms 2020 지명 그룹
const ORIGIN_STRICT = new Set(['FAS', 'FOB']);       // 선적지 지칭(엄격) → From과 비교, 불일치 error
const ORIGIN_FLEX = new Set(['EXW', 'FCA']);         // 선적지 지칭이나 내륙 가능 → warning까지만
const DESTINATION = new Set(['CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']); // 도착지 지칭 → To와 비교
const SEA_ONLY = new Set(['FAS', 'FOB', 'CFR', 'CIF']); // 해상 전용

// R1 수산물(HS 03류) 품명 충분성: 상태 + 형태 키워드 요구
const STATE_KW = ['FROZEN', 'FRESH', 'CHILLED', 'LIVE', 'DRIED', 'SMOKED', 'SALTED', 'BOILED'];
const FORM_KW = ['WHOLE ROUND', 'WHOLE', 'ROUND', 'FILLET', 'GUTTED', 'HEADLESS', 'H&G', 'HGT', 'STEAK', 'LOIN', 'CUBE', 'PORTION', 'DRESSED', 'GILLED', 'SKINLESS', 'SKIN ON'];

// R5 항구명 → 국가코드 추정(경량 사전; 미상은 null → 판정 보류)
function portCountry(port?: string): string | null {
  const p = (port || '').toLowerCase();
  if (!p.trim()) return null;
  if (/korea|한국|대한민국|부산|busan|인천|incheon|광양|gwangyang|평택|pyeongtaek|울산|ulsan|군산|목포|\bkr\b|krpus|krinc/.test(p)) return 'KR';
  if (/japan|일본|osaka|오사카|tokyo|도쿄|kobe|고베|yokohama|요코하마|nagoya|\bjp\b/.test(p)) return 'JP';
  if (/china|중국|shanghai|상하이|qingdao|칭다오|ningbo|닝보|shenzhen|\bcn\b/.test(p)) return 'CN';
  if (/usa|america|미국|los angeles|long beach|new york|\bla\b|\bus\b/.test(p)) return 'US';
  if (/vietnam|베트남|haiphong|ho chi minh|\bvn\b/.test(p)) return 'VN';
  return null;
}

// R6 HS 4단위 → 통상 신고 단위
const HS4_UNIT: Record<string, string> = {
  '0301': 'KG', '0302': 'KG', '0303': 'KG', '0304': 'KG',
  '0305': 'KG', '0306': 'KG', '0307': 'KG', '0308': 'KG',
};
const isWeightUnit = (u?: string) => /^(kg|g|ton|mt|톤|킬로|중량)/i.test((u || '').trim());

// 통화별 소수 자릿수
const decimalsFor = (ccy?: string) => (['KRW', 'JPY'].includes(up(ccy)) ? 0 : 2);
const roundTo = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const num = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * R1~R8 검증 룰 실행. 프로필 입력을 기준으로 판정한다.
 * (문서번호/금액/항구 등은 DocumentAgent가 프로필에서 결정적으로 파생하므로 프로필만으로 충분.)
 */
export function runComplianceRules(profile: TradeProfile, logs?: AgentLog[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // 휴리스틱 룰(R5 국가추정·R6 HS단위맵)이 추정 실패 시: 억지 추정 대신 조용히 통과하고 로그만 남긴다.
  const skipLog = (msg: string) => { if (logs) logs.push(createLog('Compliance Agent', msg, 'info')); };
  const inc = up(profile.incoterms);
  const load = (profile.loadPort || '').trim();
  const disch = (profile.dischargePort || '').trim();
  const itemName = profile.itemName || '';
  const hs4 = (profile.hsCode || '').replace(/[^0-9]/g, '').slice(0, 4);

  // ── R1. 필수값 (error) ──────────────────────────────
  if (!(profile.countryOfOrigin || '').trim()) {
    issues.push(mk('r1-origin-missing', 'customs_dec', 'countryOfOrigin',
      '원산지가 비어 있습니다. 수출입 신고 필수 항목이므로 원산지 국가를 입력하세요.'));
  }
  // 수산물(HS 03류)은 상태(FROZEN/FRESH…)+형태(WHOLE ROUND/FILLET…) 포함 요구
  if (hs4.startsWith('03') && itemName.trim()) {
    const nameUp = up(itemName);
    const hasState = STATE_KW.some(k => nameUp.includes(k));
    const hasForm = FORM_KW.some(k => nameUp.includes(k));
    if (!hasState || !hasForm) {
      issues.push(mk('r1-itemname-insufficient', 'invoice', 'itemName',
        `품명이 통관 기준에 미달합니다. 수산물은 상태(FROZEN/FRESH/DRIED 등)와 형태(WHOLE ROUND/FILLET 등)를 포함해야 합니다. 예: "FROZEN HAIRTAIL, WHOLE ROUND"`));
    }
  }

  // ── R2. 선적일 (warning) ────────────────────────────
  // 본선적재(On Board) 인도 조건(FOB·CFR·CIF)에서만 선적일 확인을 권장한다.
  // EXW·FCA·DAP·DDP 등은 인도 시점이 본선적재와 무관하므로 공란이어도 안내하지 않는다.
  // 선적일은 상업송장(C/I) 입력 필드이므로 귀속도 invoice — B/L은 우리가 생성하지 않는 서류.
  const ON_BOARD_TERMS = new Set(['FOB', 'CFR', 'CIF']);
  if (ON_BOARD_TERMS.has(inc) && !(profile.departureDate || '').trim()) {
    issues.push(mk('r2-departure-missing', 'invoice', 'departureDate',
      '선적일(출발일)이 비어 있습니다. 선적 전 발행이면 무방하나, 확정 시 입력을 권장합니다.'));
  }

  // ── R3. Incoterms ↔ 항구 정합성 (error) ─────────────
  // 도착지 지칭 조건(CIF 등)은 도착항(⑥To) 명기 필수, 선적지 지칭(FOB 등)은 선적항(⑤From) 명기 필수.
  // 실제 버그였던 "CIF 광양(선적항)"은 terms 파생을 도착항으로 고쳐 방지하고, 여기서 항구 누락을 error로 잡는다.
  if (inc) {
    if (DESTINATION.has(inc)) {
      if (!disch) {
        issues.push(mk('r3-incoterm-port', 'invoice', 'dischargePort',
          `${inc} 조건은 도착지 지칭입니다. 인도조건 뒤에는 도착항(⑥To)을 명기해야 하는데 도착항이 비어 있습니다. 예: "${inc} OSAKA".`));
      }
    } else if (ORIGIN_STRICT.has(inc)) {
      if (!load) {
        issues.push(mk('r3-incoterm-port', 'invoice', 'loadPort',
          `${inc} 조건은 선적지 지칭입니다. 인도조건 뒤에는 선적항(⑤From)을 명기해야 하는데 선적항이 비어 있습니다. 예: "${inc} BUSAN".`));
      }
    } else if (ORIGIN_FLEX.has(inc)) {
      // EXW·FCA는 내륙 지명 가능 → 누락도 warning까지만
      if (!load) {
        issues.push(mk('r3-incoterm-port-flex', 'invoice', 'loadPort',
          `${inc} 조건의 인도장소(선적항/내륙지)가 비어 있습니다. 확인을 권장합니다.`));
      }
    }
  }

  // ── R4. 운송수단 정합성 (warning) ───────────────────
  // 해상 전용 조건인데 항공편이 입력되면 경고.
  if (SEA_ONLY.has(inc)) {
    const v = profile.vesselOrFlight || '';
    const looksAir = /항공|air|flight|\b[A-Z]{2}\d{2,4}\b/i.test(v);
    if (looksAir) {
      issues.push(mk('r4-transport-mode', 'transport_request', 'vesselOrFlight',
        `${inc}는 해상 운송 전용 조건인데 운송수단이 항공편으로 보입니다("${v}"). 조건 또는 운송수단을 확인하세요.`));
    }
  }

  // ── R5. 동일국가 항구 (error, override 가능) ─────────
  // 국내운송 의심. 단 보세운송·반송·자유무역지역에서 정상 발생하므로 사유 입력 시 우회 허용.
  const lc = portCountry(load), dc = portCountry(disch);
  if (load && disch && (!lc || !dc)) {
    // 국가 추정 실패 → 억지 판정 금지, 조용히 통과 + 로그
    const un = [!lc ? `선적항 "${load}"` : '', !dc ? `도착항 "${disch}"` : ''].filter(Boolean).join(', ');
    skipLog(`R5 동일국가 검사 건너뜀 — 항구 국가 추정 불가(${un}). 오탐 방지.`);
  } else if (lc && dc && lc === dc) {
    issues.push(mk('r5-same-country-ports', 'transport_request', 'loadPort',
      `선적항과 도착항이 같은 국가(${lc})로 보입니다(국내운송 의심). 보세운송·반송·FTZ 등 정상 사유이면 사유 입력 후 진행하세요.`));
  }

  // ── R6. HS 단위 (warning) ───────────────────────────
  const expectedUnit = HS4_UNIT[hs4];
  if (hs4 && !expectedUnit) {
    // 통상단위 미등록 HS → 억지 판정 금지, 조용히 통과 + 로그
    skipLog(`R6 HS 단위 검사 건너뜀 — HS 4단위 "${hs4}" 통상단위 미등록. 오탐 방지.`);
  } else if (expectedUnit && (profile.unit || '').trim() && !isWeightUnit(profile.unit)) {
    issues.push(mk('r6-hs-unit', 'customs_dec', 'unit',
      `HS ${hs4}류의 통상 신고 단위는 ${expectedUnit}인데 인보이스 단위가 "${profile.unit}"입니다. 신고 시 중량 환산이 필요할 수 있습니다.`));
  }

  // ── R7. 영문 필드 한글 검사 ─────────────────────────
  // 대상: from_port, to_port, goods_description, 주소, terms_of_payment.
  // terms_of_payment에 L/C 포함 + 한글 → error(하자 → 대금 거절), 그 외 → warning.
  // goods_description은 영문 병기면 warning으로 완화.
  const pay = profile.paymentTerms || '';
  const isLC = /l\/?c|신용장|letter of credit/i.test(pay);
  if (hasHangul(pay)) {
    if (isLC) {
      issues.push(mk('r7-nonlatin-lc', 'invoice', 'paymentTerms',
        '결제조건(L/C)에 한글이 포함되어 있습니다. 신용장 서류 불일치(하자)는 대금 거절 사유이므로 영문으로 작성하세요.'));
    } else {
      issues.push(mk('r7-nonlatin', 'invoice', 'paymentTerms', '결제조건에 한글이 포함되어 있습니다. 영문 표기를 권장합니다.'));
    }
  }
  const engFields: { field: keyof TradeProfile; label: string; docType: DocumentType }[] = [
    { field: 'loadPort', label: '선적항(From)', docType: 'transport_request' },
    { field: 'dischargePort', label: '도착항(To)', docType: 'transport_request' },
    { field: 'companyAddress', label: '자사 주소', docType: 'invoice' },
    { field: 'partnerAddress', label: '거래처 주소', docType: 'invoice' },
    { field: 'buyerAddress', label: 'Buyer 주소', docType: 'invoice' },
  ];
  for (const { field, label, docType } of engFields) {
    const v = String((profile[field] as string) || '');
    if (hasHangul(v)) {
      issues.push(mk('r7-nonlatin', docType, field,
        `${label}에 한글이 포함되어 있습니다("${v}"). 영문으로 작성하세요. 예: "GWANGYANG, KOREA".`));
    }
  }
  // 품명: 한글이 있으나 영문이 병기되면 warning으로 완화(예: "냉동 갈치 (Frozen Hairtail)")
  if (hasHangul(itemName)) {
    issues.push(mk('r7-nonlatin', 'invoice', 'itemName',
      hasLatin(itemName)
        ? '품명에 한글이 있으나 영문이 병기되어 있습니다. 통관 문서는 영문 품명을 권장합니다.'
        : '품명에 한글만 있습니다. 영문 품명을 작성하세요.'));
  }

  // ── R11. 결제조건 ↔ L/C 필드 정합성 ─────────────────
  // 비신용장(T/T 등) 결제인데 L/C 정보가 있으면 모순 → error(차단, 사유 override 가능).
  // 반대로 L/C 결제인데 L/C 번호가 없으면 → warning.
  const lcVals = [profile.lcNo, profile.lcBank, profile.lcDate].map(v => (v || '').trim()).filter(Boolean);
  if (isNonLcPayment(profile.paymentTerms) && lcVals.length > 0) {
    issues.push(mk('r11-payment-lc-conflict', 'invoice', 'paymentTerms',
      `결제조건이 비신용장("${profile.paymentTerms}")인데 L/C 정보(${lcVals.join(', ')})가 입력되어 있습니다. 서로 모순이므로 결제조건 또는 L/C 필드를 정정하세요.`));
  } else if (isLcPayment(profile.paymentTerms) && !(profile.lcNo || '').trim()) {
    issues.push(mk('r11-lc-missing', 'invoice', 'lcNo',
      `결제조건이 L/C인데 L/C 번호가 비어 있습니다. 신용장 번호(예: LC-2026-0001)를 입력하세요.`));
  }
  if (isLcPayment(profile.paymentTerms) && !(profile.lcDate || '').trim()) {
    issues.push(mk('r11-lc-date-missing', 'invoice', 'lcDate',
      '결제조건이 L/C인데 L/C Date가 비어 있습니다.'));
  }

  // ── R8. 금액 산술 (error) ───────────────────────────
  // quantity × unit_price = amount (통화별 소수 자릿수로 반올림 후 비교).
  const qty = num(profile.quantity), price = num(profile.unitPrice), total = num(profile.totalAmount);
  const dp = decimalsFor(profile.currency);
  if (qty !== null && price !== null && total !== null && qty > 0 && price > 0) {
    const expected = roundTo(qty * price, dp);
    if (roundTo(total, dp) !== expected) {
      issues.push(mk('r8-amount-arithmetic', 'invoice', 'totalAmount',
        `금액이 맞지 않습니다: 수량 ${qty} × 단가 ${price} = ${expected} 이어야 하는데 총액이 ${roundTo(total, dp)}입니다(통화 ${up(profile.currency) || 'USD'}, 소수 ${dp}자리).`));
    }
  }

  return issues;
}

// ── R10. 패킹리스트 ↔ 상업송장 정합성 (warning) ─────────────────────
// 세관·은행이 두 서류를 대조하므로 품명·수량이 어긋나면 경고한다.
// 두 문서는 같은 거래 데이터에서 파생되어 보통 일치하지만, 패킹 고유 박스 내역
// (박스수 × 박스당 수량)이 인보이스 수량과 안 맞으면 잡는다.
// 대조 근거가 없으면(박스 내역 미입력 등) 억지 판정 대신 조용히 통과 + 로그(R5/R6와 동일 정책).
const norm = (s?: string) => (s || '').toUpperCase().replace(/\s+/g, ' ').trim();

/** 패킹 품목의 총 EA = Σ(박스수 × 박스당 수량). 박스 내역이 하나도 없으면 null(대조 불가). */
function packingTotalEA(items: InvoiceItem[]): number | null {
  let sum = 0, counted = 0;
  for (const it of items) {
    const r = it as Record<string, any>;
    const boxes = num(r.boxes ?? r.packageCount);
    const ea = num(r.eaPerBox);
    if (boxes !== null && ea !== null && boxes > 0 && ea > 0) { sum += boxes * ea; counted++; }
  }
  return counted > 0 ? sum : null;
}

export function checkPackingInvoiceConsistency(
  invoice: InvoiceData,
  packingList: PackingListData,
  logs?: AgentLog[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const skipLog = (msg: string) => { if (logs) logs.push(createLog('Compliance Agent', msg, 'info')); };

  const invItems = invoice.items || [];
  const plItems = packingList.items || [];

  // 수량 대조: 패킹 박스 내역이 있을 때만.
  const invQty = invItems.reduce((a, it) => a + (num((it as any).quantity) ?? 0), 0);
  const plEA = packingTotalEA(plItems);
  if (plEA === null) {
    skipLog('R10 수량 대조 건너뜀 — 패킹리스트 박스 내역(박스수/박스당 수량) 미입력. 오탐 방지.');
  } else if (invQty > 0 && plEA !== invQty) {
    issues.push(mk('r10-packing-qty-mismatch', 'packing_list', 'quantity',
      `패킹리스트 총 수량(박스 내역 합계 ${plEA.toLocaleString()})이 상업송장 수량(${invQty.toLocaleString()})과 다릅니다. 세관·은행 서류 대조 시 불일치로 걸릴 수 있으니 확인하세요.`));
  }

  // 품명 대조: 같은 순번 품목의 품명이 다르면 경고(둘 다 값이 있을 때만).
  const n = Math.min(invItems.length, plItems.length);
  for (let i = 0; i < n; i++) {
    const a = norm((invItems[i] as any).description);
    const b = norm((plItems[i] as any).description);
    if (a && b && a !== b) {
      issues.push(mk('r10-packing-desc-mismatch', 'packing_list', 'itemName',
        `패킹리스트 품명("${(plItems[i] as any).description}")이 상업송장 품명("${(invItems[i] as any).description}")과 다릅니다. 두 서류의 품명은 일치해야 합니다.`));
    }
  }

  return issues;
}
