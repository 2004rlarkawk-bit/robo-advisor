// @vitest-environment happy-dom
/**
 * 서비스 레이어 테스트 — API 파싱·폴백·단위 정규화
 *
 * happy-dom 환경 사용 이유: DOMParser(XML 파싱)와 localStorage(키 관리)가 필요.
 * fetch는 전부 모킹 — 실제 API를 호출하지 않는다.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// vitest happy-dom 환경이 localStorage 전역을 제공하지 않음 → 서비스 모듈이
// import 시점에 storage를 캡처하므로, import보다 먼저(hoisted) 폴리필 주입.
const { invokeMock } = vi.hoisted(() => {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  return { invokeMock: vi.fn() };
});

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

import {
  getCustomsExchangeRate,
  calcDutiableValue,
  verifyBusinessRegistration,
  validateBusinessRegistration,
  getItemTradeStats,
} from './customsApiService';
import {
  getTariffRates,
  getRequirementApproval,
  getCargoProgress,
  getExportFulfillment,
  pickBasicRate,
  estimateDuty,
  type TariffRate,
} from './unipassService';
import { searchLaw, getRelatedLawForIssue } from './lawService';
import { lookupImportCargo } from './cargoProgressService';

beforeEach(() => {
  invokeMock.mockResolvedValue({ data: null, error: new Error('Edge Function unavailable in test') });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  invokeMock.mockReset();
});

// ===== 관세환율 / 과세가격 =====

describe('관세환율 100단위 통화 정규화', () => {
  it('JPY 시뮬레이션 환율은 1엔 기준으로 정규화된다 (100배 버그 방지)', async () => {
    const fx = await getCustomsExchangeRate('JPY');
    // 고시환율 940.2원(100엔당) → 1엔당 9.402원
    expect(fx.rate).toBeCloseTo(9.402, 3);
    expect(fx.source).toBe('simulation');
  });

  it('USD는 1단위 고시라 그대로 사용된다', async () => {
    const fx = await getCustomsExchangeRate('USD');
    expect(fx.rate).toBeCloseTo(1385.5, 1);
  });

  it('JPY 1,000,000엔 인보이스 → 약 940만원 (9.4억이 아님)', async () => {
    const dv = await calcDutiableValue(1_000_000, 'JPY');
    expect(dv.totalKrw).toBe(9_402_000);
  });

  it('Edge Function이 보정한 JPY 1엔 기준 환율을 다시 100으로 나누지 않는다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        currency: 'JPY',
        currencyName: '일본 엔(100)',
        rate: 9.5134,
        effectiveDate: '20260705',
        tradeType: 'import',
        source: 'api',
      },
      error: null,
    });
    const fx = await getCustomsExchangeRate('JPY', 'import');
    expect(fx.source).toBe('api');
    expect(fx.rate).toBeCloseTo(9.5134, 4);
  });

  it('수출과 지정 날짜를 Edge Function 요청 body에 전달한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        currency: 'USD',
        currencyName: '미국 달러',
        rate: 1372.1,
        effectiveDate: '20260712',
        tradeType: 'export',
        source: 'api',
      },
      error: null,
    });

    const fx = await getCustomsExchangeRate('USD', 'export', '20260712');

    expect(invokeMock).toHaveBeenCalledWith('customs-exchange-rate', {
      body: { currency: 'USD', tradeType: 'export', date: '20260712' },
    });
    expect(fx.tradeType).toBe('export');
    expect(fx.effectiveDate).toBe('20260712');
  });

  it('잘못된 Edge Function 응답은 경고 후 시뮬레이션으로 폴백한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        currency: 'USD',
        currencyName: '미국 달러',
        rate: 'invalid',
        effectiveDate: '20260712',
        tradeType: 'import',
      },
      error: null,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fx = await getCustomsExchangeRate('USD', 'import');

    expect(fx.source).toBe('simulation');
    expect(warn).toHaveBeenCalledWith(
      '관세환율 Edge Function 호출 실패, 시뮬레이션 폴백:',
      expect.any(Error)
    );
  });
});

// ===== 관세청 통계 Edge Function =====

describe('관세청 통계 Edge Function 응답 검증', () => {
  it('품목 요청에 HS Code를 전달하고 API 레코드를 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        source: 'api',
        action: 'item',
        records: [{
          period: '202601', hsCode: '8517621010',
          exportWeight: 10, exportAmount: 100,
          importWeight: 20, importAmount: 80, balance: 20,
        }],
        latestPeriod: '202601',
        recordCount: 1,
      },
      error: null,
    });
    const result = await getItemTradeStats('8517-621010', '202601', '202603');
    expect(invokeMock).toHaveBeenCalledWith('customs-trade-stats', {
      body: {
        action: 'item',
        startPeriod: '202601',
        endPeriod: '202603',
        hsCode: '8517621010',
      },
    });
    expect(result.records[0]).toMatchObject({ period: '202601', source: 'api' });
    expect(result.latestPeriod).toBe('202601');
  });

  it('API 실패 시 시뮬레이션을 만들지 않고 오류를 전달한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: false,
        source: 'api',
        action: 'item',
        records: [],
        latestPeriod: null,
        recordCount: 0,
        error: { code: 'CUSTOMS_API_ERROR', message: '실패' },
      },
      error: null,
    });
    await expect(getItemTradeStats('8517621010', '202601', '202603'))
      .rejects.toMatchObject({ code: 'CUSTOMS_API_ERROR' });
  });
});

// ===== 국세청 사업자번호 =====

describe('사업자등록번호 체크섬 (시뮬레이션 폴백)', () => {
  it('상태조회 정상 응답을 기존 BusinessStatus로 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        action: 'status',
        found: true,
        bizNo: '1248100998',
        data: {
          bizNo: '1248100998', valid: true, statusText: '계속사업자',
          statusCode: '01', taxType: '부가가치세 일반과세자', taxTypeCode: '01',
          closureDate: '', source: 'api',
        },
      },
      error: null,
    });

    const result = await verifyBusinessRegistration('124-81-00998');

    expect(invokeMock).toHaveBeenCalledWith('nts-business', {
      body: { action: 'status', bizNo: '1248100998' },
    });
    expect(result).toMatchObject({ valid: true, statusText: '계속사업자', source: 'api' });
  });

  it('진위확인 정상 응답과 상태를 기존 BusinessValidity 형식으로 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        action: 'validate',
        found: true,
        bizNo: '1248100998',
        data: {
          bizNo: '1248100998', valid: true, message: '국세청 등록정보와 일치합니다.',
          status: { valid: true, statusText: '계속사업자', statusCode: '01', taxType: '일반과세자', taxTypeCode: '01', closureDate: '' },
          source: 'api',
        },
      },
      error: null,
    });

    const result = await validateBusinessRegistration('1248100998', '19690113', '대표자');

    expect(invokeMock).toHaveBeenCalledWith('nts-business', {
      body: { action: 'validate', bizNo: '1248100998', startDate: '19690113', representativeName: '대표자' },
    });
    expect(result.source).toBe('api');
    expect(result.status).toMatchObject({ valid: true, source: 'api' });
  });

  it('진위확인 found:false는 오류 폴백이 아닌 안전한 불일치 결과다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, action: 'validate', found: false, bizNo: '1248100998', data: null },
      error: null,
    });
    const result = await validateBusinessRegistration('1248100998', '19690113', '대표자');
    expect(result).toMatchObject({ valid: false, source: 'api' });
  });

  it('삼성전자 124-81-00998은 유효', async () => {
    const r = await verifyBusinessRegistration('124-81-00998');
    expect(r.valid).toBe(true);
    expect(r.source).toBe('simulation');
  });

  it('체크섬 불일치 번호는 무효', async () => {
    const r = await verifyBusinessRegistration('1234567890');
    expect(r.valid).toBe(false);
  });

  it('10자리 미만은 형식 오류 메시지', async () => {
    const r = await verifyBusinessRegistration('12345');
    expect(r.valid).toBe(false);
    expect(r.statusText).toContain('10자리');
  });
});

// ===== UNI-PASS =====

describe('UNI-PASS Edge Function 호출·응답 검증', () => {
  it('관세율 응답을 기존 세율 목록으로 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        hsCode: '8517621010',
        rates: [
          { hsCode: '8517621010', typeCode: 'A', typeName: '기본세율', rate: 8, applyStart: '20260101', applyEnd: '20261231', source: 'api' },
          { hsCode: '8517621010', typeCode: 'C', typeName: 'WTO협정세율', rate: 13, applyStart: '20260101', applyEnd: '20261231', source: 'api' },
        ],
      },
      error: null,
    });
    const rates = await getTariffRates('8517621010');
    expect(invokeMock).toHaveBeenCalledWith('unipass-tariff-basic', { body: { hsCode: '8517621010' } });
    expect(rates).toHaveLength(2);
    expect(rates[0].source).toBe('api');
    expect(pickBasicRate(rates)?.rate).toBe(8);
  });

  it('관세율 success:false는 임의 기본세율 없이 오류를 전달한다', async () => {
    invokeMock.mockResolvedValue({ data: { success: false, error: '인증 실패' }, error: null });
    await expect(getTariffRates('8517621010')).rejects.toThrow('인증 실패');
  });

  it('요건승인 found:false는 null을 반환한다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, found: false, approvalNo: 'INVALID', imexTpcd: 'I', data: null },
      error: null,
    });
    await expect(getRequirementApproval('INVALID', 'I')).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('unipass-requirement-approval', {
      body: { approvalNo: 'INVALID', imexTpcd: 'I' },
    });
  });

  it('요건승인 API 오류는 가짜 승인 객체 없이 전달한다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: false, error: '요건승인 조회 실패' },
      error: null,
    });
    await expect(getRequirementApproval('AP-ERROR', 'I')).rejects.toThrow('요건승인 조회 실패');
  });

  it('요건승인 정상 응답을 기존 RequirementApproval로 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true, found: true, approvalNo: 'AP-1', imexTpcd: 'E',
        data: {
          approvalNo: 'AP-1', approvalCondition: '조건', issueDate: '20260101',
          formName: '승인서', relatedLaw: '대외무역법', validUntil: '20261231', source: 'api',
        },
      },
      error: null,
    });
    const result = await getRequirementApproval(' AP-1 ', 'E');
    expect(result).toMatchObject({ approvalNo: 'AP-1', formName: '승인서', source: 'api' });
  });

  it('화물통관 응답을 매핑하고 지정 연도를 전달한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true, found: true, blNo: 'BL123', blYear: '2026',
        data: { cargoNo: 'CARGO1', status: '통관완료', progressDetail: '반출', arrivalPort: '부산항', source: 'api' },
      },
      error: null,
    });
    const result = await getCargoProgress(' BL123 ', '2026');
    expect(invokeMock).toHaveBeenCalledWith('unipass-cargo-clearance', {
      body: { blNo: 'BL123', blYear: '2026' },
    });
    expect(result).toMatchObject({ cargoNo: 'CARGO1', source: 'api' });
  });

  it('화물통관 found:false는 가짜 항만 없이 빈 상태로 표시한다', async () => {
    invokeMock.mockResolvedValue({
      data: { success: true, found: false, blNo: 'BL-NONE', data: null },
      error: null,
    });
    const result = await lookupImportCargo('BL-NONE');
    expect(result).toMatchObject({
      lookupStatus: 'empty',
      cargoNo: '',
      arrivalPort: '',
    });
    expect(result.source).toBeUndefined();
    expect(result.timeline.every((step) => !step.completed && !step.current)).toBe(true);
  });

  it('화물통관 API 오류는 임의 진행상태 없이 전달한다', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('cargo network') });
    await expect(lookupImportCargo('BL-ERROR')).rejects.toThrow('cargo network');
  });

  it('수출이행 found:false와 호출 오류는 null을 반환한다', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: true, found: false, declarationNo: '123456', data: null },
      error: null,
    }).mockResolvedValueOnce({ data: null, error: new Error('network') });
    await expect(getExportFulfillment('123-456')).resolves.toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(getExportFulfillment('123-456')).resolves.toBeNull();
    expect(invokeMock).toHaveBeenCalledWith('unipass-export-fulfillment', {
      body: { declarationNo: '123456' },
    });
    expect(warn).toHaveBeenCalled();
  });

  it('수출이행 정상 응답을 기존 ExportFulfillment로 매핑한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true, found: true, declarationNo: '123456',
        data: { declarationNo: '123456', shipmentCompleted: true, acceptDate: '20260101', loadDeadline: '20260201', source: 'api' },
      },
      error: null,
    });
    const result = await getExportFulfillment('123-456');
    expect(result).toEqual({
      declarationNo: '123456', shipmentCompleted: true, acceptDate: '20260101', loadDeadline: '20260201', source: 'api',
    });
  });

  it('pickBasicRate: 기본세율(A) 우선, 빈 배열은 null', () => {
    const rates: TariffRate[] = [
      { hsCode: '', typeCode: 'C', typeName: 'WTO', rate: 13, applyStart: '', applyEnd: '', source: 'simulation' },
      { hsCode: '', typeCode: 'A', typeName: '기본', rate: 8, applyStart: '', applyEnd: '', source: 'simulation' },
    ];
    expect(pickBasicRate(rates)?.typeCode).toBe('A');
    expect(pickBasicRate([])).toBeNull();
  });

  it('estimateDuty: 실제 API 기본세율로 과세가격 × 세율을 계산한다', async () => {
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        rates: [
          { hsCode: '8517621010', typeCode: 'A', typeName: '기본', rate: 8, applyStart: '20260101', applyEnd: '20261231', source: 'api' },
        ],
      },
      error: null,
    });
    const duty = await estimateDuty('8517621010', 10_000_000);
    expect(duty).not.toBeNull();
    expect(duty!.estimatedDutyKrw).toBe(800_000);
    expect(duty!.source).toBe('api');
  });
});

// ===== 법제처 =====

describe('법제처 법령 서비스', () => {
  it('Edge Function 호출 실패 시 시뮬레이션 검색 결과 반환', async () => {
    const results = await searchLaw('관세법');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].lawName).toContain('관세법');
    expect(results[0].source).toBe('simulation');
  });

  it('검증 이슈 → 근거 법령 매핑', () => {
    expect(getRelatedLawForIssue('dutiable-value-info')?.article).toBe('제30조');
    expect(getRelatedLawForIssue('co-required')?.lawName).toBe('대외무역법');
    expect(getRelatedLawForIssue('없는-이슈')).toBeNull();
  });
});
