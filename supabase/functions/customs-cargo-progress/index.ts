const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_URL =
  "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";

interface CargoProgressRequest {
  blNo?: string;
}

interface XmlRecord {
  [key: string]: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function extractTag(xml: string, tagName: string): string {
  const pattern = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  );
  const match = xml.match(pattern);
  return match ? decodeXmlText(match[1].trim()) : "";
}

function parseXmlRecords(xml: string, tagName: string): XmlRecord[] {
  const pattern = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "gi",
  );
  const records: XmlRecord[] = [];

  for (const match of xml.matchAll(pattern)) {
    const record: XmlRecord = {};
    const innerXml = match[1];
    const childPattern =
      /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;

    for (const child of innerXml.matchAll(childPattern)) {
      record[child[1]] = decodeXmlText(child[2].trim());
    }

    records.push(record);
  }

  return records;
}

function normalizeBlNo(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, "")
    : "";
}

function getCandidateYears(): string[] {
  const year = new Date().getFullYear();
  return [year, year - 1, year - 2].map(String);
}

async function requestUnipass(apiKey: string, blNo: string): Promise<string> {
  const attempts: URL[] = [];

  if (/^[0-9A-Z]{15,20}$/i.test(blNo)) {
    const cargoUrl = new URL(BASE_URL);
    cargoUrl.searchParams.set("crkyCn", apiKey);
    cargoUrl.searchParams.set("cargMtNo", blNo);
    attempts.push(cargoUrl);
  }

  for (const year of getCandidateYears()) {
    const masterUrl = new URL(BASE_URL);
    masterUrl.searchParams.set("crkyCn", apiKey);
    masterUrl.searchParams.set("mblNo", blNo);
    masterUrl.searchParams.set("blYy", year);
    attempts.push(masterUrl);

    const houseUrl = new URL(BASE_URL);
    houseUrl.searchParams.set("crkyCn", apiKey);
    houseUrl.searchParams.set("hblNo", blNo);
    houseUrl.searchParams.set("blYy", year);
    attempts.push(houseUrl);
  }

  let lastText = "";

  for (const url of attempts) {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/xml" },
    });

    const text = await response.text();
    lastText = text;

    if (!response.ok) continue;

    const status = extractTag(text, "csclPrgsStts");
    const cargoNo = extractTag(text, "cargMtNo");
    const totalCount = extractTag(text, "tCnt");

    if (status || cargoNo || (totalCount && totalCount !== "0")) {
      return text;
    }
  }

  return lastText;
}

function buildResult(blNo: string, xml: string) {
  const statusText = extractTag(xml, "csclPrgsStts");
  const customsOffice =
    extractTag(xml, "cstm") ||
    extractTag(xml, "prcsDttmCstm") ||
    extractTag(xml, "shedNm");
  const currentStep =
    extractTag(xml, "prgsStCd") ||
    extractTag(xml, "csclPrgsStts");
  const lastProcessedAt =
    extractTag(xml, "prcsDttm") ||
    extractTag(xml, "rlbrDttm") ||
    extractTag(xml, "dclrDttm");

  const detailRecords = [
    ...parseXmlRecords(xml, "cargCsclPrgsInfoDtlQryVo"),
    ...parseXmlRecords(xml, "cargCsclPrgsInfoDtlVo"),
    ...parseXmlRecords(xml, "item"),
  ];

  const events = detailRecords.map((record) => ({
    step:
      record.cargTrcnRelaBsopTpcd ||
      record.prcsStts ||
      record.prgsStts ||
      record.csclPrgsStts ||
      "처리 단계",
    status:
      record.prcsStts ||
      record.csclPrgsStts ||
      record.prgsStts ||
      "처리",
    processedAt:
      record.prcsDttm ||
      record.rlbrDttm ||
      record.dclrDttm ||
      "",
    customsOffice:
      record.cstm ||
      record.prcsDttmCstm ||
      record.shedNm ||
      "",
    location:
      record.shedNm ||
      record.bdAreaNm ||
      "",
    details:
      record.prcsStts ||
      record.cargTrcnRelaBsopTpcd ||
      "",
  }));

  if (!statusText && events.length === 0) {
    return {
      blNo,
      status: "not_found",
      statusText: "조회된 통관 진행정보가 없습니다.",
      events: [],
      checkedAt: new Date().toISOString(),
      message: "B/L 번호 또는 신고 연도를 확인해 주세요.",
    };
  }

  return {
    blNo,
    status: "success",
    statusText: statusText || "통관 진행정보 조회 완료",
    customsOffice: customsOffice || undefined,
    lastProcessedAt: lastProcessedAt || undefined,
    currentStep: currentStep || statusText || undefined,
    events,
    checkedAt: new Date().toISOString(),
  };
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (req.method !== "POST") {
      return jsonResponse({ success: false, error: "POST 요청만 허용됩니다." }, 405);
    }

    try {
      const apiKey = Deno.env.get("UNIPASS_CARGO_CLEARANCE_KEY")?.trim();

      if (!apiKey) {
        throw new Error("UNIPASS_CARGO_CLEARANCE_KEY가 Supabase Secrets에 설정되지 않았습니다.");
      }

      const body = await req.json().catch(() => ({} as CargoProgressRequest));
      const blNo = normalizeBlNo(body.blNo);

      if (!blNo) {
        return jsonResponse({
          success: true,
          result: {
            blNo: "",
            status: "idle",
            statusText: "B/L 번호가 입력되지 않았습니다.",
            events: [],
            checkedAt: new Date().toISOString(),
            message: "B/L 번호를 입력한 뒤 조회해 주세요.",
          },
        });
      }

      const xml = await requestUnipass(apiKey, blNo);
      return jsonResponse({
        success: true,
        result: buildResult(blNo, xml),
      });
    } catch (error) {
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "통관 진행정보 조회 중 오류가 발생했습니다.",
      }, 500);
    }
  },
};
