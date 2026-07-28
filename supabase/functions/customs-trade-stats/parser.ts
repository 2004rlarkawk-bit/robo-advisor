export type CustomsTradeStatsAction = "total" | "country" | "item";

export interface TotalTradeRecord {
  period: string;
  exportCount: number;
  exportAmount: number;
  importCount: number;
  importAmount: number;
  balance: number;
}

export interface CountryTradeRecord extends TotalTradeRecord {
  countryCode: string;
  countryName: string;
}

export interface ItemTradeRecord {
  period: string;
  hsCode: string;
  exportWeight: number;
  exportAmount: number;
  importWeight: number;
  importAmount: number;
  balance: number;
}

export type CustomsTradeRecord =
  | TotalTradeRecord
  | CountryTradeRecord
  | ItemTradeRecord;

export class CustomsXmlError extends Error {
  constructor(
    public readonly code: "CUSTOMS_API_ERROR" | "CUSTOMS_XML_PARSE_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "CustomsXmlError";
  }
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
  const match = xml.match(
    new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"),
  );
  return match ? decodeXmlText(match[1].trim()) : "";
}

function parseItems(xml: string): Record<string, string>[] {
  const matches = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];

  return matches.map((itemXml) => {
    const record: Record<string, string> = {};
    const innerXml = itemXml
      .replace(/^<item(?:\s[^>]*)?>/i, "")
      .replace(/<\/item>$/i, "");

    for (const match of innerXml.matchAll(
      /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g,
    )) {
      record[match[1]] = decodeXmlText(match[2].trim());
    }
    return record;
  });
}

function normalizePeriod(value: string): string | null {
  if (!value || value === "총계") return null;
  const digits = value.replace(/[^0-9]/g, "");
  if (!/^\d{6}$/.test(digits)) {
    throw new CustomsXmlError(
      "CUSTOMS_XML_PARSE_ERROR",
      `유효하지 않은 기간 형식: ${value}`,
    );
  }
  const month = Number(digits.slice(4, 6));
  if (month < 1 || month > 12) {
    throw new CustomsXmlError(
      "CUSTOMS_XML_PARSE_ERROR",
      `유효하지 않은 월 형식: ${value}`,
    );
  }
  return digits;
}

function numberValue(value: string | undefined, field: string): number {
  if (!value?.trim()) return 0;
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) {
    throw new CustomsXmlError(
      "CUSTOMS_XML_PARSE_ERROR",
      `${field} 숫자 필드를 해석할 수 없습니다.`,
    );
  }
  return parsed;
}

function baseTradeRecord(item: Record<string, string>, period: string) {
  return {
    period,
    exportCount: numberValue(item.expCnt, "expCnt"),
    exportAmount: numberValue(item.expDlr, "expDlr"),
    importCount: numberValue(item.impCnt, "impCnt"),
    importAmount: numberValue(item.impDlr, "impDlr"),
    balance: numberValue(item.balPayments, "balPayments"),
  };
}

function assertSuccessfulXml(xml: string): void {
  const trimmed = xml.trim();
  if (
    !trimmed.startsWith("<") ||
    !trimmed.endsWith(">") ||
    /<parsererror[\s>]/i.test(trimmed)
  ) {
    throw new CustomsXmlError(
      "CUSTOMS_XML_PARSE_ERROR",
      "관세청 XML 응답 형식이 올바르지 않습니다.",
    );
  }

  const resultCode = extractTag(trimmed, "resultCode");
  if (!resultCode) {
    throw new CustomsXmlError(
      "CUSTOMS_XML_PARSE_ERROR",
      "관세청 응답에 결과코드가 없습니다.",
    );
  }
  if (resultCode !== "00") {
    throw new CustomsXmlError(
      "CUSTOMS_API_ERROR",
      `관세청 응답 오류 코드: ${resultCode}`,
    );
  }
}

export function parseCustomsTradeStatsXml(
  action: CustomsTradeStatsAction,
  xml: string,
  requestedHsCode = "",
): CustomsTradeRecord[] {
  assertSuccessfulXml(xml);
  const items = parseItems(xml);

  if (action === "total") {
    return items
      .flatMap((item): TotalTradeRecord[] => {
        const period = normalizePeriod(item.year ?? "");
        return period ? [baseTradeRecord(item, period)] : [];
      })
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  if (action === "country") {
    return items
      .flatMap((item): CountryTradeRecord[] => {
        const period = normalizePeriod(item.year ?? "");
        if (!period) return [];
        return [{
          ...baseTradeRecord(item, period),
          countryCode: (item.statCd ?? "").trim(),
          countryName: (item.statCdCntnKor1 ?? "").trim(),
        }];
      })
      .sort((a, b) =>
        a.period.localeCompare(b.period) ||
        a.countryCode.localeCompare(b.countryCode)
      );
  }

  const byPeriod = new Map<string, ItemTradeRecord>();
  for (const item of items) {
    const period = normalizePeriod(item.year ?? "");
    if (!period) continue;
    const current = byPeriod.get(period) ?? {
      period,
      hsCode: (item.hsCd || requestedHsCode).replace(/[^0-9]/g, ""),
      exportWeight: 0,
      exportAmount: 0,
      importWeight: 0,
      importAmount: 0,
      balance: 0,
    };
    current.exportWeight += numberValue(item.expWgt, "expWgt");
    current.exportAmount += numberValue(item.expDlr, "expDlr");
    current.importWeight += numberValue(item.impWgt, "impWgt");
    current.importAmount += numberValue(item.impDlr, "impDlr");
    current.balance += numberValue(item.balPayments, "balPayments");
    byPeriod.set(period, current);
  }
  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export function getLatestPeriod(records: CustomsTradeRecord[]): string | null {
  return records.reduce<string | null>(
    (latest, record) => latest === null || record.period > latest ? record.period : latest,
    null,
  );
}
