const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_URL =
  "https://unipass.customs.go.kr:38010/ext/rest/expDclrNoPrExpFfmnBrkdQry/retrieveExpDclrNoPrExpFfmnBrkd";
const ITEM_TAG = "expDclrNoPrExpFfmnBrkdQryRsltVo";

interface XmlItem {
  [key: string]: string;
}

export interface ParsedExportFulfillment {
  declarationNo: string;
  shipmentCompleted: boolean;
  acceptDate: string;
  loadDeadline: string;
  source: "api";
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
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXmlText(match[1].trim()) : "";
}

function normalizeDeclarationNo(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function parseXmlItems(xml: string): XmlItem[] {
  const matches = xml.match(new RegExp(`<${ITEM_TAG}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${ITEM_TAG}>`, "gi")) ?? [];
  return matches.map((itemXml) => {
    const record: XmlItem = {};
    const innerXml = itemXml
      .replace(new RegExp(`^<${ITEM_TAG}(?:\\s[^>]*)?>`, "i"), "")
      .replace(new RegExp(`</${ITEM_TAG}>$`, "i"), "");
    for (const match of innerXml.matchAll(/<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      record[match[1]] = decodeXmlText(match[2].trim());
    }
    return record;
  });
}

/**
 * 정상 응답이면서 요청 신고번호와 일치하는 실제 이행 필드가 있을 때만 found 데이터로 인정한다.
 */
export function parseExportFulfillmentResult(
  xml: string,
  requestedDeclarationNo: string,
): ParsedExportFulfillment | null {
  if (!xml.trim() || !xml.includes("<")) {
    throw new Error("UNI-PASS XML 응답을 해석할 수 없습니다.");
  }

  const resultCode = extractTag(xml, "resultCode") || extractTag(xml, "resultCd");
  if (resultCode && resultCode !== "00") {
    throw new Error("UNI-PASS가 오류 응답을 반환했습니다.");
  }

  const totalCountText = extractTag(xml, "tCnt");
  if (totalCountText) {
    const totalCount = Number(totalCountText);
    if (!Number.isFinite(totalCount) || totalCount < 0) {
      throw new Error("UNI-PASS 응답 건수가 올바르지 않습니다.");
    }
    if (totalCount === 0) return null;
  }

  const requested = normalizeDeclarationNo(requestedDeclarationNo);
  const hit = parseXmlItems(xml).find(
    (item) => normalizeDeclarationNo(item.expDclrNo ?? "") === requested,
  );
  if (!hit) {
    const notice = extractTag(xml, "ntceInfo");
    if (notice && !totalCountText) throw new Error("UNI-PASS가 조회 오류를 반환했습니다.");
    return null;
  }

  const shipmentFlag = (hit.shpmCmplYn ?? "").trim().toUpperCase();
  const acceptDate = (hit.acptDt ?? "").trim();
  const loadDeadline = (hit.loadDtyTmlm ?? "").trim();
  if (!["Y", "N"].includes(shipmentFlag) && !acceptDate && !loadDeadline) return null;

  return {
    declarationNo: normalizeDeclarationNo(hit.expDclrNo),
    shipmentCompleted: shipmentFlag === "Y",
    acceptDate,
    loadDeadline,
    source: "api",
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });
    if (req.method !== "POST") {
      return jsonResponse({ success: false, error: "POST 요청만 허용합니다." }, 405);
    }

    try {
      const apiKey = Deno.env.get("UNIPASS_EXPORT_FULFILLMENT_KEY");
      if (!apiKey) throw new Error("UNI-PASS 수출이행 API Secret이 설정되지 않았습니다.");

      const body = await req.json().catch(() => ({}));
      const declarationNo = typeof body.declarationNo === "string"
        ? normalizeDeclarationNo(body.declarationNo)
        : "";
      if (!declarationNo) {
        return jsonResponse({ success: false, error: "수출신고번호를 입력해야 합니다." }, 400);
      }

      const url = new URL(API_URL);
      url.searchParams.set("crkyCn", apiKey);
      url.searchParams.set("expDclrNo", declarationNo);
      const apiResponse = await fetch(url.toString());
      const responseText = await apiResponse.text();
      if (!apiResponse.ok) {
        throw new Error(`UNI-PASS 수출이행 API 요청에 실패했습니다(${apiResponse.status}).`);
      }

      const result = parseExportFulfillmentResult(responseText, declarationNo);
      return jsonResponse({
        success: true,
        found: result !== null,
        declarationNo,
        data: result,
      });
    } catch (error) {
      console.error("[unipass-export-fulfillment]", error instanceof Error ? error.message : "unknown");
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "수출이행내역 조회 중 오류가 발생했습니다.",
      }, 500);
    }
  },
};
