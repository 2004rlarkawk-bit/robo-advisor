import { CheckCircle2, FilePlus2 } from 'lucide-react';
import type { ImportDocumentType, ImportExtractedFields } from '../../types/importTrade';
import {
  evaluateHandoffReadiness,
  HANDOFF_REQUIRED_DOCUMENTS,
  handoffDocumentLabel,
} from '../../utils/importHandoffReadiness';

interface Props {
  documentTypes: ImportDocumentType[];
  fields?: ImportExtractedFields | null;
  confirmedHsCodes?: (string | undefined)[];
  /** 준비 완료 문구 — 화주 화면과 포워더 화면에서 다르게 쓴다. */
  readyTitle?: string;
  readyNote?: string;
}

/**
 * 전달 준비 상태 — 필요한 서류와 신고 준비 정보가 있는지만 보여준다.
 * 값의 불일치나 DRAFT B/L 같은 내용은 여기서 다시 경고로 만들지 않는다.
 */
export default function ImportHandoffReadyCard({
  documentTypes,
  fields,
  confirmedHsCodes,
  readyTitle = '포워더 전달 준비 완료',
  readyNote = '필요한 서류와 신고 준비 정보가 모두 있습니다.',
}: Props) {
  const readiness = evaluateHandoffReadiness({ documentTypes, fields, confirmedHsCodes });
  const present = new Set(documentTypes);

  return (
    <section className={`form-card import-card import-handoff${readiness.ready ? ' is-ready' : ''}`} aria-label="전달 준비 상태">
      <div className="import-handoff-head">
        {readiness.ready ? <CheckCircle2 size={20} aria-hidden="true" /> : <FilePlus2 size={20} aria-hidden="true" />}
        <div>
          <h2>{readiness.ready ? readyTitle : '서류 추가 필요'}</h2>
          <p>
            {readiness.ready
              ? readyNote
              : '아래 항목이 준비되면 포워더에게 전달할 수 있습니다.'}
          </p>
        </div>
      </div>

      <ul className="import-handoff-docs">
        {HANDOFF_REQUIRED_DOCUMENTS.map((type) => {
          const has = present.has(type);
          return (
            <li key={type} className={has ? 'is-present' : 'is-missing'}>
              <span className="import-handoff-mark" aria-hidden="true">{has ? '✓' : '+'}</span>
              <span>{handoffDocumentLabel(type)}</span>
              <span className="import-handoff-state">{has ? '있음' : '추가 필요'}</span>
            </li>
          );
        })}
      </ul>

      {readiness.missingFields.length > 0 && (
        <p className="import-handoff-fields">
          비어 있는 신고 준비 정보: {readiness.missingFields.join(' · ')}
        </p>
      )}
    </section>
  );
}
