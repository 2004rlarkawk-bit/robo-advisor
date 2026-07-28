import { afterEach, describe, expect, it, vi } from "vitest";
import { createCustomsTradeStatsHandler } from "./index";
import {
  CustomsXmlError,
  getLatestPeriod,
  parseCustomsTradeStatsXml,
} from "./parser";

const header = "<header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header>";
const item = (body: string) => `<item>${body}</item>`;
const xml = (items = "") => `<response>${header}<body><items>${items}</items></body></response>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("customs-trade-stats XML parser", () => {
  it("parses and sorts total records and calculates the real latest period", () => {
    const records = parseCustomsTradeStatsXml("total", xml(
      item("<year>2026.06</year><expCnt>2</expCnt><expDlr>200</expDlr><impCnt>3</impCnt><impDlr>150</impDlr><balPayments>50</balPayments>") +
      item("<year>2026.01</year><expCnt>1</expCnt><expDlr>100</expDlr><impCnt>2</impCnt><impDlr>80</impDlr><balPayments>20</balPayments>"),
    ));
    expect(records.map((record) => record.period)).toEqual(["202601", "202606"]);
    expect(records[1]).toMatchObject({ exportAmount: 200, importAmount: 150 });
    expect(getLatestPeriod(records)).toBe("202606");
  });

  it("parses country records with numeric fields", () => {
    const records = parseCustomsTradeStatsXml("country", xml(
      item("<year>2026.02</year><statCd>US</statCd><statCdCntnKor1>미국</statCdCntnKor1><expCnt>4</expCnt><expDlr>1,200</expDlr><impCnt>3</impCnt><impDlr>900</impDlr><balPayments>300</balPayments>"),
    ));
    expect(records[0]).toMatchObject({
      period: "202602",
      countryCode: "US",
      countryName: "미국",
      exportAmount: 1200,
    });
  });

  it("parses and aggregates item records by period", () => {
    const records = parseCustomsTradeStatsXml("item", xml(
      item("<year>2026.01</year><hsCd>8517621010</hsCd><expWgt>10</expWgt><expDlr>100</expDlr><impWgt>20</impWgt><impDlr>80</impDlr><balPayments>20</balPayments>") +
      item("<year>2026.01</year><hsCd>8517621010</hsCd><expWgt>5</expWgt><expDlr>50</expDlr><impWgt>4</impWgt><impDlr>10</impDlr><balPayments>40</balPayments>"),
    ), "8517621010");
    expect(records).toEqual([{
      period: "202601",
      hsCode: "8517621010",
      exportWeight: 15,
      exportAmount: 150,
      importWeight: 24,
      importAmount: 90,
      balance: 60,
    }]);
  });

  it("returns an empty array for a successful response with no items", () => {
    expect(parseCustomsTradeStatsXml("item", xml(), "8517621010")).toEqual([]);
    expect(getLatestPeriod([])).toBeNull();
  });

  it("distinguishes a customs response error from malformed XML", () => {
    expect(() => parseCustomsTradeStatsXml(
      "total",
      "<response><resultCode>99</resultCode><resultMsg>ERROR</resultMsg></response>",
    )).toThrowError(expect.objectContaining({ code: "CUSTOMS_API_ERROR" }));

    expect(() => parseCustomsTradeStatsXml("total", "not xml"))
      .toThrowError(expect.objectContaining({ code: "CUSTOMS_XML_PARSE_ERROR" }));
    expect(CustomsXmlError).toBeDefined();
  });
});

describe("customs-trade-stats handler", () => {
  const request = (body: unknown) => new Request("http://localhost/functions/v1/customs-trade-stats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  it("uses Itemtrade, forwards the exact HS code, and returns the common contract", async () => {
    let calledUrl = "";
    const handler = createCustomsTradeStatsHandler({
      getSecret: () => "server-secret",
      fetcher: vi.fn(async (input: string | URL | Request) => {
        calledUrl = String(input);
        return new Response(xml(item(
          "<year>2026.06</year><hsCd>8517621010</hsCd><expWgt>10</expWgt><expDlr>100</expDlr><impWgt>20</impWgt><impDlr>80</impDlr><balPayments>20</balPayments>",
        )));
      }) as typeof fetch,
    });

    const response = await handler(request({
      action: "item",
      startPeriod: "202601",
      endPeriod: "202606",
      hsCode: "8517621010",
    }));
    const body = await response.json();
    const url = new URL(calledUrl);

    expect(url.pathname).toBe("/1220000/Itemtrade/getItemtradeList");
    expect(url.searchParams.get("hsSgn")).toBe("8517621010");
    expect(body).toMatchObject({
      success: true,
      source: "api",
      action: "item",
      latestPeriod: "202606",
      recordCount: 1,
    });
  });

  it("returns a distinct successful empty response", async () => {
    const handler = createCustomsTradeStatsHandler({
      getSecret: () => "server-secret",
      fetcher: vi.fn(async () => new Response(xml())) as typeof fetch,
    });
    const response = await handler(request({
      action: "total",
      startPeriod: "202601",
      endPeriod: "202606",
    }));
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      records: [],
      latestPeriod: null,
      recordCount: 0,
      message: "조회된 데이터가 없습니다.",
    });
  });

  it("returns sanitized errors for HTTP failure and missing Secret", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const httpHandler = createCustomsTradeStatsHandler({
      getSecret: () => "do-not-expose-this-secret",
      fetcher: vi.fn(async () => new Response("upstream failure", { status: 503 })) as typeof fetch,
    });
    const missingSecretHandler = createCustomsTradeStatsHandler({
      getSecret: () => undefined,
      fetcher: vi.fn() as typeof fetch,
    });
    const body = {
      action: "country",
      startPeriod: "202601",
      endPeriod: "202606",
    };

    const httpResponse = await httpHandler(request(body));
    const httpText = await httpResponse.text();
    expect(httpResponse.status).toBe(502);
    expect(httpText).toContain("CUSTOMS_HTTP_ERROR");
    expect(httpText).not.toContain("do-not-expose-this-secret");

    const configResponse = await missingSecretHandler(request(body));
    expect(configResponse.status).toBe(500);
    await expect(configResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "CONFIGURATION_ERROR" },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("do-not-expose-this-secret");
  });

  it("distinguishes upstream API errors from XML parse errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const customsErrorHandler = createCustomsTradeStatsHandler({
      getSecret: () => "server-secret",
      fetcher: vi.fn(async () => new Response(
        "<response><resultCode>99</resultCode><resultMsg>invalid</resultMsg></response>",
      )) as typeof fetch,
    });
    const malformedHandler = createCustomsTradeStatsHandler({
      getSecret: () => "server-secret",
      fetcher: vi.fn(async () => new Response("not xml")) as typeof fetch,
    });
    const body = { action: "total", startPeriod: "202601", endPeriod: "202606" };

    await expect((await customsErrorHandler(request(body))).json()).resolves.toMatchObject({
      success: false,
      error: { code: "CUSTOMS_API_ERROR" },
    });
    await expect((await malformedHandler(request(body))).json()).resolves.toMatchObject({
      success: false,
      error: { code: "CUSTOMS_XML_PARSE_ERROR" },
    });
    expect(log).toHaveBeenCalled();
  });
});
