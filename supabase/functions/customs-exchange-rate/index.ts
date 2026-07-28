const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_URL =
  "https://apis.data.go.kr/1220000/retrieveTrifFxrtInfo/getRetrieveTrifFxrtInfo";

const HUNDRED_UNIT_CURRENCIES = new Set(["JPY", "IDR"]);

interface ExchangeRateRequest {
  currency?: string;
  tradeType?: "export" | "import";
  date?: string;
}

interface XmlItem {
  [key: string]: string;
}

/**
 * 한국 시간 기준 오늘 날짜를 yyyyMMdd 형식으로 반환
 */
function getKoreanTodayYmd(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());

  const year =
    parts.find((part) => part.type === "year")?.value ?? "";

  const month =
    parts.find((part) => part.type === "month")?.value ?? "";

  const day =
    parts.find((part) => part.type === "day")?.value ?? "";

  return `${year}${month}${day}`;
}

/**
 * yyyyMMdd 문자열을 Date 객체로 변환
 */
function ymdToDate(ymd: string): Date {
  const year = Number.parseInt(ymd.slice(0, 4), 10);
  const month = Number.parseInt(ymd.slice(4, 6), 10);
  const day = Number.parseInt(ymd.slice(6, 8), 10);

  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Date 객체를 yyyyMMdd 형식으로 변환
 */
function dateToYmd(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

/**
 * 입력 날짜가 속한 주의 일요일을 반환
 */
function getWeekStartYmd(ymd: string): string {
  const date = ymdToDate(ymd);

  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return dateToYmd(date);
}

/**
 * XML 특수문자 변환
 */
function decodeXmlText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

/**
 * XML에서 특정 태그의 첫 번째 값을 추출
 */
function extractTag(xml: string, tagName: string): string {
  const pattern = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  );

  const match = xml.match(pattern);

  return match
    ? decodeXmlText(match[1].trim())
    : "";
}

/**
 * 관세청 XML 응답에서 item 목록을 추출
 */
function parseXmlItems(xml: string): XmlItem[] {
  const resultCode = extractTag(xml, "resultCode");
  const resultMessage = extractTag(xml, "resultMsg");

  if (resultCode && resultCode !== "00") {
    throw new Error(
      `관세청 GW 오류(resultCode ${resultCode}): ${
        resultMessage || "서비스 키 또는 요청값을 확인하세요."
      }`,
    );
  }

  const itemMatches =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi,
    ) ?? [];

  return itemMatches.map((itemXml) => {
    const record: XmlItem = {};

    // 바깥쪽 item 태그 제거
    const innerXml = itemXml
      .replace(/^<item(?:\s[^>]*)?>/i, "")
      .replace(/<\/item>$/i, "");

    // item 내부 자식 태그 추출
    const childPattern =
      /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;

    for (const match of innerXml.matchAll(childPattern)) {
      const tagName = match[1];
      const value = decodeXmlText(match[2].trim());

      record[tagName] = value;
    }

    return record;
  });
}

/**
 * JPY, IDR처럼 100단위로 고시되는 통화의 나눗값 계산
 */
function currencyUnitDivisor(
  currency: string,
  currencyName: string,
): number {
  if (
    HUNDRED_UNIT_CURRENCIES.has(currency.toUpperCase())
  ) {
    return 100;
  }

  const match = currencyName.match(/\((\d+)\)/);

  if (!match) {
    return 1;
  }

  const divisor = Number.parseInt(match[1], 10);

  return Number.isFinite(divisor) && divisor > 0
    ? divisor
    : 1;
}

/**
 * JSON 응답 생성
 */
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
    // 브라우저 CORS 사전 요청
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
        "DATA_GO_KR_CUSTOMS_KEY",
      );

      if (!apiKey) {
        throw new Error(
          "DATA_GO_KR_CUSTOMS_KEY가 Supabase Secrets에 설정되지 않았습니다.",
        );
      }

      const body = await req.json().catch(
        () => ({} as ExchangeRateRequest),
      );

      const currency =
        typeof body.currency === "string" &&
          body.currency.trim()
          ? body.currency.trim().toUpperCase()
          : "USD";

      const tradeType: "export" | "import" =
        body.tradeType === "export"
          ? "export"
          : "import";

      const requestedDate =
        typeof body.date === "string" &&
          /^\d{8}$/.test(body.date)
          ? body.date
          : undefined;

      /*
       * 관세청 코드
       * 1: 수출환율
       * 2: 수입 과세환율
       */
      const weekFxrtTpcd =
        tradeType === "export" ? "1" : "2";

      const todayYmd = getKoreanTodayYmd();

      /*
       * 날짜를 직접 입력한 경우 해당 날짜만 조회
       * 날짜가 없으면 오늘과 해당 주 일요일을 차례로 조회
       */
      const attempts = requestedDate
        ? [requestedDate]
        : [
            ...new Set([
              todayYmd,
              getWeekStartYmd(todayYmd),
            ]),
          ];

      for (const attemptDate of attempts) {
        const url = new URL(BASE_URL);

        url.searchParams.set("serviceKey", apiKey);
        url.searchParams.set(
          "aplyBgnDt",
          attemptDate,
        );
        url.searchParams.set(
          "weekFxrtTpcd",
          weekFxrtTpcd,
        );

        console.log(
          `[customs-exchange-rate] 조회 날짜: ${attemptDate}, 통화: ${currency}`,
        );

        const apiResponse = await fetch(
          url.toString(),
        );

        const responseText =
          await apiResponse.text();

        if (!apiResponse.ok) {
          throw new Error(
            `관세환율 API 요청 실패(${apiResponse.status}): ${
              responseText.slice(0, 200)
            }`,
          );
        }

        const items =
          parseXmlItems(responseText);

        console.log(
          `[customs-exchange-rate] 파싱된 환율 개수: ${items.length}`,
        );

        console.log(
          "[customs-exchange-rate] 응답 예시:",
          items.slice(0, 2),
        );

        const hit = items.find((item) => {
          const itemCurrency =
            item.currSgn?.trim().toUpperCase();

          return itemCurrency === currency;
        });

        if (!hit) {
          continue;
        }

        const currencyName =
          hit.mtryUtNm?.trim() ||
          hit.currKorNm?.trim() ||
          currency;

        const rawRate = Number.parseFloat(
          hit.fxrt,
        );

        if (!Number.isFinite(rawRate)) {
          throw new Error(
            `${currency} 환율 값이 올바르지 않습니다: ${hit.fxrt}`,
          );
        }

        const divisor = currencyUnitDivisor(
          hit.currSgn,
          currencyName,
        );

        return jsonResponse({
          success: true,
          currency:
            hit.currSgn?.trim().toUpperCase() ||
            currency,
          currencyName,
          rate: rawRate / divisor,
          effectiveDate:
            hit.aplyBgnDt?.trim() ||
            attemptDate,
          tradeType,
          source: "api",
        });
      }

      throw new Error(
        `관세청 환율 정보에서 ${currency} 통화를 찾지 못했습니다.`,
      );
    } catch (error) {
      console.error(
        "[customs-exchange-rate]",
        error,
      );

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "관세환율 조회 중 알 수 없는 오류가 발생했습니다.",
        },
        500,
      );
    }
  },
};