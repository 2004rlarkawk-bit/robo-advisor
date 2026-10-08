import { useEffect, useState } from 'react';
import { lookupHSHierarchy } from '../services/hsDataService';
import { productScopeExplanation } from '../services/hsProductScopes';
import type { VerifiedHSCodeSuggestion } from '../types/hsCodeSuggestion';

/**
 * 분류 보조표가 다루는 호(4자리)의 한글 제목 — 관세율표 호 용어를 줄여 적었다.
 * 여기 없는 호는 관세청 데이터의 영문 공식 제목을 그대로 쓴다.
 */
const HEADING_KO: Record<string, string> = {
  '4820': '장부·공책·메모철 등 종이제 문구',
  '8471': '자동자료처리기계(컴퓨터)와 그 단위기기',
  '9101': '손목시계·회중시계 등(케이스가 귀금속인 것)',
  '9102': '손목시계·회중시계 등(제9101호 외의 것)',
  '9401': '의자와 그 부분품',
  '9403': '그 밖의 가구와 그 부분품',
  '9608': '볼펜·펠트펜 등 필기구',
  '9609': '연필·크레용 등',
};

interface Props {
  itemName: string;
  suggestion: VerifiedHSCodeSuggestion;
  /** 사용자가 되묻기에서 직접 고른 소호 — 있으면 '선택한 종류', 없으면 '해당 종류'로 보인다. */
  chosenSubheading: string | null;
}

/**
 * 1순위 추천의 근거를 AI 문장이 아니라 데이터로 조립한다 — 관세청 사전의 호·소호 제목과
 * 앱의 품목 분류 보조표(hsProductScopes) 문구를 그대로 써서, 사용자가 고른 내용과 어긋나지 않는다.
 * 순서: 선택한 종류 → 분류 경로(호 → 소호 → 10자리) → 코드가 달라지는 조건.
 */
export default function HSReasonPath({ itemName, suggestion, chosenSubheading }: Props) {
  const [hierarchy, setHierarchy] = useState<{ heading: string; subheading: string } | null>(null);
  const scope = productScopeExplanation(itemName, suggestion.code);

  useEffect(() => {
    let cancelled = false;
    void lookupHSHierarchy(suggestion.code)
      .then((value) => { if (!cancelled) setHierarchy(value); })
      .catch(() => { if (!cancelled) setHierarchy(null); });
    return () => { cancelled = true; };
  }, [suggestion.code]);

  const digits = suggestion.code.replace(/\D/g, '');
  const subheadingTitle = scope?.ko || hierarchy?.subheading || '';
  const path = [
    `${digits.slice(0, 4)}${HEADING_KO[digits.slice(0, 4)] ? ` ${HEADING_KO[digits.slice(0, 4)]}` : hierarchy?.heading ? ` ${hierarchy.heading}` : ''}`,
    `${digits.slice(0, 4)}.${digits.slice(4, 6)}${subheadingTitle ? ` ${subheadingTitle}` : ''}`,
    `${suggestion.formattedCode} ${suggestion.koreanName}`,
  ];
  const alternatives = scope?.alternatives.slice(0, 3) ?? [];
  const userChose = chosenSubheading !== null && chosenSubheading === digits.slice(0, 6);

  return (
    <>
      {scope && (
        <div className="shipper-hs-reason-block">
          <span className="shipper-hs-reason-label">{userChose ? '선택한 종류' : '해당 종류'}</span>
          <p><strong>{scope.label}</strong> — {scope.ko}</p>
        </div>
      )}
      <div className="shipper-hs-reason-block">
        <span className="shipper-hs-reason-label">분류 경로</span>
        <ol className="shipper-hs-path">
          {path.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </div>
      {scope && (
        <div className="shipper-hs-reason-block">
          <span className="shipper-hs-reason-label">코드가 달라지는 조건</span>
          <p>{scope.basis}</p>
          {alternatives.length > 0 && (
            <div className="shipper-hs-factors">
              {alternatives.map((alt) => (
                <span key={alt.formattedSubheading} className="shipper-hs-factor shipper-hs-term">
                  {alt.label} <i aria-hidden="true">→</i> {alt.formattedSubheading}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
