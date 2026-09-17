/**
 * 수출신고서 초안의 신고가격(FOB) 자동 입력 기준.
 *
 * 송장금액이 곧 FOB 금액인 FOB 조건만 숫자를 채운다. CFR·CIF는 운임·보험료 차감 기준을,
 * FCA·FAS 등은 FOB까지의 비용을 공식 기준으로 확인하기 전까지 빈칸으로 둔다.
 * (화면 참고 카드의 calcExportFobValue 결과는 신고서에 연결하지 않는다.)
 * 신고서 docx 서비스(무거운 라이브러리)와 분리해 화면에서도 가볍게 가져다 쓴다.
 */
export const isFobIncoterms = (incoterms: string | undefined | null) => (incoterms || '').trim().toUpperCase() === 'FOB';

/** 신고가격(FOB) 칸을 빈칸으로 둘 때 보여줄 안내. 숫자를 채우는 FOB 조건이면 null. */
export function exportDeclarationFobNotice(incoterms: string | undefined | null): string | null {
  const code = (incoterms || '').trim().toUpperCase();
  if (code === 'FOB') return null;
  if (code === 'CFR' || code === 'CIF') return '거래조건에 따른 FOB 환산 확인 필요';
  return 'FOB 기준 가격 별도 확인 필요';
}
