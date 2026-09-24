/**
 * UNI-PASS 수입신고 전송 — 지금은 시연용이다.
 *
 * 실제 전자신고는 관세청에 등록된 신고인(관세사 또는 자가통관 승인업체)만 할 수 있고,
 * 공개된 UNI-PASS API는 전부 조회 전용이라 제출 규격 자체가 열려 있지 않다.
 * 그래서 전송 과정과 접수 결과만 흐름대로 보여주고, 실제 호출은 넣지 않는다.
 *
 * 자격과 전송 규격이 확보되면 submitImportDeclaration 안쪽만 실제 호출로 바꾸면 된다.
 * 화면은 이 함수의 반환값에만 기대므로 손댈 필요가 없다.
 */

/** 전송 중 화면에 순서대로 보여줄 단계. */
export const UNIPASS_SUBMIT_STEPS = [
  '신고서를 전자문서(EDI)로 변환',
  '관세청 UNI-PASS 접속',
  '신고자료 접수',
  '신고번호 수신',
] as const;

export interface UnipassSubmitResult {
  /** 관세청이 부여하는 수입신고번호 */
  declarationNo: string;
  /** 접수 시각 */
  acceptedAt: Date;
  /** 접수한 세관 */
  customsOffice: string;
  /** 이 결과가 실제 전송이 아니라는 표시 — 화면에서 이 값을 보고 배지를 띄운다. */
  simulated: true;
}

/** 입력값이 같으면 같은 번호가 나오도록 — 시연 중 화면을 다시 열어도 번호가 바뀌지 않는다. */
function stableSerial(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 1_000_000;
  return String(hash).padStart(6, '0');
}

/**
 * 수입신고번호 — 신고인부호(5) - 연도(2) - 일련번호(6) 형식을 따른다.
 * 신고인부호는 자리를 비워 둘 수 없어 시연용 값을 쓴다.
 */
export function buildDeclarationNo(seed: string, now: Date): string {
  const year = String(now.getFullYear()).slice(2);
  return `04012-${year}-${stableSerial(seed)}`;
}

export interface SubmitInput {
  /** 번호를 고정하는 데 쓰는 값 — B/L 번호를 넘긴다. */
  seed: string;
  /** 신고서에 적힌 세관. 비어 있으면 도착항 기준 기본값을 쓴다. */
  customsOffice?: string;
}

export async function submitImportDeclaration({ seed, customsOffice }: SubmitInput): Promise<UnipassSubmitResult> {
  const now = new Date();
  return {
    declarationNo: buildDeclarationNo(seed || 'PORTAI', now),
    acceptedAt: now,
    customsOffice: customsOffice?.trim() || '부산세관 통관지원과',
    simulated: true,
  };
}
