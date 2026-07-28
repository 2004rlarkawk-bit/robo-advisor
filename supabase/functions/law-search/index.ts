const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LAW_SEARCH_URL =
  "https://www.law.go.kr/DRF/lawSearch.do";

interface LawSearchRequest {
  query?: string;
  limit?: number;
}

interface LawSearchResult {
  lawId: string;
  lawName: string;
  lawType: string;
  department: string;
  effectiveDate: string;
  detailUrl: string;
  source: "api";
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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function getFirstString(
  record: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = getString(record[key]);

    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeLimit(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 10;
  }

  return Math.min(
    Math.max(Math.floor(value), 1),
    100,
  );
}

function normalizeLawRows(
  value: unknown,
): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value)) {
    return [value];
  }

  return [];
}

function makeDetailUrl(
  detailPath: string,
  lawName: string,
): string {
  if (detailPath) {
    if (
      detailPath.startsWith("http://") ||
      detailPath.startsWith("https://")
    ) {
      return detailPath;
    }

    return `https://www.law.go.kr${
      detailPath.startsWith("/")
        ? detailPath
        : `/${detailPath}`
    }`;
  }

  return lawName
    ? `https://www.law.go.kr/법령/${
      encodeURIComponent(lawName)
    }`
    : "https://www.law.go.kr";
}

function parseLawSearchResponse(
  value: unknown,
): LawSearchResult[] {
  if (!isRecord(value)) {
    throw new Error(
      "법제처 응답이 객체 형식이 아닙니다.",
    );
  }

  /*
   * 인증 실패나 잘못된 요청도 HTTP 200으로
   * 반환될 수 있으므로 result 필드를 검사합니다.
   */
  const resultMessage = getString(value.result);
  const lawSearch = value.LawSearch;

  if (resultMessage && !isRecord(lawSearch)) {
    throw new Error(
      `법제처 API 안내: ${resultMessage}`,
    );
  }

  if (!isRecord(lawSearch)) {
    return [];
  }

  const rows = normalizeLawRows(
    lawSearch.law,
  );

  return rows.map((row) => {
    const lawId = getFirstString(row, [
      "법령ID",
      "lawId",
    ]);

    const lawName = getFirstString(row, [
      "법령명한글",
      "법령명",
      "lawName",
    ]);

    const lawType = getFirstString(row, [
      "법종구분명",
      "lawType",
    ]);

    const department = getFirstString(row, [
      "소관부처명",
      "department",
    ]);

    const effectiveDate = getFirstString(row, [
      "시행일자",
      "effectiveDate",
    ]);

    const detailPath = getFirstString(row, [
      "법령상세링크",
      "detailUrl",
    ]);

    return {
      lawId,
      lawName,
      lawType,
      department,
      effectiveDate,
      detailUrl: makeDetailUrl(
        detailPath,
        lawName,
      ),
      source: "api",
    };
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
      const lawOc = Deno.env.get(
        "LAW_GO_KR_OC",
      );

      if (!lawOc) {
        throw new Error(
          "LAW_GO_KR_OC가 Supabase Secrets에 설정되지 않았습니다.",
        );
      }

      let body: LawSearchRequest;

      try {
        body = await req.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            error:
              "요청 Body가 올바른 JSON 형식이 아닙니다.",
          },
          400,
        );
      }

      const query =
        typeof body.query === "string"
          ? body.query.trim().slice(0, 200)
          : "";

      const limit = normalizeLimit(body.limit);

      if (!query) {
        return jsonResponse(
          {
            success: false,
            error: "검색어를 입력해야 합니다.",
          },
          400,
        );
      }

      const url = new URL(LAW_SEARCH_URL);

      url.searchParams.set("OC", lawOc);
      url.searchParams.set("target", "law");
      url.searchParams.set("type", "JSON");
      url.searchParams.set(
        "display",
        String(limit),
      );
      url.searchParams.set("query", query);

      const apiResponse = await fetch(
        url.toString(),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const responseText =
        await apiResponse.text();

      if (!apiResponse.ok) {
        throw new Error(
          `법제처 법령검색 API 요청 실패(${apiResponse.status})`,
        );
      }

      let responseData: unknown;

      try {
        responseData = JSON.parse(responseText);
      } catch {
        throw new Error(
          "법제처 응답을 JSON으로 해석할 수 없습니다.",
        );
      }

      const laws =
        parseLawSearchResponse(responseData);

      return jsonResponse({
        success: true,
        query,
        count: laws.length,
        laws,
        source: "api",
      });
    } catch (error) {
      console.error(
        "[law-search]",
        error,
      );

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "법령 검색 중 오류가 발생했습니다.",
        },
        500,
      );
    }
  },
};