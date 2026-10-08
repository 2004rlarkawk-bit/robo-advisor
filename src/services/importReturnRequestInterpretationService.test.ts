import { describe, expect, it, vi } from 'vitest';
import type { ImportComparisonRow } from '../types/importTrade';
import { conservativelyInterpretImportReturnRequest, interpretImportReturnRequest, returnRequestComparisonCandidates } from './importReturnRequestInterpretationService';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const rows: ImportComparisonRow[] = [
  { field: '수량', invoice: '150개', packingList: '160개', billOfLading: '-', matches: false, detail: '' },
  { field: '총중량', invoice: '-', packingList: '100 kg', billOfLading: '100 kg', matches: true, detail: '' },
  { field: '총액', invoice: '1000', packingList: '1,000', billOfLading: '-', matches: true, detail: '' },
];

describe('수입 보완 요청의 대사값 연결', () => {
  it('누락 표시와 같은 값은 후보로 보내지 않는다', () => {
    expect(returnRequestComparisonCandidates(rows)).toEqual([{
      field: '수량', values: [{ source: 'C/I', value: '150개' }, { source: 'P/L', value: '160개' }],
    }]);
  });

  it('응답에 없는 필드·서류가 섞여도 저장 전에 걸러낸다', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, action: 'interpret-import-return-request', comparisonFields: ['수량', 'invented', '수량'], documentTypes: ['packing_list', 'other-file'] },
      error: null,
    } as never);
    expect(await interpretImportReturnRequest('수량 차이 확인', rows)).toEqual({
      comparisonFields: ['수량'], documentTypes: ['packing_list'],
    });
  });

  it('AI 기능이 아직 배포되지 않아도 문장과 실제 차이가 일치할 때만 연결한다', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { success: false, error: '지원하지 않는 action입니다.' }, error: null } as never);
    expect(await interpretImportReturnRequest('P/L 수량과 C/I 수량이 달라 수정본을 보내 주세요.', rows)).toEqual({
      comparisonFields: ['수량'], documentTypes: [],
    });
    expect(conservativelyInterpretImportReturnRequest('선박 일정만 알려 주세요.', rows)).toEqual({ comparisonFields: [], documentTypes: [] });
  });
});
