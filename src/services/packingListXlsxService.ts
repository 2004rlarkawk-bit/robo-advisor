import type { PackingListData } from '../types';
import {
  mapPackingListToSchema,
  exportPackingListWithTemplate,
  MAX_PACKING_ITEMS,
  type PackingListSchema,
} from './packingListXlsxCore';
// 고정 템플릿(무역협회 표준 패킹리스트) — 서식/수식 무수정, 셀 좌표에만 값 주입.
// 브라우저 전용 `?url` 임포트는 이 얇은 래퍼에만 두고, 순수 로직은 packingListXlsxCore(node 재사용 가능)에 있다.
import templateUrl from '../../templates/packing_list_template.xlsx?url';

// 앱/테스트가 기존 경로에서 그대로 임포트하도록 core를 재노출한다.
export {
  mapPackingListToSchema,
  renderPackingListPreviewHtml,
  PACKING_ITEM_START_ROW,
  MAX_PACKING_ITEMS,
  type PackingListItemRow,
  type PackingListSchema,
} from './packingListXlsxCore';

let templateCache: ArrayBuffer | null = null;
async function loadTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache;
  const res = await fetch(templateUrl);
  if (!res.ok) throw new Error(`패킹리스트 템플릿 로드 실패 (${res.status})`);
  templateCache = await res.arrayBuffer();
  return templateCache;
}

/** 스키마 데이터를 고정 템플릿에 주입해 xlsx Blob을 반환한다(템플릿은 런타임 fetch). */
export async function exportPackingList(data: PackingListSchema): Promise<Blob> {
  // 용량 가드는 fetch 이전에 먼저 던진다(24건 초과면 네트워크 없이 즉시 실패).
  if (data.items.length > MAX_PACKING_ITEMS) {
    throw new Error(`패킹리스트 품목이 ${data.items.length}건입니다. 템플릿은 최대 ${MAX_PACKING_ITEMS}건까지만 지원합니다(행 추가 시 서식이 깨짐). 품목을 나눠 여러 건으로 작성하세요.`);
  }
  const buf = await loadTemplate();
  return exportPackingListWithTemplate(data, buf);
}

/** PackingListData → xlsx Blob (매핑 + 주입을 한 번에) */
export async function buildPackingListXlsx(pl: PackingListData): Promise<Blob> {
  return exportPackingList(mapPackingListToSchema(pl));
}
