// 울산항만공사(UPA) 공공데이터 — 울산항 선박 입출항 정보 프록시.
//
// [팀원 설정 가이드]
// 1) 공공데이터포털(data.go.kr)에서 "울산항만공사" 검색 → 선박 입출항/고지정보(UPA-NET) OpenAPI 활용신청
// 2) 발급받은 일반 인증키(Decoding)를 Supabase Secrets에 등록:
//      supabase secrets set UPA_SERVICE_KEY="발급키"
// 3) 활용신청 상세페이지의 "요청주소(End Point)"를 그대로 등록:
//      supabase secrets set UPA_API_ENDPOINT="https://apis.data.go.kr/....../getXXXX"
// 4) supabase functions deploy upa-port-schedule
//
// 응답 스키마가 데이터셋마다 조금씩 달라서(선박명 태그명 등),
// 이 함수는 item 목록을 관대한 방식(JSON→XML 순서)으로 파싱해 원본 그대로 돌려주고
// 필드 매핑은 프론트(upaPortService)가 후보 키 목록으로 처리한다.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface XmlItem {
  [key: string]: string;
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
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

function parseXmlItems(xml: string): XmlItem[] {
  const resultCode = extractTag(xml, "resultCode");
  const resultMessage = extractTag(xml, "resultMsg");
  if (resultCode && resultCode !== "00") {
    throw new Error(
      `공공데이터 GW 오류(resultCode ${resultCode}): ${
        resultMessage || "서비스 키 또는 요청값을 확인하세요."
      }`,
    );
  }

  const itemMatches =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];

  return itemMatches.map((itemXml) => {
    const record: XmlItem = {};
    const fieldMatches =
      itemXml.match(/<([A-Za-z0-9_]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g) ?? [];
    for (const field of fieldMatches) {
      const m = field.match(/<([A-Za-z0-9_]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/);
      if (m) record[m[1]] = decodeXmlText(m[2].trim());
    }
    return record;
  });
}

// deno-lint-ignore no-explicit-any
function extractJsonItems(data: any): XmlItem[] | null {
  const candidates = [
    data?.response?.body?.items?.item,
    data?.response?.body?.items,
    data?.body?.items?.item,
    data?.items?.item,
    data?.items,
    data?.data,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as XmlItem[];
    if (c && typeof c === "object" && !Array.isArray(c)) return [c as XmlItem];
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceKey = Deno.env.get("UPA_SERVICE_KEY");
    const endpoint = Deno.env.get("UPA_API_ENDPOINT");

    if (!serviceKey || !endpoint) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "UPA_SERVICE_KEY 또는 UPA_API_ENDPOINT 미설정 — 함수 상단 설정 가이드를 참고하세요.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let numOfRows = 10;
    try {
      const body = await req.json();
      if (Number.isFinite(Number(body?.numOfRows))) {
        numOfRows = Math.min(50, Math.max(1, Number(body.numOfRows)));
      }
    } catch {
      // body 없이 호출 가능
    }

    const url =
      `${endpoint}?serviceKey=${encodeURIComponent(serviceKey)}` +
      `&numOfRows=${numOfRows}&pageNo=1&type=json&_type=json`;

    const upstream = await fetch(url);
    const text = await upstream.text();
    if (!upstream.ok) {
      throw new Error(`UPA API HTTP ${upstream.status}`);
    }

    let items: XmlItem[] | null = null;
    try {
      items = extractJsonItems(JSON.parse(text));
    } catch {
      items = null;
    }
    if (!items) items = parseXmlItems(text);

    return new Response(
      JSON.stringify({ success: true, items, source: "api" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "UPA API 호출 실패",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
