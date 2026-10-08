/**
 * HS 추천 근거 중 AI 문장에 기대지 않는 부분 — 해당 종류, 분류 경로, 코드가 달라지는 조건.
 *
 * AI가 reasoning을 한 문장으로만 돌려주는 일이 잦아, 화주가 납득할 근거는
 * 관세청 사전·관세율표 제목·보조표(hsProductScopes)에서 조립해 항상 같은 모양으로 보여 준다.
 * 사용자가 고른 종류와 어긋나는 문장이 나올 수 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import type { VerifiedHSCodeSuggestion } from '../types/hsCodeSuggestion';
import { lookupHSHeadingKo, lookupHSHierarchy } from '../services/hsDataService';
import { productScopeForCode } from '../services/hsProductScopes';

const TITLE_LIMIT = 70;
const clip = (title: string) =>
  title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT - 1)}…` : title;

interface Props {
  suggestion: VerifiedHSCodeSuggestion;
  /** 1순위 후보에만 해당 종류·달라지는 조건까지 보여 준다. */
  primary: boolean;
}

export default function HSSuggestionGrounds({ suggestion, primary }: Props) {
  const scope = useMemo(() => productScopeForCode(suggestion.code), [suggestion.code]);
  const [titles, setTitles] = useState({ heading: '', subheading: '' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [headingKo, hierarchy] = await Promise.all([
        lookupHSHeadingKo(suggestion.code),
        lookupHSHierarchy(suggestion.code),
      ]);
      if (cancelled) return;
      setTitles({ heading: headingKo || hierarchy.heading, subheading: hierarchy.subheading });
    })();
    return () => { cancelled = true; };
  }, [suggestion.code]);

  const digits = suggestion.code.replace(/\D/g, '');
  const heading = digits.slice(0, 4);
  const subheading = `${heading}.${digits.slice(4, 6)}`;
  const subheadingTitle = scope?.ko || titles.subheading;

  return (
    <>
      {primary && scope && (
        <div className="shipper-hs-reason-block">
          <span className="shipper-hs-reason-label">해당 종류</span>
          <p>{scope.label} — {scope.ko}</p>
        </div>
      )}
      <div className="shipper-hs-reason-block">
        <span className="shipper-hs-reason-label">분류 경로</span>
        <ol className="shipper-hs-path" aria-label="관세청 분류 경로">
          <li><b>{heading}</b>{titles.heading ? ` ${clip(titles.heading)}` : ''}</li>
          <li><b>{subheading}</b>{subheadingTitle ? ` ${clip(subheadingTitle)}` : ''}</li>
          <li><b>{suggestion.formattedCode}</b> {suggestion.koreanName}</li>
        </ol>
      </div>
      {primary && scope?.basis && (
        <div className="shipper-hs-reason-block">
          <span className="shipper-hs-reason-label">코드가 달라지는 조건</span>
          <p>{scope.basis}</p>
          {scope.siblings.length > 0 && (
            <div className="shipper-hs-factors">
              {scope.siblings.map((sibling) => (
                <span key={sibling.formattedSubheading} className="shipper-hs-factor shipper-hs-term">
                  {sibling.label} <i aria-hidden="true">→</i> {sibling.formattedSubheading}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
