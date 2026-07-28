const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UNIPASS_CARGO_URL =
  "https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo";

interface CargoClearanceRequest {
  blNo?: string;
  blYear?: string;
}

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

function parseXmlItems(
  xml: string,
  itemTag: string,
): XmlItem[] {
  const notice = extractTag(xml, "ntceInfo");

  const itemPattern = new RegExp(
    `<${itemTag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${itemTag}>`,
    "gi",
  );

  const itemMatches = xml.match(itemPattern) ?? [];

  if (notice && itemMatches.length === 0) {
    throw new Error(`UNI-PASS 안내: ${notice}`);
  }

  return itemMatches.map((itemXml) => {
    const record: XmlItem = {};

    const innerXml = itemXml
      .replace(
        new RegExp(`^<${itemTag}(?:\\s[^>]*)?>`, "i"),
        "",
      )
      .replace(
        new RegExp(`</${itemTag}>$`, "i"),
        "",
      );

    const childPattern =
      /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;

    for (const match of innerXml.matchAll(childPattern)) {
      record[match[1]] = decodeXmlText(
        match[2].trim(),
      );
    }

    return record;
  });
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== "POST") {
      return jsonResponse(
        {
          success: false,
          error: "POST 요청만 허용됩니다.",
        },
        405,
      );
    }

    try {
      const apiKey = Deno.env.get(
        "UNIPASS_CARGO_CLEARANCE_KEY",
      );

      if (!apiKey) {
        throw new Error(
          "UNIPASS_CARGO_CLEARANCE_KEY가 Supabase Secrets에 설정되지 않았습니다.",
        );
      }

      const body = await req
        .json()
        .catch(() => ({} as CargoClearanceRequest));

      const blNo =
        typeof body.blNo === "string"
          ? body.blNo.trim()
          : "";

      const blYear =
        typeof body.blYear === "string" &&
          /^\d{4}$/.test(body.blYear)
          ? body.blYear
          : String(new Date().getFullYear());

      if (!blNo) {
        return jsonResponse(
          {
            success: false,
            error: "B/L 번호를 입력해야 합니다.",
          },
          400,
        );
      }

      const url = new URL(UNIPASS_CARGO_URL);

      url.searchParams.set("crkyCn", apiKey);
      url.searchParams.set("blYy", blYear);
      url.searchParams.set("hblNo", blNo);

      const apiResponse = await fetch(url.toString());
      const responseText = await apiResponse.text();

      if (!apiResponse.ok) {
        throw new Error(
          `UNI-PASS 화물통관 API 요청 실패(${apiResponse.status}): ${
            responseText.slice(0, 200)
          }`,
        );
      }

      const items = parseXmlItems(
        responseText,
        "cargCsclPrgsInfoQryVo",
      );

      const hit = items[0];

      if (!hit) {
        return jsonResponse({
          success: true,
          found: false,
          blNo,
          blYear,
          data: null,
        });
      }

      return jsonResponse({
        success: true,
        found: true,
        blNo,
        blYear,
        data: {
          cargoNo:
            hit.cargMtNo || blNo,
          status:
            hit.csclPrgsStts || "",
          progressDetail:
            hit.prgsStts || "",
          arrivalPort:
            hit.dsprNm || "",
          source: "api",
        },
      });
    } catch (error) {
      console.error(
        "[unipass-cargo-clearance]",
        error,
      );

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "화물통관 진행정보 조회 중 오류가 발생했습니다.",
        },
        500,
      );
    }
  },
};