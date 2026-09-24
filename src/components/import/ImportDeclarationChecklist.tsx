import { AlertCircle, CheckCircle2, MinusCircle } from 'lucide-react';
import type { ImportExtractedFields, ImportRisk } from '../../types/importTrade';
import { STANDARD_INCOTERMS } from '../../services/importReconciliationRules';

type RowStatus = 'ready' | 'check' | 'missing';

interface ChecklistRow {
  key: string;
  label: string;
  /** 신고서에 들어갈 현재 값 */
  value: string;
  status: RowStatus;
  /** 확인이 필요한 이유 — 해당 확인 카드의 설명을 그대로 쓴다 */
  note?: string;
  /** 확인 카드로 이동할 때 쓸 id */
  riskId?: string;
}

interface Props {
  fields: ImportExtractedFields;
  /** 신고값 관련 확인 항목 — FTA·C/O는 다음 단계에서 다룬다 */
  risks: ImportRisk[];
  /** 서류별 값 중 신고할 값을 고른다 */
  onChoose?: (key: string, value: string) => void;
  /** 고른 값을 취소한다 */
  onClearChoice?: (key: string) => void;
  /** HSK 확정 칸으로 이동 */
  onGoHs?: (itemId: string) => void;
  /** 마지막 단계의 요약 보기 — 값만 보여주고 확인 필요 표시는 하지 않는다 */
  summary?: boolean;
}

const STATUS_LABEL: Record<RowStatus, string> = {
  ready: '준비됨',
  check: '확인 필요',
  missing: '미입력',
};

const STATUS_ICON: Record<RowStatus, typeof CheckCircle2> = {
  ready: CheckCircle2,
  check: AlertCircle,
  missing: MinusCircle,
};

/**
 * 어떤 확인 항목이 어느 신고 항목에 걸리는지 — 규칙(IR*)과 AI 검증 결과 제목을 함께 본다.
 * 둘 중 하나만 보면 같은 값인데도 '준비됨'으로 잘못 표시된다.
 */
const ROW_MATCHERS: Record<string, RegExp> = {
  description: /reconcile-IR1\b|품명|description/i,
  quantity: /reconcile-IR2\b|수량|quantity|qty/i,
  amount: /reconcile-IR(6|7|10)\b|금액|통화|amount|currency|invoice/i,
  weight: /reconcile-IR(3|4)\b|중량|weight/i,
  origin: /reconcile-IR11\b|^origin-|원산지|origin/i,
  incoterms: /reconcile-IR9\b|거래조건|incoterms/i,
  hsk: /reconcile-IR8\b|^hs-|hs\s*code|hsk|세번/i,
};

/** 해당 신고 항목에 걸린 미해결 확인 항목을 찾는다. */
function findRisk(risks: ImportRisk[], rowKey: string): ImportRisk | undefined {
  const matcher = ROW_MATCHERS[rowKey];
  return risks.find((risk) => risk.status !== 'resolved' && matcher.test(`${risk.id} ${risk.item}`));
}

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

export function buildDeclarationChecklist(fields: ImportExtractedFields, risks: ImportRisk[]): ChecklistRow[] {
  const items = fields.items ?? [];
  const row = (key: string, label: string, value: string, ignoreRisk = false): ChecklistRow => {
    const risk = ignoreRisk ? undefined : findRisk(risks, key);
    return {
      key,
      label,
      value: value.trim(),
      status: risk ? 'check' : value.trim() ? 'ready' : 'missing',
      ...(risk ? { note: risk.cause, riskId: risk.id } : {}),
    };
  };

  return [
    row('description', '품명', joinValues(items.map((item) => item.description), ', ')),
    row('quantity', '수량', joinValues(items.map((item) => joinValues([item.quantity, item.quantityUnit], ' ')))),
    row('amount', '금액', joinValues([fields.currency, fields.totalAmount], ' ')),
    row('weight', '중량', joinValues([
      fields.grossWeight ? `총 ${joinValues([fields.grossWeight, fields.grossWeightUnit], ' ')}` : '',
      fields.netWeight ? `순 ${joinValues([fields.netWeight, fields.netWeightUnit], ' ')}` : '',
    ])),
    row('origin', '원산지', joinValues(items.map((item) => item.originCountry), ', ')),
    (() => {
      // 표기만 다른 정상 값(F.O.B BUSAN 등)은 정리해서 그대로 쓰고 확인 필요로 띄우지 않는다.
      const incoterms = normalizeIncoterms(fields.incoterms ?? '');
      return row('incoterms', '거래조건', incoterms.value, incoterms.standard);
    })(),
    row('hsk', 'HSK', joinValues(items.map((item) => item.confirmedHSCode), ', ')),
  ];
}

/**
 * 수입신고 준비 현황.
 * "오류 몇 건"이 아니라 신고서에 들어갈 항목이 얼마나 준비됐는지를 보여준다.
 */
export default function ImportDeclarationChecklist({ fields, risks, onChoose, onClearChoice, onGoHs, summary = false }: Props) {
  const rows = buildDeclarationChecklist(fields, summary ? [] : risks);
  const riskById = new Map(risks.map((risk) => [risk.id, risk]));
  const ready = rows.filter((entry) => entry.status === 'ready').length;
  const pending = rows.filter((entry) => entry.status !== 'ready');

  return (
    <section className="form-card import-card import-checklist" id="import-declaration-checklist">
      <div className="import-card-heading">
        <div><h2>{summary ? '신고자료 요약' : '수입신고 준비 현황'}</h2></div>
      </div>
      {!summary && (
        <div className="import-checklist-progress">
          <strong>{ready}/{rows.length}</strong>
          <span>{pending.length === 0 ? '항목 준비 완료' : `${pending.length}개 항목 확인 필요`}</span>
        </div>
      )}
      <ul className="import-checklist-rows">
        {rows.map((entry) => {
          const Icon = STATUS_ICON[entry.status];

          const risk = entry.riskId ? riskById.get(entry.riskId) : undefined;
          const group = risk?.pickGroups?.[0];
          const hsItemId = risk?.fixes?.find((fix) => fix.kind === 'hs')?.itemId;
          return (
            <li key={entry.key} className={`import-checklist-row is-${entry.status}`}>
              <div className="import-checklist-main">
                <span className="import-checklist-icon" aria-hidden="true"><Icon size={17} /></span>
                <span className="import-checklist-label">{entry.label}</span>
                <span className="import-checklist-value">{entry.value || '값 없음'}</span>
                {!summary && <span className={`import-checklist-status is-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>}
                {entry.status === 'check' && hsItemId && onGoHs && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGoHs(hsItemId)}>
                    HSK 정하기
                  </button>
                )}
              </div>
              {entry.status === 'check' && group && onChoose && (
                <div className="import-checklist-pick">
                  <span className="import-checklist-pick-label">신고할 값을 고르세요</span>
                  <div className="import-checklist-pick-choices">
                    {group.choices.map((choice) => {
                      const selected = group.selected === choice.value;
                      return (
                        <button
                          key={`${choice.source}-${choice.value}`}
                          type="button"
                          className={`btn btn-sm import-checklist-choice${selected ? ' is-selected' : ''}`}
                          onClick={() => (selected ? onClearChoice?.(group.key) : onChoose(group.key, choice.value))}
                        >
                          <em>{choice.source}</em>{choice.value}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
