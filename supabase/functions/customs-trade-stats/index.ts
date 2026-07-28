import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  CustomsXmlError,
  getLatestPeriod,
  parseCustomsTradeStatsXml,
  type CustomsTradeStatsAction,
} from "./parser.ts";

const BASE_URL = "https://apis.data.go.kr/1220000";
const ACTION_PATHS: Record<CustomsTradeStatsAction, string> = {
  total: "/Newtrade/getNewtradeList",
  country: "/nationtrade/getNationtradeList",
  item: "/Itemtrade/getItemtradeList",
};

interface HandlerDependencies {
  getSecret: (name: string) => string | undefined;
  fetcher: typeof fetch;
}

class RequestError extends Error {
  constructor(
    public readonly code:
      | "INVALID_REQUEST"
      | "CONFIGURATION_ERROR"
      | "CUSTOMS_HTTP_ERROR",
    public readonly status: number,
  ) {
    super(code);
    this.name = "RequestError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAction(value: unknown): CustomsTradeStatsAction | null {
  return value === "total" || value === "country" || value === "item"
    ? value
    : null;
}

function validPeriod(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) return false;
  const month = Number(value.slice(4, 6));
  return month >= 1 && month <= 12;
}

function monthIndex(period: string): number {
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(4, 6)) - 1;
}

function publicMessage(code: string): string {
  switch (code) {
    case "INVALID_REQUEST":
      return "요청 파라미터가 올바르지 않습니다.";
    case "CONFIGURATION_ERROR":
      return "통계 API 서버 설정을 확인할 수 없습니다.";
    case "CUSTOMS_XML_PARSE_ERROR":
      return "관세청 통계 응답을 처리하지 못했습니다.";
    default:
      return "관세청 통계 데이터를 불러오지 못했습니다.";
  }
}

function errorResponse(
  action: CustomsTradeStatsAction | "unknown",
  code: string,
  status: number,
): Response {
  return jsonResponse({
    success: false,
    source: "api",
    action,
    records: [],
    latestPeriod: null,
    recordCount: 0,
    error: {
      code,
      message: publicMessage(code),
    },
  }, status);
}

export function createCustomsTradeStatsHandler({
  getSecret,
  fetcher,
}: HandlerDependencies) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return errorResponse("unknown", "INVALID_REQUEST", 405);

    let action: CustomsTradeStatsAction | null = null;
    try {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new RequestError("INVALID_REQUEST", 400);
      }
      if (!isRecord(body)) throw new RequestError("INVALID_REQUEST", 400);

      action = parseAction(body.action);
      if (
        !action ||
        !validPeriod(body.startPeriod) ||
        !validPeriod(body.endPeriod) ||
        body.startPeriod > body.endPeriod ||
        monthIndex(body.endPeriod) - monthIndex(body.startPeriod) > 11
      ) {
        throw new RequestError("INVALID_REQUEST", 400);
      }

      const hsCode = typeof body.hsCode === "string"
        ? body.hsCode.replace(/[^0-9]/g, "")
        : "";
      if (action === "item" && !/^\d{6,10}$/.test(hsCode)) {
        throw new RequestError("INVALID_REQUEST", 400);
      }

      const apiKey = getSecret("DATA_GO_KR_CUSTOMS_KEY")?.trim();
      if (!apiKey) throw new RequestError("CONFIGURATION_ERROR", 500);

      const url = new URL(`${BASE_URL}${ACTION_PATHS[action]}`);
      url.searchParams.set("serviceKey", apiKey);
      url.searchParams.set("strtYymm", body.startPeriod);
      url.searchParams.set("endYymm", body.endPeriod);
      if (action === "item") url.searchParams.set("hsSgn", hsCode);

      let upstream: Response;
      try {
        upstream = await fetcher(url.toString(), {
          method: "GET",
          headers: { Accept: "application/xml" },
        });
      } catch {
        throw new RequestError("CUSTOMS_HTTP_ERROR", 502);
      }
      if (!upstream.ok) throw new RequestError("CUSTOMS_HTTP_ERROR", 502);

      const records = parseCustomsTradeStatsXml(
        action,
        await upstream.text(),
        hsCode,
      );
      const latestPeriod = getLatestPeriod(records);

      return jsonResponse({
        success: true,
        source: "api",
        action,
        records,
        latestPeriod,
        recordCount: records.length,
        ...(records.length === 0
          ? { message: "조회된 데이터가 없습니다." }
          : {}),
      });
    } catch (error) {
      const code = error instanceof RequestError || error instanceof CustomsXmlError
        ? error.code
        : "CUSTOMS_API_ERROR";
      const status = error instanceof RequestError
        ? error.status
        : 502;
      console.error(
        `[customs-trade-stats] action=${action ?? "unknown"} code=${code}`,
      );
      return errorResponse(action ?? "unknown", code, status);
    }
  };
}

export default {
  fetch: createCustomsTradeStatsHandler({
    getSecret: (name) => Deno.env.get(name),
    fetcher: fetch,
  }),
};
