import { describe, expect, it } from 'vitest';
import { deriveForwarderCase, sortForwarderCases } from './forwarderCaseService';
import { normalizeImportExtractedFields } from './importDocumentAnalysisService';
import type { SavedTrade } from '../types';
import type { ImportRisk, ImportTradeSnapshot, ImportValidation, UserTradeRole } from '../types/importTrade';
import type { ForwarderCaseState } from '../types/forwarderCase';

function makeSnapshot(overrides: {
  role?: UserTradeRole;
  validations?: ImportValidation[];
  risks?: ImportRisk[];
} = {}): ImportTradeSnapshot {
  return {
    direction: 'import',
    role: overrides.role ?? 'shipper',
    documents: [],
    analysis: {
      extracted: normalizeImportExtractedFields({
        importer: '인천테크',
        shipper: 'SHENZHEN ELEC',
        blNo: 'MBLKR2026001',
        vesselName: 'HYUNDAI SINGAPORE',
        estimatedArrivalDate: '2026-09-20',
      }),
      validations: overrides.validations ?? [],
      comparison: [],
    },
    risks: overrides.risks ?? [],
    generatedAt: '2026-09-01T00:00:00.000Z',
  };
}

function makeTrade(overrides: Partial<SavedTrade> & { snapshot?: ImportTradeSnapshot | null }): SavedTrade {
  const { snapshot = makeSnapshot(), ...rest } = overrides;
  return {
    id: 'trade-1',
    profile: { tradeType: 'import' } as SavedTrade['profile'],
    tradeDirection: 'import',
    tradeRole: 'shipper',
    documents: [],
    issues: [],
    status: 'submitted',
    submittedAt: '2026-09-02T00:00:00.000Z',
    generatedDocs: snapshot ? { importTrade: snapshot } : {},
    createdAt: '2026-09-01T00:00:00.000Z',
    ...rest,
  } as SavedTrade;
}

const blockerValidation: ImportValidation = {
  id: 'val-1',
  field: '도착항',
  message: 'B/L과 C/I의 도착항이 다릅니다.',
  severity: 'error',
  documents: ['bill_of_lading', 'commercial_invoice'],
};

describe('deriveForwarderCase', () => {
  it('화주가 최종 제출한 수입 거래는 의뢰 수신 건이 된다', () => {
    const result = deriveForwarderCase(makeTrade({}));
    expect(result).not.toBeNull();
    expect(result?.origin).toBe('shipper_request');
    expect(result?.stage).toBe('received');
    expect(result?.blNo).toBe('MBLKR2026001');
    expect(result?.nextAction).toBe('서류 대사 결과 확인');
  });

  it('화주가 아직 제출하지 않은 거래와 수출 거래는 제외한다', () => {
    expect(deriveForwarderCase(makeTrade({ status: 'generated' }))).toBeNull();
    expect(deriveForwarderCase(makeTrade({ tradeDirection: 'export' }))).toBeNull();
    expect(deriveForwarderCase(makeTrade({ snapshot: null }))).toBeNull();
  });

  it('구 포워더 플로우 거래의 상태를 새 단계로 이월한다', () => {
    const inProgress = deriveForwarderCase(
      makeTrade({ tradeRole: 'forwarder', status: 'in_progress', snapshot: makeSnapshot({ role: 'forwarder' }) }),
    );
    expect(inProgress?.origin).toBe('direct_upload');
    expect(inProgress?.stage).toBe('clearance');

    const done = deriveForwarderCase(
      makeTrade({ tradeRole: 'forwarder', status: 'submitted', snapshot: makeSnapshot({ role: 'forwarder' }) }),
    );
    expect(done?.stage).toBe('done');
  });

  it('검증 오류는 차단 이슈로 집계되고, 확인 처리하면 다음 조치가 바뀐다', () => {
    const snapshot = makeSnapshot({ validations: [blockerValidation] });
    const unresolvedState: ForwarderCaseState = { stage: 'review', updatedAt: '2026-09-03T00:00:00.000Z' };
    const unresolved = deriveForwarderCase(makeTrade({ snapshot, forwarderCase: unresolvedState }));
    expect(unresolved?.blockerCount).toBe(1);
    expect(unresolved?.nextAction).toBe('차단 이슈 1건 해결');

    const resolvedState: ForwarderCaseState = {
      stage: 'review',
      issueResolutions: { 'v-val-1': true },
      updatedAt: '2026-09-03T00:00:00.000Z',
    };
    const resolved = deriveForwarderCase(makeTrade({ snapshot, forwarderCase: resolvedState }));
    expect(resolved?.blockerCount).toBe(0);
    expect(resolved?.nextAction).toBe('검토 완료 — 통관 진행으로 이동');
  });
});

describe('보완 요청(반송) 루프', () => {
  const baseRequest = { reason: '총중량 불일치 확인 요청', issueTitles: ['총중량'], requestedAt: '2026-09-10T00:00:00.000Z' };

  it('요청 중이면 다음 조치가 회신 대기로 바뀌고 화주 수정 중에도 큐에 남는다', () => {
    const waiting = deriveForwarderCase(makeTrade({
      forwarderCase: { stage: 'review', returnRequest: baseRequest, updatedAt: '2026-09-10T00:00:00.000Z' },
    }));
    expect(waiting?.nextAction).toBe('화주 보완 회신 대기');
    expect(waiting?.shipperEditing).toBe(false);

    const editing = deriveForwarderCase(makeTrade({
      status: 'generated',
      forwarderCase: { stage: 'review', returnRequest: baseRequest, updatedAt: '2026-09-10T00:00:00.000Z' },
    }));
    expect(editing).not.toBeNull();
    expect(editing?.shipperEditing).toBe(true);
    expect(editing?.nextAction).toBe('화주 수정 중 — 재제출 대기');
  });

  it('화주가 재제출해 회신되면 재검토 시작을 안내한다', () => {
    const resolved = deriveForwarderCase(makeTrade({
      forwarderCase: {
        stage: 'review',
        returnRequest: { ...baseRequest, resolvedAt: '2026-09-11T00:00:00.000Z' },
        updatedAt: '2026-09-11T00:00:00.000Z',
      },
    }));
    expect(resolved?.nextAction).toBe('화주 재제출 확인 — 재검토 시작');
  });

  it('보완 요청이 없는 미제출 화주 거래는 여전히 큐에서 제외된다', () => {
    expect(deriveForwarderCase(makeTrade({ status: 'generated' }))).toBeNull();
  });
});

describe('sortForwarderCases', () => {
  it('진행 단계 우선, 완료 건은 뒤로 보낸다', () => {
    const received = deriveForwarderCase(makeTrade({ id: 'a' }))!;
    const done = deriveForwarderCase(
      makeTrade({ id: 'b', tradeRole: 'forwarder', status: 'submitted', snapshot: makeSnapshot({ role: 'forwarder' }) }),
    )!;
    expect(sortForwarderCases([done, received]).map((item) => item.tradeId)).toEqual(['a', 'b']);
  });
});
