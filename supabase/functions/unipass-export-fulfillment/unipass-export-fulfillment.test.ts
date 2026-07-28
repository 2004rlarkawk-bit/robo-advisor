import { describe, expect, it } from "vitest";
import { parseExportFulfillmentResult } from "./index";

const wrap = (body: string, count = "1") =>
  `<response><resultCode>00</resultCode><tCnt>${count}</tCnt>${body}</response>`;
const item = (body: string) =>
  `<expDclrNoPrExpFfmnBrkdQryRsltVo>${body}</expDclrNoPrExpFfmnBrkdQryRsltVo>`;

describe("parseExportFulfillmentResult", () => {
  it("0건 응답은 found가 아닌 null로 해석한다", () => {
    expect(parseExportFulfillmentResult(wrap("", "0"), "123456")).toBeNull();
  });

  it("응답 신고번호가 요청과 다르면 null로 해석한다", () => {
    const xml = wrap(item("<expDclrNo>999999</expDclrNo><shpmCmplYn>Y</shpmCmplYn>"));
    expect(parseExportFulfillmentResult(xml, "123456")).toBeNull();
  });

  it("신고번호만 있고 이행 핵심 필드가 없으면 null로 해석한다", () => {
    const xml = wrap(item("<expDclrNo>123-456</expDclrNo>"));
    expect(parseExportFulfillmentResult(xml, "123456")).toBeNull();
  });

  it("일치하는 신고번호와 핵심 필드는 실제 API 데이터로 정규화한다", () => {
    const xml = wrap(item(
      "<expDclrNo>123-456</expDclrNo><shpmCmplYn>Y</shpmCmplYn><acptDt>20260102</acptDt><loadDtyTmlm>20260120</loadDtyTmlm>",
    ));
    expect(parseExportFulfillmentResult(xml, "123456")).toEqual({
      declarationNo: "123456",
      shipmentCompleted: true,
      acceptDate: "20260102",
      loadDeadline: "20260120",
      source: "api",
    });
  });

  it("외부 API 오류 코드는 오류로 구분한다", () => {
    expect(() => parseExportFulfillmentResult(
      "<response><resultCode>99</resultCode><resultMsg>error</resultMsg></response>",
      "123456",
    )).toThrow("오류 응답");
  });
});
