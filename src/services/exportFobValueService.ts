/**
 * 수출 — 수출신고서용 FOB 환산액(참고) 계산.
 *
 * 송장 총액(외화)을 원화로 환산한 뒤, 조건에 따라 국제운송 구간의 운임·보험료(원)를 차감한다.
 *   FOB: 송장 총액 × 환율
 *   CFR: 송장 총액 × 환율 − 국제운임
 *   CIF: 송장 총액 × 환율 − 국제운임 − 보험료
 * 전제: 송장 총액이 해당 Incoterms 기준 금액이고, 차감할 비용이 그 총액에 포함돼 있다.
 * 그 밖의 조건(FCA·FAS·EXW 등)은 FOB로 간주하지 않고 별도 비용 확인이 필요하다고 돌려준다.
 *
 * 공식 수출신고가격 확정값이 아니며, 신고서 끝자리 처리 기준도 적용하지 않는다(원 단위 미반올림 값을 돌려준다).
 * 수입 과세가격 계산(calcDutiableValue)과는 별개다.
 */

export type ExportFobIncoterms = 'FOB' | 'CFR' | 'CIF';

const SUPPORTED: ReadonlySet<string> = new Set<ExportFobIncoterms>(['FOB', 'CFR', 'CIF']);

export interface ExportFobValueInput {
  /** 송장 총액(송장 통화 기준) */
  invoiceAmount: number | string | '' | null | undefined;
  /** 송장 통화 1단위당 원화 */
  rate: number | null | undefined;
  incoterms: string | null | undefined;
  /** 국제운임(원) — 빈칸은 미입력, 0은 사용자가 명시한 0원 */
  freightKrw: number | string | '' | null | undefined;
  /** 보험료(원) — 빈칸은 미입력, 0은 사용자가 명시한 0원 */
  insuranceKrw: number | string | '' | null | undefined;
}

export type ExportFobValueResult =
  | {
      status: 'fob';
      incoterms: ExportFobIncoterms;
      invoiceKrw: number;
      freightKrw: number | null;
      insuranceKrw: number | null;
      fobKrw: number;
    }
  /** 필요한 값이 비어 아직 계산하지 않는다 — missing: 입력이 필요한 칸 */
  | { status: 'pending'; incoterms: string; invoiceKrw: number; reason: string; missing: Array<'incoterms' | 'freightKrw' | 'insuranceKrw'> }
  /** 입력값이 잘못돼 숫자 대신 확인 안내를 보여준다 */
  | { status: 'invalid'; incoterms: string; invoiceKrw: number | null; reason: string }
  /** FOB·CFR·CIF 외 조건 — 송장금액 원화 환산만 참고로 보여준다 */
  | { status: 'unsupported'; incoterms: string; invoiceKrw: number; reason: string };

type Parsed = { kind: 'empty' } | { kind: 'value'; value: number } | { kind: 'invalid' };

/** 빈칸은 empty로 남기고(0원으로 바꾸지 않음), 숫자가 아니면 invalid. 쉼표는 허용한다. */
export function parseKrwInput(raw: number | string | '' | null | undefined): Parsed {
  if (raw === null || raw === undefined) return { kind: 'empty' };
  if (typeof raw === 'number') return Number.isFinite(raw) ? { kind: 'value', value: raw } : { kind: 'invalid' };
  const text = raw.replace(/,/g, '').trim();
  if (text === '') return { kind: 'empty' };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { kind: 'invalid' };
  return { kind: 'value', value: Number(text) };
}

export function calcExportFobValue(input: ExportFobValueInput): ExportFobValueResult {
  const incoterms = (input.incoterms ?? '').trim().toUpperCase();

  const amount = parseKrwInput(input.invoiceAmount);
  if (amount.kind !== 'value' || amount.value <= 0) {
    return { status: 'invalid', incoterms, invoiceKrw: null, reason: '송장 총액이 올바르지 않아 환산할 수 없습니다. 송장 금액을 확인해 주세요.' };
  }
  const rate = input.rate;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    return { status: 'invalid', incoterms, invoiceKrw: null, reason: '적용 환율을 확인할 수 없어 환산하지 않았습니다.' };
  }
  const invoiceKrw = amount.value * rate;

  if (!incoterms) {
    return { status: 'pending', incoterms, invoiceKrw, reason: '거래조건(Incoterms)을 선택하면 금액을 환산할 수 있어요.', missing: ['incoterms'] };
  }
  if (!SUPPORTED.has(incoterms)) {
    return {
      status: 'unsupported',
      incoterms,
      invoiceKrw,
      reason: `${incoterms} 조건은 선적까지의 비용을 따로 확인해야 해서, 송장금액만 원화로 보여드려요.`,
    };
  }

  const freight = parseKrwInput(input.freightKrw);
  const insurance = parseKrwInput(input.insuranceKrw);
  const needsFreight = incoterms === 'CFR' || incoterms === 'CIF';
  const needsInsurance = incoterms === 'CIF';

  if ((needsFreight && freight.kind === 'invalid') || (needsInsurance && insurance.kind === 'invalid')) {
    return { status: 'invalid', incoterms, invoiceKrw, reason: '운임·보험료(원)는 숫자로 입력해 주세요.' };
  }
  if ((needsFreight && freight.kind === 'value' && freight.value < 0) || (needsInsurance && insurance.kind === 'value' && insurance.value < 0)) {
    return { status: 'invalid', incoterms, invoiceKrw, reason: '운임·보험료(원)는 0 이상이어야 합니다.' };
  }

  const missing: Array<'freightKrw' | 'insuranceKrw'> = [];
  if (needsFreight && freight.kind === 'empty') missing.push('freightKrw');
  if (needsInsurance && insurance.kind === 'empty') missing.push('insuranceKrw');
  if (missing.length) {
    return {
      status: 'pending',
      incoterms,
      invoiceKrw,
      reason: incoterms === 'CIF'
        ? '국제운임과 보험료를 입력하면 FOB 기준 환산액을 확인할 수 있어요.'
        : '국제운임을 입력하면 FOB 기준 환산액을 확인할 수 있어요.',
      missing,
    };
  }

  const freightKrw = needsFreight && freight.kind === 'value' ? freight.value : null;
  const insuranceKrw = needsInsurance && insurance.kind === 'value' ? insurance.value : null;
  const fobKrw = invoiceKrw - (freightKrw ?? 0) - (insuranceKrw ?? 0);
  if (fobKrw <= 0) {
    return { status: 'invalid', incoterms, invoiceKrw, reason: '차감할 운임·보험료가 송장금액 원화 환산액보다 커서 계산할 수 없습니다. 입력값을 확인해 주세요.' };
  }

  return { status: 'fob', incoterms: incoterms as ExportFobIncoterms, invoiceKrw, freightKrw, insuranceKrw, fobKrw };
}
