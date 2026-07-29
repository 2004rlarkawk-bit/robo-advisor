import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TradeProfile } from '../types';

// 파이프라인이 관세환율·사업자조회 Edge Function을 라이브 호출하지 않도록 supabase를 목킹 —
// 시뮬레이션 폴백을 타게 해 검증이 결정적이 되게 한다(네트워크 의존 제거).
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import { OrchestratorAgent } from '../agents/OrchestratorAgent';
import {
  createPerfectTestProfile,
  createNormalDocumentIdentifiers,
  createProfileForNewTrade,
  createRevisionTestProfile,
  createTestSubmissionMeta,
  fillMissingTestValues,
  getTestSubmissionMeta,
  removeDevOnlyFields,
} from './devTestDataService';

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue({ data: null, error: new Error('edge disabled in test') });
});

const emptyProfile: TradeProfile = {
  tradeType: 'export', itemName: '', hsCode: '', loadPort: '', dischargePort: '', incoterms: '',
  quantity: '', weight: '', departureDate: '', arrivalDate: '', companyName: '', contact: '',
};

describe('개발 테스트 데이터', () => {
  it('빈 값만 채우고 0, false와 기존 문자열은 유지한다', () => {
    expect(fillMissingTestValues(
      { text: 'default', count: 10, enabled: true, blank: 'filled' },
      { text: 'existing', count: 0, enabled: false, blank: '   ' },
    )).toEqual({ text: 'existing', count: 0, enabled: false, blank: 'filled' });
  });

  it('완벽 테스트는 기존 유효값을 보존하고 미래 날짜를 채운다', () => {
    const result = createPerfectTestProfile(
      { ...emptyProfile, companyName: '기존 회사' },
      new Date('2026-07-14T00:00:00.000Z'),
    );
    expect(result.companyName).toBe('기존 회사');
    expect(result.departureDate).toBe('2026-07-21');
    expect(result.arrivalDate).toBe('2026-08-04');
    expect(result.hsCode).toBe('620211');
    expect(result.documentNo).toBeUndefined();
    expect(result.invoiceNo).toBeUndefined();
    expect(result.referenceNo).toBeUndefined();
    expect(result.blNo).toBeUndefined();
  });

  it('수정 필요 테스트는 생성 가능한 기본값과 의도적인 검증 누락을 함께 만든다', () => {
    const result = createRevisionTestProfile(emptyProfile, new Date('2026-07-14T00:00:00.000Z'));
    expect(result.itemName).toBe('Test Cargo');
    expect(result.loadPort).toBe('Busan Port');
    expect(result.hsCode).toBe('');
    expect(result.weight).toBe('');
    expect(result.departureDate).toBe('');
  });

  it('완벽 테스트 프로필은 실제 검증에서 차단 이슈가 없다', async () => {
    const result = await new OrchestratorAgent().run({
      profile: createPerfectTestProfile(emptyProfile, new Date('2026-07-14T00:00:00.000Z')),
      useLLM: false,
    });
    // 정책: error만 생성 차단. 완벽 프로필은 차단(error) 이슈가 없어야 한다.
    // (한글 항구/주소 등은 R7 warning으로 배지만 표시 — 차단 아님)
    expect(result.issues?.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('수정 필요 프로필은 실제 문서 생성 파이프라인을 완료하면서 차단 이슈를 유지한다', async () => {
    const result = await new OrchestratorAgent().run({
      profile: createRevisionTestProfile(emptyProfile, new Date('2026-07-14T00:00:00.000Z')),
      useLLM: false,
    });
    expect(result.error).toBeUndefined();
    expect(result.documents?.documents.length).toBeGreaterThan(0);
    expect(result.issues?.issues.some((issue) => issue.severity !== 'info')).toBe(true);
  });

  it('제출 시점 메타데이터를 생성하고 읽는다', () => {
    const meta = createTestSubmissionMeta('needs_revision', 2, new Date('2026-07-14T01:02:03.000Z'));
    expect(getTestSubmissionMeta({ _testMeta: meta })).toEqual(meta);
    expect(meta.submittedWithValidationErrors).toBe(true);
  });

  it('테스트 모드 해제 시 거래값은 유지하고 테스트 식별자와 메타데이터만 제거한다', () => {
    const result = removeDevOnlyFields({
      ...emptyProfile,
      itemName: '캐시미어 여성용 코트',
      quantity: 100,
      blNo: 'DEV-BL-001',
      invoiceNo: 'test_invoice_1',
      documentNo: 'DEV-DOCUMENT-1',
      referenceNo: 'TEST-001',
      _testMeta: { isTestSubmission: true },
    } as TradeProfile);
    expect(result.itemName).toBe('캐시미어 여성용 코트');
    expect(result.quantity).toBe(100);
    expect(result.blNo).toBe('');
    expect(result.invoiceNo).toBe('');
    expect(result.documentNo).toBe('');
    expect(result.referenceNo).toBe('');
    expect('_testMeta' in result).toBe(false);
  });

  it('문서 생성 시 일반 번호를 만들고 사용자가 입력한 정상 번호는 유지한다', () => {
    const now = new Date('2026-07-14T01:02:03.456Z');
    const generated = createNormalDocumentIdentifiers(
      { ...emptyProfile, invoiceNo: 'CUSTOM-INV-100', blNo: 'DEV-BL-OLD' },
      now,
    );
    expect(generated.documentNo).toMatch(/^DOC-20260714-\d{6}$/);
    expect(generated.invoiceNo).toBe('CUSTOM-INV-100');
    expect(generated.referenceNo).toMatch(/^REF-20260714-\d{6}$/);
    expect(generated.blNo).toMatch(/^BL-2026-\d{6}$/);
    expect(Object.values(generated).some((value) => typeof value === 'string' && /^(DEV|TEST)[-_]/i.test(value))).toBe(false);
  });

  it('일반 번호가 적용된 프로필을 DocumentAgent와 동일한 송장번호로 생성한다', async () => {
    const profile = createNormalDocumentIdentifiers(
      createPerfectTestProfile(emptyProfile, new Date('2026-07-14T00:00:00.000Z')),
      new Date('2026-07-14T01:02:03.456Z'),
    );
    const result = await new OrchestratorAgent().run({ profile, useLLM: false });
    expect(result.documents?.generatedDocs.invoice?.invoiceNo).toBe(profile.invoiceNo);
    expect(profile.blNo).toMatch(/^BL-2026-/);
    expect(profile.blNo).not.toMatch(/^(DEV|TEST)[-_]/i);
  });

  it('신규 거래 복사에서 과거 테스트 메타데이터를 제거한다', () => {
    const result = createProfileForNewTrade({ ...emptyProfile, _testMeta: { isTestSubmission: true } } as TradeProfile);
    expect('_testMeta' in result).toBe(false);
  });
});
