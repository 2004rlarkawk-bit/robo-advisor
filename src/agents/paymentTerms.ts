/**
 * 결제조건 분류 — L/C(신용장) 결제인지, 비신용장(T/T 계열) 결제인지 판정한다.
 * 파생(DocumentAgent)에서 L/C 필드 공란 처리와, 검증(R11)에서 결제조건↔L/C 정합성 판단에 공용으로 쓴다.
 */

/** 신용장(Letter of Credit) 결제 여부. */
export function isLcPayment(paymentTerms?: string): boolean {
  return /l\/?c|신용장|letter of credit|documentary credit/i.test(paymentTerms || '');
}

/**
 * 비신용장(송금·추심 등) 결제 여부 — T/T 계열.
 * T/T, 전신송금, D/P, D/A, CAD, O/A(open account), 선/후불 송금, remittance 등.
 * L/C 문구가 함께 있으면(혼합 표기) 비신용장으로 단정하지 않는다(모순은 R11이 잡는다).
 */
export function isNonLcPayment(paymentTerms?: string): boolean {
  const p = paymentTerms || '';
  return /t\/?t|telegraphic|전신송금|송금|\bd\/[pa]\b|\bcad\b|\bo\/a\b|open account|remittance|advance payment|사전송금|선불|후불/i.test(p);
}
