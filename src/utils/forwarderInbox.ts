import type { ForwarderImportCase } from '../types/forwarderCase';

export type InboxCategory = 'new' | 'progress' | 'reply' | 'done';
export type InboxFilter = 'all' | InboxCategory;

/** Missing data must be labelled, not replaced with a guessed company name. */
export function getInboxImporterName(item: Pick<ForwarderImportCase, 'importer'>): string {
  const name = item.importer.trim();
  return !name || /^[-–—]+$/.test(name) ? '화주명 미입력' : name;
}

/** Mutually exclusive inbox groups; reviewing a reply clears returnRequest in the existing workflow. */
export function getInboxState(item: ForwarderImportCase): { category: InboxCategory; label: string; next: string; tone: string } {
  if (item.stage === 'done') return { category: 'done', label: '서류 완료', next: '최종 서류 보기', tone: 'done' };
  if (item.returnRequest?.resolvedAt) return { category: 'reply', label: '보완 회신', next: '수정본 확인', tone: 'reply' };
  if (item.returnRequest) return { category: 'progress', label: item.shipperEditing ? '화주 수정 중' : '화주 회신 대기', next: '회신 대기', tone: 'waiting' };
  if (item.stage === 'received') return { category: 'new', label: '신규 의뢰', next: '서류 검토', tone: 'new' };
  if (item.stage === 'review') return { category: 'progress', label: '서류 검토 중', next: item.blockerCount ? '보완 사항 확인' : '검토 이어하기', tone: 'progress' };
  return item.arrivalNotice?.storagePath
    ? { category: 'progress', label: '서류 마무리 중', next: '완료 전 확인', tone: 'progress' }
    : { category: 'progress', label: 'A/N 작성 중', next: '작성 이어하기', tone: 'progress' };
}

export function getInboxItemName(item: ForwarderImportCase): string {
  const extracted = item.snapshot.analysis.extracted;
  const names = (extracted.items ?? []).map((part) => part.koreanDescription || part.description).filter(Boolean);
  if (names.length) return `${names[0]}${names.length > 1 ? ` 외 ${names.length - 1}개` : ''}`;
  return item.trade.profile.itemName || extracted.productDescription || '품목 미기재';
}

/** Preserve unrecognised source dates instead of truncating them or inventing a day. */
export function formatInboxEta(value: string): string {
  const raw = value.trim();
  if (!raw) return '미정';
  const numeric = raw.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|[T\s])/);
  const english = raw.match(/^([A-Za-z]{3})[.]?\s+(\d{1,2}),?\s+(\d{4})$/);
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const parts = numeric ? [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])]
    : english ? [Number(english[3]), months.indexOf(english[1].toUpperCase()) + 1, Number(english[2])] : null;
  if (!parts) return raw;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return raw;
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}
