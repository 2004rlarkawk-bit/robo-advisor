import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const DOCUMENT_TYPES = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "unknown",
] as const;
const MAX_DOCUMENTS = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

interface RequestDocument {
  id: string;
  fileName: string;
  mimeType: string;
  documentType: typeof DOCUMENT_TYPES[number];
  dataUrl: string;
}

interface OpenAIResponse {
  status?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
  }>;
  error?: { message?: string };
}

const extractedProperties = Object.fromEntries([
  "shipper",
  "consignee",
  "notifyParty",
  "importer",
  "invoiceNo",
  "productDescription",
  "quantity",
  "grossWeight",
  "netWeight",
  "originCountry",
  "destinationCountry",
  "currency",
  "totalAmount",
  "loadPort",
  "dischargePort",
  "blNo",
  "containerNo",
  "sealNo",
  "vesselName",
  "voyageNo",
].map((field) => [field, { type: "string" }]));

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    classifications: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: DOCUMENT_TYPES },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string" },
        },
        required: ["id", "type", "confidence", "summary"],
      },
    },
    analysis: {
      type: "object",
      additionalProperties: false,
      properties: {
        extracted: {
          type: "object",
          additionalProperties: false,
          properties: extractedProperties,
          required: Object.keys(extractedProperties),
        },
        validations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              field: { type: "string" },
              message: { type: "string" },
              severity: { type: "string", enum: ["error", "warning", "info"] },
              documents: {
                type: "array",
                items: { type: "string", enum: DOCUMENT_TYPES },
              },
            },
            required: ["id", "field", "message", "severity", "documents"],
          },
        },
        comparison: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: { type: "string" },
              invoice: { type: "string" },
              packingList: { type: "string" },
              billOfLading: { type: "string" },
              matches: { type: "boolean" },
              detail: { type: "string" },
            },
            required: [
              "field",
              "invoice",
              "packingList",
              "billOfLading",
              "matches",
              "detail",
            ],
          },
        },
      },
      required: ["extracted", "validations", "comparison"],
    },
    suggestions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          description: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["code", "description", "reasoning", "confidence"],
      },
    },
  },
  required: ["classifications", "analysis", "suggestions"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function parseDocuments(value: unknown): RequestDocument[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_DOCUMENTS) {
    throw new Error(`문서는 1개 이상 ${MAX_DOCUMENTS}개 이하로 전송해 주세요.`);
  }

  let totalBytes = 0;
  const ids = new Set<string>();

  return value.map((item) => {
    if (!isRecord(item)) throw new Error("문서 데이터 형식이 올바르지 않습니다.");

    const id = cleanString(item.id, 100);
    const fileName = cleanString(item.fileName, 255);
    const mimeType = cleanString(item.mimeType, 50).toLowerCase();
    const documentType = cleanString(item.documentType, 50);
    const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";

    if (!id || ids.has(id)) throw new Error("문서 ID가 없거나 중복되었습니다.");
    if (!fileName) throw new Error("파일명이 없습니다.");
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error(`${fileName}은 지원하지 않는 파일 형식입니다.`);
    if (!DOCUMENT_TYPES.includes(documentType as typeof DOCUMENT_TYPES[number])) {
      throw new Error(`${fileName}의 문서 종류가 올바르지 않습니다.`);
    }

    const prefix = `data:${mimeType};base64,`;
    if (!dataUrl.startsWith(prefix)) throw new Error(`${fileName}의 파일 데이터가 올바르지 않습니다.`);
    const base64 = dataUrl.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error(`${fileName}의 Base64 데이터가 올바르지 않습니다.`);

    const approximateBytes = Math.floor(base64.length * 0.75);
    if (approximateBytes > MAX_FILE_BYTES) throw new Error(`${fileName}은 10MB를 초과합니다.`);
    totalBytes += approximateBytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("전체 파일 크기는 25MB 이하여야 합니다.");

    ids.add(id);
    return {
      id,
      fileName,
      mimeType,
      documentType: documentType as typeof DOCUMENT_TYPES[number],
      dataUrl,
    };
  });
}

function extractOutputText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n")
    .trim();
}

async function analyzeWithOpenAI(apiKey: string, documents: RequestDocument[]) {
  const model = Deno.env.get("OPENAI_IMPORT_DOCUMENT_MODEL")?.trim() ||
    Deno.env.get("OPENAI_MODEL")?.trim() ||
    "gpt-5.6";

  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: [
      "첨부된 수입 무역 문서의 실제 내용만 분석하세요.",
      "읽을 수 없거나 문서에 없는 값은 추측하지 말고 빈 문자열로 반환하세요.",
      "각 파일을 commercial_invoice, packing_list, bill_of_lading, unknown 중 하나로 분류하세요.",
      "문서 간 불일치는 validations와 comparison에 한국어로 기록하세요.",
      "HS Code는 품목 근거가 충분할 때만 최대 3개 추천하고, 불충분하면 빈 배열을 반환하세요.",
      "금액은 통화 기호 없이 숫자 문자열로, 국가명과 항만명은 문서 표기를 우선 사용하세요.",
    ].join("\n"),
  }];

  for (const document of documents) {
    content.push({
      type: "input_text",
      text: `파일 ID: ${document.id}\n파일명: ${document.fileName}\n사용자 사전 분류: ${document.documentType}`,
    });

    content.push(document.mimeType === "application/pdf"
      ? {
        type: "input_file",
        filename: document.fileName,
        file_data: document.dataUrl,
        detail: "high",
      }
      : {
        type: "input_image",
        image_url: document.dataUrl,
        detail: "high",
      });
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: "당신은 수입 통관 문서를 정확하게 판독하는 전문가입니다. 첨부 원문에 근거한 정보만 구조화해 반환하세요.",
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "import_document_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
      max_output_tokens: 6000,
      store: false,
    }),
  });

  const responseText = await response.text();
  let responseData: OpenAIResponse;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    throw new Error(`OpenAI 응답을 JSON으로 해석할 수 없습니다. HTTP ${response.status}`);
  }

  if (!response.ok || responseData.status === "failed") {
    throw new Error(`OpenAI API 오류(${response.status}): ${responseData.error?.message ?? "분석 요청이 실패했습니다."}`);
  }

  const outputText = extractOutputText(responseData);
  if (!outputText) throw new Error("OpenAI가 분석 결과를 반환하지 않았습니다.");

  let result: unknown;
  try {
    result = JSON.parse(outputText);
  } catch {
    throw new Error("OpenAI 분석 결과가 올바른 JSON 형식이 아닙니다.");
  }
  if (!isRecord(result) || !isRecord(result.analysis)) {
    throw new Error("OpenAI 분석 결과 구조가 올바르지 않습니다.");
  }

  return { result, model };
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return jsonResponse({ success: false, error: "POST 요청만 허용됩니다." }, 405);

    try {
      const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
      if (!apiKey) throw new Error("Supabase Edge Function에 OPENAI_API_KEY secret이 설정되지 않았습니다.");

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ success: false, error: "요청 Body가 올바른 JSON 형식이 아닙니다." }, 400);
      }
      if (!isRecord(body)) return jsonResponse({ success: false, error: "요청 Body는 JSON 객체여야 합니다." }, 400);

      const documents = parseDocuments(body.documents);
      const { result, model } = await analyzeWithOpenAI(apiKey, documents);
      return jsonResponse({
        success: true,
        source: "openai",
        model,
        ...result,
      });
    } catch (error) {
      console.error("[import-document-analysis]", error);
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "수입 문서 분석 중 오류가 발생했습니다.",
      }, 500);
    }
  },
};
