/**
 * 수출 포워더 운영 상태(진행단계·Master B/L 번호·전달 이력) 저장/조회.
 * import 포워더의 forwarderCaseService와 동일한 패턴 — workflow_data.exportForwarderCase만
 * 병합 갱신하고, 화물·당사자·B/L 발행정보 같은 거래 본문(form_data)은 건드리지 않는다.
 */
import { supabase } from '../lib/supabase';
import type { TradeWorkflowData } from '../types/tradeFormData';
import type { ExportForwarderCaseState } from '../types/exportForwarderCase';

/** 포워더 수출 운영 상태 저장 — workflow_data.exportForwarderCase만 병합 갱신한다. */
export async function saveExportForwarderCaseState(
  tradeId: string,
  patch: Partial<Omit<ExportForwarderCaseState, 'updatedAt' | 'activity'>>,
  /** 처리 이력에 덧붙일 문장들 */
  appendActivity: string[] = [],
): Promise<ExportForwarderCaseState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user?.id) throw new Error('로그인이 필요합니다.');

  const { data: row, error: readError } = await supabase
    .from('trades')
    .select('workflow_data')
    .eq('id', tradeId)
    .maybeSingle();
  if (readError) throw readError;
  if (!row) throw new Error('수정할 거래를 찾지 못했습니다.');

  const workflowData = (row.workflow_data ?? {}) as TradeWorkflowData;
  const previous = workflowData.exportForwarderCase;
  const now = new Date().toISOString();
  const next: ExportForwarderCaseState = {
    progress: { ...(previous?.progress ?? {}), ...(patch.progress ?? {}) },
    masterBlNo: patch.masterBlNo !== undefined ? patch.masterBlNo : previous?.masterBlNo ?? '',
    // 부킹 정보는 통째로 갈아끼우지 않고 기존 값 위에 덮어 쓴다(부분 수정 지원).
    booking: patch.booking !== undefined
      ? { ...(previous?.booking ?? {}), ...patch.booking }
      : previous?.booking,
    shipperNotifiedAt: patch.shipperNotifiedAt !== undefined ? patch.shipperNotifiedAt : previous?.shipperNotifiedAt ?? null,
    shippingAdviceSentAt: patch.shippingAdviceSentAt !== undefined ? patch.shippingAdviceSentAt : previous?.shippingAdviceSentAt ?? null,
    completedAt: patch.completedAt !== undefined ? patch.completedAt : previous?.completedAt ?? null,
    activity: [
      ...(previous?.activity ?? []),
      ...appendActivity.map((text) => ({ at: now, text })),
    ],
    updatedAt: now,
  };

  const { error: writeError } = await supabase
    .from('trades')
    .update({ workflow_data: { ...workflowData, exportForwarderCase: next } })
    .eq('id', tradeId);
  if (writeError) throw writeError;

  // source_trade_id가 있으면 DB 트리거가 같은 트랜잭션에서 원 화주 의뢰에도
  // exportForwarderCase를 복제한다. 실패 시 이 UPDATE 전체가 롤백된다.
  return next;
}
