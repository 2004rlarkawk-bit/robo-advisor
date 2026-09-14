import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ImportDocumentComparison from './ImportDocumentComparison';
const row = { field: '총중량', invoice: '1,250 kg', packingList: '1,250 kg', billOfLading: '1,280 kg', matches: false, detail: '30kg 차이' };
describe('ImportDocumentComparison', () => {
  it('does not claim a successful match or render an empty table when there are no results', () => {
    const html = renderToStaticMarkup(<ImportDocumentComparison rows={[]} />);
    expect(html).toContain('아직 서류 간 비교 결과가 없습니다');
    expect(html).not.toContain('form-message success');
    expect(html).not.toContain('<table');
  });
  it('shows source values and disagreement', () => {
    const html = renderToStaticMarkup(<ImportDocumentComparison rows={[row]} title="서류 간 정보 비교" />);
    expect(html).toContain('서류 간 정보 비교');
    expect(html).toContain('1,250 kg');
    expect(html).toContain('1,280 kg');
    expect(html).toContain('불일치');
    expect(html).not.toContain('form-message success');
  });
  it('limits its success claim to the actual compared rows', () => {
    const html = renderToStaticMarkup(<ImportDocumentComparison rows={[{ ...row, matches: true, billOfLading: '1,250 kg' }]} />);
    expect(html).toContain('비교된 1개 항목이 모두 일치합니다.');
  });
});
