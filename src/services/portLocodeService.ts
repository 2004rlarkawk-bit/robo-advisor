/**
 * UN/LOCODE 항구 사전 서비스
 *
 * UNECE UN/LOCODE(공개 데이터) 중 항구 기능(Function 1 = seaport)이 있는
 * 17,516개 지점을 변환한 `public/data/unlocodePorts.json`을 런타임에 fetch 해서
 *  - 입력한 항구명이 실제로 존재하는 항구인지 확인하고
 *  - 오타면 유사한 항구를 제안하고("Busn" → Busan, KRPUS)
 *  - 항구 → 국가(ISO 2자리)를 전 세계 범위로 추정한다 (R5 동일국가 검사에 사용).
 *
 * 로딩 방식은 hsDataService(관세청 HS 사전)와 같다: 정적 자산 1회 fetch 후 캐시,
 * 실패(테스트 환경 등) 시 빈 배열 → 호출 측은 기존 정규식 폴백을 그대로 쓴다.
 *
 * JSON 레코드 형식(배열, 용량 최소화): [locode, name]
 *   locode 앞 2자리 = 국가 코드, 뒤 3자리 = 지점 코드. 예) ["KRPUS", "Busan"]
 */

export interface PortEntry {
  /** UN/LOCODE 5자리. 예) KRPUS */
  locode: string;
  /** ISO 3166-1 alpha-2 국가 코드. 예) KR */
  country: string;
  /** 영문 지명(발음 구별 부호 제거). 예) Busan */
  name: string;
  /** 비교용 키 — 소문자·영숫자만. 예) busan */
  key: string;
}

export type PortResolutionStatus =
  /** 사전에서 정확히 찾음 */
  | 'exact'
  /** 정확히는 없지만 비슷한 항구가 있음(오타 의심) */
  | 'fuzzy'
  /** 사전에 없고 비슷한 것도 없음 */
  | 'unknown'
  /** 사전을 아직 못 불러옴(오프라인·테스트) — 판정 보류 */
  | 'unavailable';

export interface PortResolution {
  status: PortResolutionStatus;
  input: string;
  /** exact/fuzzy 일 때 가장 유력한 항구 */
  match?: PortEntry;
  /** fuzzy/unknown 일 때 제안 목록(최대 3개). exact 이면 같은 이름의 다른 나라 항구. */
  suggestions: PortEntry[];
  /** 입력에서 읽어낸 국가 힌트("OSAKA, JAPAN" → JP) */
  countryHint?: string;
}

type RawRow = [string, string];

let cache: PortEntry[] | null = null;
let loadPromise: Promise<PortEntry[]> | null = null;

function dataUrl(): string {
  const base =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) || '/';
  return `${base}data/unlocodePorts.json`;
}

/** 비교용 키 — 소문자, 영숫자만 남긴다. "Ho Chi Minh City" → "hochiminhcity" */
export function portKey(value: string): string {
  // NFKD 분해 후 결합 부호(U+0300–U+036F)를 지워 "Málaga" → "malaga"
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** 항구 사전 로드(1회 fetch 후 캐시). 실패 시 빈 배열. */
export async function loadPortData(): Promise<PortEntry[]> {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      if (typeof fetch !== 'function') return [];
      const res = await fetch(dataUrl());
      if (!res.ok) throw new Error(`UN/LOCODE 데이터 로드 실패 (${res.status})`);
      const raw = (await res.json()) as RawRow[];
      cache = raw.map(([locode, name]) => ({
        locode,
        country: locode.slice(0, 2),
        name,
        key: portKey(name),
      }));
      return cache;
    } catch (err) {
      console.warn('UN/LOCODE 항구 사전 로드 실패, 정규식 폴백 사용:', err);
      cache = [];
      return cache;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

/** 이미 로드된 사전(동기). 아직이면 null — 검증 룰처럼 동기 코드에서 쓴다. */
export function getLoadedPortData(): PortEntry[] | null {
  return cache && cache.length ? cache : null;
}

/** 테스트용: 사전을 직접 주입하거나 비운다. */
export function __setPortDataForTests(rows: RawRow[] | null): void {
  cache = rows
    ? rows.map(([locode, name]) => ({ locode, country: locode.slice(0, 2), name, key: portKey(name) }))
    : null;
}

// ── 한글·관용 표기 별칭 ─────────────────────────────────────────
// 사전은 영문뿐이라 한글 항구명·앱 내부 표기("Pyeongtaek-Dangjin Port")를 영문 사전 키로 잇는다.
const PORT_ALIASES: Record<string, string> = {
  // 국내
  부산: 'busan', 부산항: 'busan', 부산신항: 'busan', 부산북항: 'busan', pusan: 'busan',
  인천: 'incheon', 인천항: 'incheon', inchon: 'incheon',
  광양: 'gwangyang', 광양항: 'gwangyang', kwangyang: 'gwangyang',
  울산: 'ulsan', 울산항: 'ulsan',
  평택: 'pyeongtaek', 평택항: 'pyeongtaek', 평택당진: 'pyeongtaek', 평택당진항: 'pyeongtaek',
  pyeongtaekdangjin: 'pyeongtaek', pyongtaek: 'pyeongtaek', 당진: 'pyeongtaek',
  군산: 'gunsan', 군산항: 'gunsan', kunsan: 'gunsan',
  목포: 'mokpo', 목포항: 'mokpo', 포항: 'pohang', 포항항: 'pohang', 마산: 'masan', 마산항: 'masan',
  여수: 'yeosu', 여수항: 'yeosu', 대산: 'daesan', 대산항: 'daesan', 동해: 'donghae', 동해항: 'donghae',
  // 일본
  오사카: 'osaka', 오사카항: 'osaka', 도쿄: 'tokyo', 도쿄항: 'tokyo', 동경: 'tokyo',
  고베: 'kobe', 고베항: 'kobe', 요코하마: 'yokohama', 요코하마항: 'yokohama',
  나고야: 'nagoya', 나고야항: 'nagoya', 하카타: 'hakata', 후쿠오카: 'hakata', 모지: 'moji', 시미즈: 'shimizu',
  // 중국·대만·홍콩
  상하이: 'shanghai', 상해: 'shanghai', 상하이항: 'shanghai', 닝보: 'ningbo', 닝보항: 'ningbo',
  칭다오: 'qingdao', 청도: 'qingdao', 칭다오항: 'qingdao', 선전: 'shenzhen', 심천: 'shenzhen', 선전항: 'shenzhen',
  톈진: 'tianjin', 천진: 'tianjin', 다롄: 'dalian', 대련: 'dalian', 샤먼: 'xiamen', 하문: 'xiamen',
  광저우: 'guangzhou', 옌타이: 'yantai', 웨이하이: 'weihai', 홍콩: 'hongkong', 홍콩항: 'hongkong',
  카오슝: 'kaohsiung', 가오슝: 'kaohsiung', 지룽: 'keelung', 기륭: 'keelung',
  // 동남아
  싱가포르: 'singapore', 싱가폴: 'singapore', 싱가포르항: 'singapore',
  호찌민: 'hochiminhcity', 호치민: 'hochiminhcity', 호찌민항: 'hochiminhcity', hochiminh: 'hochiminhcity',
  하이퐁: 'haiphong', 하이퐁항: 'haiphong', 다낭: 'danang',
  방콕: 'bangkok', 램차방: 'laemchabang', 렘차방: 'laemchabang',
  포트클랑: 'portklang', 클랑: 'portklang', 자카르타: 'jakarta', 탄중프리옥: 'tanjungpriok',
  마닐라: 'manila', 양곤: 'yangon',
  // 미주
  로스앤젤레스: 'losangeles', 로스엔젤레스: 'losangeles', 로스앤젤레스항: 'losangeles', la: 'losangeles',
  롱비치: 'longbeach', 롱비치항: 'longbeach', 뉴욕: 'newyork', 뉴욕항: 'newyork',
  newyorknewjersey: 'newyork', 뉴욕뉴저지: 'newyork', 뉴욕뉴저지항: 'newyork',
  시애틀: 'seattle', 오클랜드: 'oakland', 휴스턴: 'houston', 밴쿠버: 'vancouver', 산토스: 'santos',
  // 유럽·중동·오세아니아
  로테르담: 'rotterdam', 로테르담항: 'rotterdam', 함부르크: 'hamburg', 함부르크항: 'hamburg',
  앤트워프: 'antwerpen', 안트베르펜: 'antwerpen', antwerp: 'antwerpen',
  펠릭스토: 'felixstowe', 르아브르: 'lehavre', 제노바: 'genova', genoa: 'genova',
  바르셀로나: 'barcelona', 발렌시아: 'valencia', 피레우스: 'piraeus',
  두바이: 'dubai', 제벨알리: 'jebelali', 시드니: 'sydney', 멜버른: 'melbourne',
  뭄바이: 'mumbai', 첸나이: 'chennai', 콜롬보: 'colombo',
};

// ── 국가 힌트 ────────────────────────────────────────────────
// "OSAKA, JAPAN", "GWANGYANG, KOREA" 처럼 뒤에 붙는 국가명을 ISO 코드로.
const COUNTRY_HINTS: Array<[RegExp, string]> = [
  [/korea|한국|대한민국|republic of korea|south korea|\bkr\b/i, 'KR'],
  [/japan|일본|\bjp\b/i, 'JP'],
  [/china|중국|\bprc\b|\bcn\b/i, 'CN'],
  [/taiwan|대만|\btw\b/i, 'TW'],
  [/hong ?kong|홍콩|\bhk\b/i, 'HK'],
  [/united states|\bu\.?s\.?a\.?\b|america|미국|\bus\b/i, 'US'],
  [/vietnam|viet nam|베트남|\bvn\b/i, 'VN'],
  [/thailand|태국|\bth\b/i, 'TH'],
  [/singapore|싱가포르|\bsg\b/i, 'SG'],
  [/malaysia|말레이시아|\bmy\b/i, 'MY'],
  [/indonesia|인도네시아|\bid\b/i, 'ID'],
  [/philippines|필리핀|\bph\b/i, 'PH'],
  [/india|인도(?!네시아)|\bin\b/i, 'IN'],
  [/germany|독일|deutschland|\bde\b/i, 'DE'],
  [/netherlands|holland|네덜란드|\bnl\b/i, 'NL'],
  [/belgium|벨기에|\bbe\b/i, 'BE'],
  [/united kingdom|england|britain|영국|\bgb\b|\buk\b/i, 'GB'],
  [/france|프랑스|\bfr\b/i, 'FR'],
  [/italy|이탈리아|\bit\b/i, 'IT'],
  [/spain|스페인|\bes\b/i, 'ES'],
  [/greece|그리스|\bgr\b/i, 'GR'],
  [/united arab emirates|\buae\b|아랍에미리트|\bae\b/i, 'AE'],
  [/australia|호주|\bau\b/i, 'AU'],
  [/canada|캐나다|\bca\b/i, 'CA'],
  [/mexico|멕시코|\bmx\b/i, 'MX'],
  [/brazil|브라질|\bbr\b/i, 'BR'],
  [/russia|러시아|\bru\b/i, 'RU'],
  [/sri lanka|스리랑카|\blk\b/i, 'LK'],
];

function countryHintOf(text: string): string | undefined {
  for (const [pattern, code] of COUNTRY_HINTS) {
    if (pattern.test(text)) return code;
  }
  return undefined;
}

/**
 * 입력을 사전 키로 정리한다.
 * "Busan Port" → "busan", "GWANGYANG, KOREA" → "gwangyang" + KR, "부산항" → "busan"
 */
function parseInput(raw: string): { key: string; countryHint?: string; locode?: string; approximate: boolean } {
  const text = raw.normalize('NFKC').trim();
  // "Busan (부산항)" 같은 괄호 병기는 떼고 앞부분만 본다.
  const withoutParen = text.replace(/[(（][^)）]*[)）]/g, ' ').trim();
  const [firstSegment = '', ...rest] = withoutParen.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
  let head = firstSegment;
  let countryHint = countryHintOf(rest.join(' '));
  // 쉼표 없이 "Osaka Japan" 처럼 붙여 쓴 국가명도 떼어낸다(남는 이름이 있을 때만).
  if (!countryHint) {
    for (const [pattern, code] of COUNTRY_HINTS) {
      const stripped = head.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
      if (stripped !== head.trim() && stripped) { head = stripped; countryHint = code; break; }
    }
  }

  // "KRPUS" / "KR PUS" 처럼 LOCODE 를 직접 적은 경우
  const locodeMatch = head.toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{2})([A-Z2-9]{3})$/);
  const locode = locodeMatch ? locodeMatch[1] + locodeMatch[2] : undefined;

  let name = head
    .replace(/\b(sea ?port|port of|port|harbou?r|terminal|pt\.?)\b/gi, ' ')
    .replace(/(항만|항구|항|신항|북항)$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "Port Klang" 처럼 Port 가 이름 일부인 경우 위에서 지워지므로 별칭으로 복구한다.
  if (!name && /port/i.test(head)) name = head;

  const compact = name.toLowerCase().replace(/\s+/g, '');
  const key = portKey(name);
  let aliasKey = PORT_ALIASES[compact] ?? PORT_ALIASES[key];
  let approximate = false;
  // 한글 오타("부싼")는 별칭 표에서 한 글자 차이까지 찾아 준다 — 결과는 '오타 의심'으로 표시한다.
  if (!aliasKey && !key && /[가-힣]/.test(compact)) {
    const near = Object.keys(PORT_ALIASES).find((alias) => /[가-힣]/.test(alias) && editDistance(alias, compact, 1) <= 1);
    if (near) { aliasKey = PORT_ALIASES[near]; approximate = true; }
  }
  return { key: aliasKey ?? key, countryHint, locode, approximate };
}

/** Damerau–Levenshtein(인접 전치 포함) 편집 거리 — 짧은 지명 오타용. */
function editDistance(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const prev2: number[] = new Array(b.length + 1);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr: number[] = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j <= b.length; j += 1) prev2[j] = prev[j];
    const swap = prev; prev = curr; curr = swap;
  }
  return prev[b.length];
}

/** 이름 길이에 따른 허용 오타 수: 4자 이하 1, 8자 이하 2, 그 이상 3. */
function allowedEdits(key: string): number {
  if (key.length <= 4) return 1;
  if (key.length <= 8) return 2;
  return 3;
}

/**
 * 같은 이름이 여러 나라에 있으면(예: Victoria) 국가 힌트 → 주요 교역국 순으로 앞에 둔다.
 * 같은 나라 안에서는 정식 지명("Shanghai")을 부속 표기("Shanghai Pt")보다 앞에 둔다.
 */
const COUNTRY_PRIORITY = ['KR', 'JP', 'CN', 'US', 'VN', 'SG', 'TW', 'HK', 'TH', 'MY', 'ID', 'DE', 'NL', 'GB'];
/**
 * 같은 이름이 여러 곳에 있을 때 먼저 보여줄 주요 무역항(세계 컨테이너 물동량 상위 + 국내 무역항).
 * 예) "Rotterdam" 은 미국 뉴욕주에도 있지만 무역서류에서는 거의 항상 네덜란드 NLRTM 이다.
 */
const MAJOR_PORT_LOCODES = new Set([
  'KRPUS', 'KRINC', 'KRKAN', 'KRUSN', 'KRPTK', 'KRKUV', 'KRMOK', 'KRKPO', 'KRMAS', 'KRYOS', 'KRTSN',
  'JPTYO', 'JPYOK', 'JPOSA', 'JPUKB', 'JPNGO', 'JPHKT', 'JPMOJ', 'JPSMZ',
  'CNSGH', 'CNNBO', 'CNQIN', 'CNSNZ', 'CNTSN', 'CNDLC', 'CNXMN', 'CNCAN', 'CNYTN', 'CNWEH', 'HKHKG', 'TWKHH', 'TWKEL',
  'SGSIN', 'VNSGN', 'VNHPH', 'VNDAD', 'THBKK', 'THLCH', 'MYPKG', 'MYTPP', 'IDJKT', 'IDTPP', 'PHMNL',
  'USLAX', 'USLGB', 'USNYC', 'USSEA', 'USOAK', 'USHOU', 'USSAV', 'CAVAN', 'MXZLO', 'BRSSZ',
  'NLRTM', 'DEHAM', 'BEANR', 'GBFXT', 'FRLEH', 'ITGOA', 'ESBCN', 'ESVLC', 'GRPIR', 'ESALG',
  'AEDXB', 'AEJEA', 'SAJED', 'EGPSD', 'LKCMB', 'INNSA', 'INMAA', 'INMUN', 'AUSYD', 'AUMEL', 'ZADUR',
]);
function rankEntries(entries: PortEntry[], countryHint?: string): PortEntry[] {
  const score = (entry: PortEntry) => {
    if (countryHint && entry.country === countryHint) return -100;
    if (MAJOR_PORT_LOCODES.has(entry.locode)) return -50;
    const idx = COUNTRY_PRIORITY.indexOf(entry.country);
    return idx === -1 ? COUNTRY_PRIORITY.length : idx;
  };
  return [...entries].sort((a, b) => score(a) - score(b) || a.name.length - b.name.length || a.locode.localeCompare(b.locode));
}

/**
 * 항구명 → UN/LOCODE 판정.
 * 사전이 없으면 'unavailable'(판정 보류). 빈 입력도 'unavailable'.
 */
export function resolvePort(input: string, ports: PortEntry[] | null = getLoadedPortData()): PortResolution {
  const raw = (input || '').trim();
  if (!raw || !ports || !ports.length) return { status: 'unavailable', input: raw, suggestions: [] };

  const { key, countryHint, locode, approximate } = parseInput(raw);

  if (locode) {
    const byCode = ports.find((p) => p.locode === locode);
    if (byCode) return { status: 'exact', input: raw, match: byCode, suggestions: [], countryHint };
  }
  if (!key) return { status: 'unknown', input: raw, suggestions: [], countryHint };

  // 1) 정확 일치 (키 동일). 같은 이름이 여러 나라에 있으면 힌트/우선순위로 하나를 고른다.
  const exact = rankEntries(ports.filter((p) => p.key === key), countryHint);
  if (exact.length) {
    const inHint = countryHint ? exact.filter((p) => p.country === countryHint) : exact;
    const match = (inHint.length ? inHint : exact)[0];
    const others = exact.filter((p) => p.locode !== match.locode && p.country !== match.country).slice(0, 3);
    if (approximate) return { status: 'fuzzy', input: raw, match, suggestions: [match, ...others].slice(0, 3), countryHint };
    return { status: 'exact', input: raw, match, suggestions: others, countryHint };
  }

  // 2) 유사 일치 — 앞부분 일치(4자 이상) 또는 편집 거리 허용 범위.
  const limit = allowedEdits(key);
  const scored: Array<{ entry: PortEntry; distance: number }> = [];
  for (const entry of ports) {
    if (countryHint && entry.country !== countryHint) continue;
    // 앞부분 일치("Rotter" → Rotterdam)는 오타 1개와 같은 등급으로 두고, 동률은 주요 항구 우선순위로 가른다.
    // (접두를 더 우대하면 "Busn" 이 Busan 대신 Busnes 로 가는 식의 오판이 난다.)
    const prefixHit = key.length >= 4 && (entry.key.startsWith(key) || key.startsWith(entry.key) && entry.key.length >= 4);
    const distance = prefixHit ? 1 : editDistance(key, entry.key, limit);
    if (distance <= limit) scored.push({ entry, distance });
  }
  if (!scored.length) return { status: 'unknown', input: raw, suggestions: [], countryHint };

  scored.sort((a, b) => a.distance - b.distance);
  const bestDistance = scored[0].distance;
  const best = rankEntries(scored.filter((s) => s.distance === bestDistance).map((s) => s.entry), countryHint);
  const rest = scored.filter((s) => s.distance !== bestDistance).map((s) => s.entry);
  const suggestions = [...best, ...rest].filter((entry, index, arr) => arr.findIndex((e) => e.key === entry.key && e.country === entry.country) === index).slice(0, 3);
  return { status: 'fuzzy', input: raw, match: suggestions[0], suggestions, countryHint };
}

/** 정규식 폴백 — 사전을 못 불러왔을 때 주요 항구만이라도 국가를 맞춘다. */
function portCountryFallback(port: string): string | null {
  const p = port.toLowerCase();
  if (/korea|한국|대한민국|부산|busan|인천|incheon|광양|gwangyang|평택|pyeongtaek|울산|ulsan|군산|목포|\bkr\b|krpus|krinc/.test(p)) return 'KR';
  if (/japan|일본|osaka|오사카|tokyo|도쿄|kobe|고베|yokohama|요코하마|nagoya|\bjp\b/.test(p)) return 'JP';
  if (/china|중국|shanghai|상하이|qingdao|칭다오|ningbo|닝보|shenzhen|\bcn\b/.test(p)) return 'CN';
  if (/usa|america|미국|los angeles|long beach|new york|\bla\b|\bus\b/.test(p)) return 'US';
  if (/vietnam|베트남|haiphong|ho chi minh|\bvn\b/.test(p)) return 'VN';
  return null;
}

/**
 * 항구 → 국가 코드. 사전 정확 일치가 우선, 없으면 국가 힌트, 마지막으로 정규식.
 * 오타(fuzzy)는 국가를 단정하지 않는다 — R5 오탐 방지.
 */
export function portCountryCode(port: string | undefined): string | null {
  const text = (port || '').trim();
  if (!text) return null;
  const resolution = resolvePort(text);
  if (resolution.status === 'exact' && resolution.match) return resolution.match.country;
  if (resolution.countryHint) return resolution.countryHint;
  return portCountryFallback(text);
}

/** 서류 표기용 항구명. "Busan (KRPUS)" 처럼 코드까지 붙이면 실무에서 항구를 특정하기 쉽다. */
export function formatPortLabel(entry: PortEntry): string {
  return `${entry.name} (${entry.locode})`;
}
