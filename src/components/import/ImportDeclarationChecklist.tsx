import { CheckCircle2, MinusCircle } from 'lucide-react';
import type { ImportExtractedFields } from '../../types/importTrade';
import { STANDARD_INCOTERMS } from '../../services/importReconciliationRules';

type RowStatus = 'ready' | 'missing';

interface ChecklistRow {
  key: string;
  label: string;
  /** 신고서에 들어갈 현재 값 */
  value: string;
  status: RowStatus;
}

interface Props {
  fields: ImportExtractedFields;
  /** 마지막 단계의 요약 보기 — 제목만 다르게 쓴다 */
  summary?: boolean;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  ready: '준비됨',
  missing: '미입력',
};

const STATUS_ICON: Record<RowStatus, typeof CheckCircle2> = {
  ready: CheckCircle2,
  missing: MinusCircle,
};

/**
 * 거래조건 표기 정리 — 'F.O.B BUSAN' → 'FOB BUSAN'.
 * 수출자가 점·공백을 섞어 적었을 뿐 값 자체는 멀쩡하므로, 표기만 맞춰 신고값으로 쓴다.
 */
export function normalizeIncoterms(raw: string): { value: string; standard: boolean } {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!cleaned) return { value: '', standard: false };
  const [first, ...rest] = cleaned.split(' ');
  const term = first.replace(/[.-]/g, '');
  if (!STANDARD_INCOTERMS.has(term)) return { value: cleaned, standard: false };
  return { value: [term, ...rest].join(' ').trim(), standard: true };
}

const joinValues = (values: Array<string | undefined>, separator = ' · ') =>
  values.map((value) => value?.trim()).filter(Boolean).join(separator);

/**
 * 신고서에 들어갈 항목이 채워졌는지만 본다.
 *
 * 서류끼리 값이 다른지는 여기서 다시 판정하지 않는다 — 수출자에게서 넘어온 서류는
 * 이미 상대방과 합의된 값이고, 수입자가 고칠 수 있는 것도 아니다(현직자 피드백).
 */
export function buildDeclarationChecklist(fields: ImportExtractedFields): ChecklistRow[] {
  const items = fields.items ?? [];
  const row = (key: string, label: string, value: string): ChecklistRow => ({
    key,
    label,
    value: value.trim(),
    status: value.trim() ? 'ready' : 'missing',
  });

  return [
    row('description', '품명', joinValues(items.map((item) => item.description), ', ')),
    row('quantity', '수량', joinValues(items.map((item) => joinValues([item.quantity, item.quantityUnit], ' ')))),
    row('amount', '금액', joinValues([fields.currency, fields.totalAmount], ' ')),
    row('weight', '중량', joinValues([
      fields.grossWeight ? `총 ${joinValues([fields.grossWeight, fields.grossWeightUnit], ' ')}` : '',
      fields.netWeight ? `순 ${joinValues([fields.netWeight, fields.netWeightUnit], ' ')}` : '',
    ])),
    row('origin', '원산지', joinValues(items.map((item) => item.originCountry), ', ')),
    row('incoterms', '거래조건', normalizeIncoterms(fields.incoterms ?? '').value),
    row('hsk', 'HSK', joinValues(items.map((item) => item.confirmedHSCode), ', ')),
  ];
}

/**
 * 수입신고 준비 현황.
 * "오류 몇 건"이 아니라 신고서에 들어갈 항목이 얼마나 채워졌는지를 보여준다.
 */
export default function ImportDeclarationChecklist({ fields, summary = false }: Props) {
  const rows = buildDeclarationChecklist(fields);
  const ready = rows.filter((entry) => entry.status === 'ready').length;
  const missing = rows.filter((entry) => entry.status === 'missing');

  return (
    <section className="form-card import-card import-checklist" id="import-declaration-checklist">
      <div className="import-card-heading">
        <div><h2>{summary ? '신고자료 요약' : '수입신고 준비 현황'}</h2></div>
      </div>
      {!summary && (
        <div className="import-checklist-progress">
          <strong>{ready}/{rows.length}</strong>
          <span>{missing.length === 0 ? '항목 준비 완료' : `${missing.length}개 항목 미입력`}</span>
        </div>
      )}
      <ul className="import-checklist-rows">
        {rows.map((entry) => {
          const Icon = STATUS_ICON[entry.status];
          return (
            <li key={entry.key} className={`import-checklist-row is-${entry.status}`}>
              <div className="import-checklist-main">
                <span className="import-checklist-icon" aria-hidden="true"><Icon size={17} /></span>
                <span className="import-checklist-label">{entry.label}</span>
                <span className="import-checklist-value">{entry.value || '값 없음'}</span>
                {!summary && <span className={`import-checklist-status is-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
