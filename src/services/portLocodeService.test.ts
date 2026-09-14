import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  __setPortDataForTests,
  formatPortLabel,
  portCountryCode,
  resolvePort,
} from './portLocodeService';

beforeAll(() => {
  const raw = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/unlocodePorts.json'), 'utf8'));
  __setPortDataForTests(raw);
});
afterAll(() => __setPortDataForTests(null));

describe('resolvePort — 정확 일치', () => {
  it('영문 항구명을 UN/LOCODE로 찾는다', () => {
    const r = resolvePort('Busan');
    expect(r.status).toBe('exact');
    expect(r.match?.locode).toBe('KRPUS');
  });

  it('앱 내부 표기("Busan Port", "GWANGYANG, KOREA")도 찾는다', () => {
    expect(resolvePort('Busan Port').match?.locode).toBe('KRPUS');
    expect(resolvePort('GWANGYANG, KOREA').match?.locode).toBe('KRKAN');
    expect(resolvePort('Pyeongtaek-Dangjin Port').match?.locode).toBe('KRPTK');
    expect(resolvePort('New York-New Jersey Port').match?.locode).toBe('USNYC');
    expect(resolvePort('Ho Chi Minh Port').match?.locode).toBe('VNSGN');
  });

  it('한글 항구명은 별칭으로 찾는다', () => {
    expect(resolvePort('부산항').match?.locode).toBe('KRPUS');
    expect(resolvePort('오사카').match?.locode).toBe('JPOSA');
    expect(resolvePort('로테르담항').match?.locode).toBe('NLRTM');
  });

  it('LOCODE를 직접 적어도 된다', () => {
    expect(resolvePort('KRPUS').match?.name).toBe('Busan');
  });

  it('같은 이름이 여러 나라에 있으면 국가 힌트를 우선한다', () => {
    const r = resolvePort('Victoria, Canada');
    expect(r.status).toBe('exact');
    expect(r.match?.country).toBe('CA');
  });

  it('쉼표 없이 붙인 국가명도 읽는다', () => {
    const r = resolvePort('Osaka Japan');
    expect(r.status).toBe('exact');
    expect(r.match?.locode).toBe('JPOSA');
  });
});

describe('resolvePort — 오타 제안', () => {
  it('영문 오타에 비슷한 항구를 제안한다', () => {
    const r = resolvePort('Busn');
    expect(r.status).toBe('fuzzy');
    expect(r.suggestions.map((s) => s.locode)).toContain('KRPUS');
  });

  it('한글 오타도 제안한다', () => {
    const r = resolvePort('부싼');
    expect(r.status).toBe('fuzzy');
    expect(r.match?.locode).toBe('KRPUS');
  });

  it('전치 오타(Rotterdma)도 잡는다', () => {
    expect(resolvePort('Rotterdma').match?.locode).toBe('NLRTM');
  });

  it('전혀 다른 문자열은 unknown', () => {
    expect(resolvePort('xqzv123').status).toBe('unknown');
  });

  it('사전이 없으면 unavailable', () => {
    expect(resolvePort('Busan', null).status).toBe('unavailable');
    expect(resolvePort('', null).status).toBe('unavailable');
  });
});

describe('portCountryCode', () => {
  it('사전 기반으로 전 세계 항구의 국가를 맞춘다', () => {
    expect(portCountryCode('Rotterdam')).toBe('NL');
    expect(portCountryCode('Jebel Ali')).toBe('AE');
    expect(portCountryCode('Kaohsiung')).toBe('TW');
    expect(portCountryCode('울산항')).toBe('KR');
  });

  it('오타는 국가를 단정하지 않는다(힌트가 없으면 null)', () => {
    expect(portCountryCode('Busn')).toBeNull();
  });

  it('국가 힌트가 있으면 오타여도 힌트를 쓴다', () => {
    expect(portCountryCode('Busn, Korea')).toBe('KR');
  });
});

describe('formatPortLabel', () => {
  it('이름 + 코드', () => {
    expect(formatPortLabel({ locode: 'KRPUS', country: 'KR', name: 'Busan', key: 'busan' })).toBe('Busan (KRPUS)');
  });
});
