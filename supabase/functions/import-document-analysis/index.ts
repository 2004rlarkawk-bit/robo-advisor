import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);
const DOCUMENT_TYPES = [
  "commercial_invoice",
  "packing_list",
  "bill_of_lading",
  "certificate_of_origin",
  "transport_request",
  "export_declaration",
  "other",
  "unknown",
] as const;
const MAX_DOCUMENTS = 15;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function debugEnabled(): boolean {
  return Deno.env.get("OPENAI_IMPORT_DOCUMENT_DEBUG")?.trim().toLowerCase() === "true";
}
function debugLog(message: string, detail: Record<string, unknown>): void {
  if (debugEnabled()) console.info(`[Export Forwarder Analysis] ${message}`, detail);
}

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
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
  };
}

const stringField = { type: "string" };
const partySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: stringField,
    address: stringField,
    country: stringField,
    contactName: stringField,
    phone: stringField,
    email: stringField,
  },
  required: ["name", "address", "country", "contactName", "phone", "email"],
};
const legacyFields = [
  "shipper", "consignee", "notifyParty", "importer", "invoiceNo",
  "productDescription", "quantity", "grossWeight", "netWeight",
  "originCountry", "destinationCountry", "currency", "totalAmount",
  "loadPort", "dischargePort", "blNo", "containerNo", "sealNo",
  "vesselName", "voyageNo", "invoiceDate", "incoterms", "paymentTerms",
  "shipmentDate", "estimatedArrivalDate", "totalPackageCount", "packageUnit",
  "grossWeightUnit", "netWeightUnit", "freight", "insurance", "otherAdditions",
  "exportDeclarationNo", "loadingMode", "measurement", "shippingMarks",
];
const itemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: stringField,
    itemNo: stringField,
    sku: stringField,
    description: stringField,
    koreanDescription: stringField,
    documentHSCode: stringField,
    confirmedHSCode: stringField,
    modelName: stringField,
    specification: stringField,
    material: stringField,
    composition: stringField,
    fabricConstruction: stringField,
    productForm: stringField,
    processingState: stringField,
    gender: stringField,
    intendedUse: stringField,
    originCountry: stringField,
    quantity: stringField,
    quantityUnit: stringField,
    unitPrice: stringField,
    currency: stringField,
    amount: stringField,
    packageCount: stringField,
    packageUnit: stringField,
    netWeight: stringField,
    grossWeight: stringField,
    measurement: stringField,
    shippingMarks: stringField,
    sourceDocumentIds: { type: "array", items: stringField },
  },
  required: [
    "id", "itemNo", "sku", "description", "koreanDescription", "documentHSCode", "confirmedHSCode",
    "modelName", "specification", "material", "composition", "fabricConstruction",
    "productForm", "processingState", "gender", "intendedUse",
    "originCountry", "quantity", "quantityUnit", "unitPrice", "currency", "amount",
    "packageCount", "packageUnit", "netWeight", "grossWeight", "measurement", "shippingMarks",
    "sourceDocumentIds",
  ],
};
const cargoTotalsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    numberOfPackages: stringField,
    grossWeight: stringField,
    measurement: stringField,
  },
  required: ["numberOfPackages", "grossWeight", "measurement"],
};
const extractedProperties = {
  ...Object.fromEntries(legacyFields.map((field) => [field, stringField])),
  exporterDetails: partySchema,
  importerDetails: partySchema,
  consigneeDetails: partySchema,
  notifyPartyDetails: partySchema,
  containerNumbers: { type: "array", items: stringField },
  sealNumbers: { type: "array", items: stringField },
  items: { type: "array", items: itemSchema },
  cargoTotals: cargoTotalsSchema,
  certificateOfOriginAvailable: { type: "boolean" },
};
const extractedRequired = [
  ...legacyFields,
  "exporterDetails", "importerDetails", "consigneeDetails", "notifyPartyDetails",
  "containerNumbers", "sealNumbers", "items", "cargoTotals", "certificateOfOriginAvailable",
];

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
          id: stringField,
          type: { type: "string", enum: DOCUMENT_TYPES },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          summary: stringField,
          sourceId: stringField,
        },
        required: ["id", "type", "confidence", "summary", "sourceId"],
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
          required: extractedRequired,
        },
        validations: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: stringField,
              field: stringField,
              message: stringField,
              severity: { type: "string", enum: ["error", "warning", "info"] },
              documents: { type: "array", items: { type: "string", enum: DOCUMENT_TYPES } },
              values: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: { documentId: stringField, value: stringField },
                  required: ["documentId", "value"],
                },
              },
            },
            required: ["id", "field", "message", "severity", "documents", "values"],
          },
        },
        comparison: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              field: stringField,
              invoice: stringField,
              packingList: stringField,
              billOfLading: stringField,
              certificateOfOrigin: stringField,
              matches: { type: "boolean" },
              detail: stringField,
            },
            required: ["field", "invoice", "packingList", "billOfLading", "certificateOfOrigin", "matches", "detail"],
          },
        },
      },
      required: ["extracted", "validations", "comparison"],
    },
  },
  required: ["classifications", "analysis"],
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
    if (!DOCUMENT_TYPES.includes(documentType as typeof DOCUMENT_TYPES[number])) throw new Error(`${fileName}의 문서 종류가 올바르지 않습니다.`);
    const prefix = `data:${mimeType};base64,`;
    if (!dataUrl.startsWith(prefix)) throw new Error(`${fileName}의 파일 데이터가 올바르지 않습니다.`);
    const base64 = dataUrl.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error(`${fileName}의 Base64 데이터가 올바르지 않습니다.`);
    const approximateBytes = Math.floor(base64.length * 0.75);
    if (approximateBytes > MAX_FILE_BYTES) throw new Error(`${fileName}은 10MB를 초과합니다.`);
    totalBytes += approximateBytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error("전체 파일 크기는 25MB 이하여야 합니다.");
    ids.add(id);
    return { id, fileName, mimeType, documentType: documentType as RequestDocument["documentType"], dataUrl };
  });
}
function extractOutputText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  return (response.output ?? []).flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text as string).join("\n").trim();
}

async function analyzeWithOpenAI(apiKey: string, documents: RequestDocument[]) {
  const model = Deno.env.get("OPENAI_IMPORT_DOCUMENT_MODEL")?.trim()
    || Deno.env.get("OPENAI_MODEL")?.trim()
    || "gpt-5.6";
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: [
      "첨부된 해상 무역 문서에 실제로 기재된 값만 추출하세요.",
      "문서에 없는 값은 추측하거나 생성하지 말고 빈 문자열 또는 빈 배열로 반환하세요.",
      "항공운송 문서나 필드를 만들지 마세요.",
      "각 파일을 commercial_invoice, packing_list, bill_of_lading, certificate_of_origin, transport_request, export_declaration, other 중 하나로 분류하세요.",
      "문서 분류 근거의 우선순위는 ① 문서 내부의 명확한 제목 ② 파일명의 명확한 문서명 ③ 본문의 특징적인 필드 조합 ④ 사전 분류 힌트입니다.",
      "파일명과 문서 내부 제목이 다르면 반드시 문서 내부 제목을 우선하세요.",
      "내부 제목에서 상업송장·상업 송장·상업송장서·COMMERCIAL INVOICE는 commercial_invoice, 포장명세서·포장 명세서·포장내역서·포장 목록·PACKING LIST는 packing_list로 분류하세요.",
      "내부 제목에서 선하증권·선하 증권·선하증권서·해상선하증권·BILL OF LADING은 bill_of_lading, 원산지증명서·원산지 증명서·원산지증명·CERTIFICATE OF ORIGIN은 certificate_of_origin으로 분류하세요.",
      "수출운송의뢰서·운송의뢰서·선적의뢰서·선적요청·SHIPPING REQUEST·SHIPPING INSTRUCTION·SHIPPING ORDER·S/I·EXPORT TRANSPORT REQUEST는 transport_request로 분류하세요.",
      "운송의뢰서 제목이 명확하지 않으면 선적항/POL, 도착항/POD와 Shipper/Consignee 또는 ETD/ETA/Vessel/Voyage/Booking 중 둘 이상의 특징 조합을 보조 근거로 사용하세요.",
      "송장·INVOICE·포장·SHIPPING 같은 약한 단어 하나만으로 분류하지 말고 문서 구조를 함께 확인하세요.",
      "commercial_invoice는 Invoice No./Seller/Buyer/단가/금액, packing_list는 package/carton/포장수량/순중량/총중량, bill_of_lading은 shipper/consignee/vessel/선적항/양하항/container/seal, certificate_of_origin은 원산지국/원산지 기준/발급·인증기관 조합을 근거로 삼으세요.",
      "동일 종류 파일이 여러 개면 파일 ID로 출처를 구분하고, 각 품목의 sourceDocumentIds에 근거 파일 ID를 넣으세요.",
      "Exporter, Importer, Consignee, Notify Party를 서로 합치지 말고 각각 구조화하세요.",
      "C/I, P/L, transport_request의 모든 품목을 문서 행 단위 그대로 items 배열의 별도 객체로 반환하세요. 단일 품목도 items 배열을 사용하고 confirmedHSCode는 항상 빈 문자열이어야 합니다.",
      "각 items 객체에는 문서에 실제 기재된 Item No./SKU, 품명, 포장수량·포장종류, 순중량·총중량, CBM/Measurement, Marks & Numbers를 해당 품목 값으로만 넣으세요.",
      "TOTAL, GRAND TOTAL, TOTAL PACKAGES, TOTAL GROSS WEIGHT, TOTAL CBM은 특정 items 객체에 넣지 말고 cargoTotals에만 반환하세요.",
      "품목별 중량·포장수량·CBM이 없고 전체 TOTAL만 있으면 품목별 값을 계산·추정·균등분배하지 말고 해당 items 필드는 빈 문자열로 유지하세요.",
      "같은 파일의 품목 순서와 행 경계를 유지하세요. 첫 품목명에 문서 전체 포장수량·중량·CBM을 결합하지 마세요.",
      "컨테이너와 Seal은 실제 발견된 값만 배열로 반환하세요.",
      "운송방식은 문서에 FCL 또는 LCL이 명시된 경우에만 loadingMode로 반환하고, CBM/Measurement는 measurement, Marks & Numbers는 shippingMarks, 수출신고번호는 exportDeclarationNo로 반환하세요.",
      "transport_request는 C/I나 P/L의 모든 필드를 포함하지 않아도 정상 문서입니다. 확인되지 않는 필드는 빈 문자열·빈 배열로 채우고, 일부 필드가 없다는 이유로 분석을 실패시키지 마세요.",
      "원산지는 C/O, C/I, P/L, 기타서류 순서로 살피되 서로 다르면 임의 선택하지 말고 validations와 comparison에 충돌값을 기록하세요.",
      "certificateOfOriginAvailable은 certificate_of_origin 파일이 첨부된 경우에만 true로 반환하세요.",
      "문서에서 발견한 해외 HS Code는 documentHSCode에만 원문 표기대로 넣고 대한민국 HSK를 추천하거나 생성하지 마세요.",
      "품목분류 판단에 쓰일 수 있는 품명·한국어 품명·재질·성분비·직물/편물·제품 형태·가공 상태·성별·용도·모델명·규격·원산지를 문서에 있는 경우에만 추출하세요.",
      "금액은 통화기호 없이 숫자 문자열로, 단위는 별도 필드에 적으세요.",
      "문서 간 품명, 수량/단위, Consignee, Invoice 번호, 포장, 중량, 통화, 원산지, 컨테이너, Seal 불일치를 비교하세요.",
    ].join("\n"),
  }];
  for (const document of documents) {
    content.push({ type: "input_text", text: `파일 ID: ${document.id}\n파일명: ${document.fileName}\n파일명/사용자 사전 분류 힌트: ${document.documentType}` });
    content.push(document.mimeType === "application/pdf"
      ? { type: "input_file", filename: document.fileName, file_data: document.dataUrl, detail: "high" }
      : { type: "input_image", image_url: document.dataUrl, detail: "high" });
  }
  const openAiStartedAt = performance.now();
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      instructions: "당신은 해상 수입 문서를 정확히 판독하는 전문가입니다. 첨부 원문에 근거한 정보만 구조화하세요.",
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "import_document_analysis", strict: true, schema: analysisSchema } },
      max_output_tokens: 12000,
      store: false,
    }),
  });
  const responseText = await response.text();
  const openAiMs = performance.now() - openAiStartedAt;
  debugLog("AI raw response", {
    httpStatus: response.status,
    ok: response.ok,
    responsePreview: responseText.slice(0, 800),
  });
  const responseParseStartedAt = performance.now();
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
  if (!isRecord(result) || !isRecord(result.analysis)) throw new Error("OpenAI 분석 결과 구조가 올바르지 않습니다.");
  return {
    result,
    model,
    timing: {
      openAiMs: Math.round(openAiMs),
      responseParseMs: Math.round(performance.now() - responseParseStartedAt),
      inputTokens: responseData.usage?.input_tokens,
      outputTokens: responseData.usage?.output_tokens,
      reasoningTokens: responseData.usage?.output_tokens_details?.reasoning_tokens,
    },
  };
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return jsonResponse({ success: false, error: "POST 요청만 허용합니다." }, 405);
    const totalStartedAt = performance.now();
    let stage = "request_received";
    let documentTypes: string[] = [];
    try {
      const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
      if (!apiKey) throw new Error("Supabase Edge Function에 OPENAI_API_KEY secret이 설정되지 않았습니다.");
      stage = "request_body_parse";
      const requestParseStartedAt = performance.now();
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ success: false, error: "요청 Body가 올바른 JSON 형식이 아닙니다." }, 400);
      }
      if (!isRecord(body)) return jsonResponse({ success: false, error: "요청 Body는 JSON 객체여야 합니다." }, 400);
      stage = "request_validation";
      const documents = parseDocuments(body.documents);
      documentTypes = documents.map(({ documentType }) => documentType);
      debugLog("file received", {
        documents: documents.map(({ id, documentType, mimeType, dataUrl }) => ({
          id,
          documentType,
          mimeType,
          inputBytesApprox: Math.floor(dataUrl.slice(dataUrl.indexOf(",") + 1).length * 0.75),
        })),
      });
      const requestParseMs = performance.now() - requestParseStartedAt;
      const inputBytes = documents.reduce(
        (total, document) => total + Math.floor(document.dataUrl.slice(document.dataUrl.indexOf(',') + 1).length * 0.75),
        0,
      );
      stage = "openai_request_and_parse";
      const { result, model, timing: openAiTiming } = await analyzeWithOpenAI(apiKey, documents);
      const classifications = Array.isArray(result.classifications) ? result.classifications : [];
      debugLog("parsed result", {
        classifications: classifications.map((classification) => isRecord(classification)
          ? { id: classification.id, type: classification.type, confidence: classification.confidence }
          : { invalid: true }),
      });
      stage = "response_normalization";
      const timing = {
        requestParseMs: Math.round(requestParseMs),
        ...openAiTiming,
        totalMs: Math.round(performance.now() - totalStartedAt),
        inputBytes,
      };
      console.info("[Import Document Analysis]", {
        documentCount: documents.length,
        model,
        ...timing,
      });
      return jsonResponse({ success: true, source: "openai", model, timing, ...result });
    } catch (error) {
      console.error("[import-document-analysis]", {
        stage,
        documentTypes,
        message: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({
        success: false,
        error: error instanceof Error ? error.message : "수입 문서 분석 중 오류가 발생했습니다.",
      }, 500);
    }
  },
};
