const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses";

const DEFAULT_MODEL = "gpt-4o-mini";

type OpenAIAction =
  | "suggest-hs-code"
  | "generate-feedback"
  | "auto-fill-document";

interface HSCodeRequest {
  action: "suggest-hs-code";
  itemName?: string;
}

interface FeedbackProfile {
  tradeType?: string;
  itemName?: string;
  incoterms?: string;
  loadPort?: string;
  dischargePort?: string;
}

interface FeedbackRequest {
  action: "generate-feedback";
  profile?: FeedbackProfile;
  issueMessages?: unknown;
}

interface DocumentProfile {
  itemName?: string;
  companyName?: string;
  tradeType?: string;
}

interface DocumentRequest {
  action: "auto-fill-document";
  profile?: DocumentProfile;
}

type AssistantRequest =
  | HSCodeRequest
  | FeedbackRequest
  | DocumentRequest;

interface HSCodeSuggestion {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
}

interface DocumentFields {
  itemDescription: string;
  paymentTerms: string;
  currency: string;
}

interface OpenAIResponseContent {
  type?: string;
  text?: string;
}

interface OpenAIResponseOutput {
  type?: string;
  content?: OpenAIResponseContent[];
}

interface OpenAIResponseBody {
  id?: string;
  status?: string;
  output_text?: string;
  output?: OpenAIResponseOutput[];
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
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

function getString(
  value: unknown,
  maxLength = 1000,
): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function extractJson(text: string): string {
  const fenced = text.match(
    /```(?:json)?\s*([\s\S]*?)```/i,
  );

  return (fenced ? fenced[1] : text).trim();
}

function extractOutputText(
  response: OpenAIResponseBody,
): string {
  if (
    typeof response.output_text === "string" &&
    response.output_text.trim()
  ) {
    return response.output_text.trim();
  }

  const outputItems = Array.isArray(response.output)
    ? response.output
    : [];

  const textParts: string[] = [];

  for (const outputItem of outputItems) {
    if (!Array.isArray(outputItem.content)) {
      continue;
    }

    for (const contentItem of outputItem.content) {
      if (
        contentItem.type === "output_text" &&
        typeof contentItem.text === "string"
      ) {
        textParts.push(contentItem.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const model =
    Deno.env.get("OPENAI_MODEL")?.trim() ||
    DEFAULT_MODEL;

  const response = await fetch(
    OPENAI_RESPONSES_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: systemPrompt,
        input: userMessage,
        max_output_tokens: 2048,
        store: false,
      }),
    },
  );

  const responseText = await response.text();

  let responseData: OpenAIResponseBody;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    throw new Error(
      `OpenAI 응답을 JSON으로 해석할 수 없습니다. HTTP ${response.status}`,
    );
  }

  if (!response.ok) {
    const apiMessage =
      responseData.error?.message ||
      "OpenAI API 요청에 실패했습니다.";

    throw new Error(
      `OpenAI API 오류(${response.status}): ${apiMessage}`,
    );
  }

  if (responseData.status === "failed") {
    throw new Error(
      responseData.error?.message ||
        "OpenAI 응답 생성에 실패했습니다.",
    );
  }

  const outputText =
    extractOutputText(responseData);

  if (!outputText) {
    throw new Error(
      "OpenAI로부터 텍스트 응답을 받지 못했습니다.",
    );
  }

  return outputText;
}

function isHSCodeSuggestion(
  value: unknown,
): value is HSCodeSuggestion {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.code === "string" &&
    typeof value.description === "string" &&
    typeof value.confidence === "string" &&
    typeof value.reasoning === "string"
  );
}

function normalizeHSCodeSuggestions(
  value: unknown,
): HSCodeSuggestion[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "HS CODE 추천 응답이 배열 형식이 아닙니다.",
    );
  }

  const suggestions = value
    .filter(isHSCodeSuggestion)
    .slice(0, 3)
    .map((item) => ({
      code: item.code.trim(),
      description: item.description.trim(),
      confidence: item.confidence.trim(),
      reasoning: item.reasoning.trim(),
    }))
    .filter((item) => item.code.length > 0);

  if (suggestions.length === 0) {
    throw new Error(
      "유효한 HS CODE 추천 결과가 없습니다.",
    );
  }

  return suggestions;
}

function normalizeDocumentFields(
  value: unknown,
): DocumentFields {
  if (!isRecord(value)) {
    throw new Error(
      "문서 필드 응답이 객체 형식이 아닙니다.",
    );
  }

  const itemDescription =
    getString(value.itemDescription, 500);

  const paymentTerms =
    getString(value.paymentTerms, 200);

  const currency =
    getString(value.currency, 10).toUpperCase();

  if (
    !itemDescription ||
    !paymentTerms ||
    !currency
  ) {
    throw new Error(
      "문서 필드 응답에 필요한 값이 없습니다.",
    );
  }

  return {
    itemDescription,
    paymentTerms,
    currency,
  };
}

async function handleHSCodeSuggestion(
  apiKey: string,
  body: HSCodeRequest,
): Promise<Response> {
  const itemName = getString(
    body.itemName,
    300,
  );

  if (!itemName) {
    return jsonResponse(
      {
        success: false,
        error: "품목명을 입력해야 합니다.",
      },
      400,
    );
  }

  const systemPrompt = `
당신은 한국 관세청의 HS CODE(관세·통계통합품목분류표) 분류를 지원하는 전문가입니다.

사용자가 입력한 품목명을 바탕으로 가장 가능성이 높은 HS CODE 후보를 최대 3개 제시하세요.

주의사항:
- 최종 법적 품목분류 판정이 아니라 참고용 추천임을 전제로 판단하세요.
- 품목 정보가 부족하면 confidence를 낮게 표시하세요.
- 존재 여부가 불확실한 세부 코드를 단정하지 마세요.
- 반드시 JSON 배열만 출력하세요.
- 마크다운, 설명 문장, 코드펜스를 출력하지 마세요.

출력 형식:
[
  {
    "code": "8479.89.9090",
    "description": "기계류 - 기타 기계와 기계적 장치",
    "confidence": "높음",
    "reasoning": "추천 근거"
  }
]
`.trim();

  const userMessage = `
품목명: "${itemName}"

이 품목에 적합할 가능성이 높은 HS CODE 후보를 최대 3개 추천해 주세요.
`.trim();

  const outputText = await callOpenAI(
    apiKey,
    systemPrompt,
    userMessage,
  );

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      extractJson(outputText),
    );
  } catch {
    throw new Error(
      "OpenAI의 HS CODE 추천 응답이 올바른 JSON 형식이 아닙니다.",
    );
  }

  const suggestions =
    normalizeHSCodeSuggestions(parsed);

  return jsonResponse({
    success: true,
    action: "suggest-hs-code",
    itemName,
    suggestions,
    source: "openai",
  });
}

async function handleFeedbackGeneration(
  apiKey: string,
  body: FeedbackRequest,
): Promise<Response> {
  if (!isRecord(body.profile)) {
    return jsonResponse(
      {
        success: false,
        error: "거래 정보가 필요합니다.",
      },
      400,
    );
  }

  const profile = body.profile;

  const tradeType =
    getString(profile.tradeType, 20);

  const itemName =
    getString(profile.itemName, 300);

  const incoterms =
    getString(profile.incoterms, 30);

  const loadPort =
    getString(profile.loadPort, 100);

  const dischargePort =
    getString(profile.dischargePort, 100);

  const issueMessages = Array.isArray(
    body.issueMessages,
  )
    ? body.issueMessages
        .filter(
          (item): item is string =>
            typeof item === "string",
        )
        .map((item) =>
          item.trim().slice(0, 500)
        )
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (!itemName) {
    return jsonResponse(
      {
        success: false,
        error: "품목명이 필요합니다.",
      },
      400,
    );
  }

  if (issueMessages.length === 0) {
    return jsonResponse(
      {
        success: false,
        error:
          "피드백을 생성할 문제 목록이 필요합니다.",
      },
      400,
    );
  }

  const tradeTypeText =
    tradeType === "export"
      ? "수출"
      : tradeType === "import"
        ? "수입"
        : tradeType || "미지정";

  const systemPrompt = `
당신은 수출입 통관 실무를 지원하는 컨설턴트입니다.

사용자의 거래 정보와 발견된 문제를 분석하여 실무적이고 구체적인 한국어 피드백을 작성하세요.

작성 기준:
- 비전문가도 이해할 수 있도록 친절하게 설명하세요.
- 실제 입력된 정보와 문제만 근거로 작성하세요.
- 존재하지 않는 법규, 허가, 서류 의무를 단정하지 마세요.
- 확인이 필요한 사항은 "확인이 필요합니다"라고 표현하세요.
- 해결 방법을 우선적으로 안내하세요.
- 200자 이내로 간결하게 작성하세요.
- JSON이나 마크다운 없이 피드백 문장만 출력하세요.
`.trim();

  const userMessage = `
거래 정보:
- 유형: ${tradeTypeText}
- 품목: ${itemName}
- 거래조건: ${incoterms || "미지정"}
- 선적항: ${loadPort || "미지정"}
- 도착항: ${dischargePort || "미지정"}

발견된 문제:
${issueMessages
  .map(
    (message, index) =>
      `${index + 1}. ${message}`,
  )
  .join("\n")}

위 문제들에 대해 실무적인 종합 피드백을 작성해 주세요.
`.trim();

  const feedback = await callOpenAI(
    apiKey,
    systemPrompt,
    userMessage,
  );

  return jsonResponse({
    success: true,
    action: "generate-feedback",
    feedback,
    source: "openai",
  });
}

async function handleDocumentAutoFill(
  apiKey: string,
  body: DocumentRequest,
): Promise<Response> {
  if (!isRecord(body.profile)) {
    return jsonResponse(
      {
        success: false,
        error: "문서 작성 정보가 필요합니다.",
      },
      400,
    );
  }

  const profile = body.profile;

  const itemName =
    getString(profile.itemName, 300);

  const companyName =
    getString(profile.companyName, 200);

  const tradeType =
    getString(profile.tradeType, 20);

  if (!itemName) {
    return jsonResponse(
      {
        success: false,
        error: "품목명이 필요합니다.",
      },
      400,
    );
  }

  const tradeTypeText =
    tradeType === "export"
      ? "수출"
      : tradeType === "import"
        ? "수입"
        : tradeType || "미지정";

  const systemPrompt = `
당신은 국제 무역 문서 작성을 지원하는 전문가입니다.

입력받은 품목과 거래 정보를 바탕으로 상업송장 작성에 사용할 다음 값을 추천하세요.

작성 기준:
- itemDescription은 간결한 영문 품목 설명으로 작성하세요.
- 입력 정보만으로 특정 재질, 규격, 용도 등을 임의로 만들어 내지 마세요.
- paymentTerms는 일반적인 추천값으로 작성하세요.
- currency는 3자리 영문 통화코드로 작성하세요.
- 반드시 JSON 객체만 출력하세요.
- 마크다운, 코드펜스, 별도 설명을 출력하지 마세요.

출력 형식:
{
  "itemDescription": "Industrial mechanical parts",
  "paymentTerms": "T/T in advance",
  "currency": "USD"
}
`.trim();

  const userMessage = `
품목명: ${itemName}
업체명: ${companyName || "미입력"}
거래유형: ${tradeTypeText}

상업송장용 영문 품목 설명, 결제 조건, 통화를 추천해 주세요.
`.trim();

  const outputText = await callOpenAI(
    apiKey,
    systemPrompt,
    userMessage,
  );

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      extractJson(outputText),
    );
  } catch {
    throw new Error(
      "OpenAI의 문서 필드 응답이 올바른 JSON 형식이 아닙니다.",
    );
  }

  const fields =
    normalizeDocumentFields(parsed);

  return jsonResponse({
    success: true,
    action: "auto-fill-document",
    fields,
    source: "openai",
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
        "OPENAI_API_KEY",
      );

      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY가 Supabase Secrets에 설정되지 않았습니다.",
        );
      }

      let rawBody: unknown;

      try {
        rawBody = await req.json();
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

      if (!isRecord(rawBody)) {
        return jsonResponse(
          {
            success: false,
            error:
              "요청 Body는 JSON 객체여야 합니다.",
          },
          400,
        );
      }

      const action =
        getString(rawBody.action, 50) as OpenAIAction;

      switch (action) {
        case "suggest-hs-code":
          return await handleHSCodeSuggestion(
            apiKey,
            rawBody as unknown as HSCodeRequest,
          );

        case "generate-feedback":
          return await handleFeedbackGeneration(
            apiKey,
            rawBody as unknown as FeedbackRequest,
          );

        case "auto-fill-document":
          return await handleDocumentAutoFill(
            apiKey,
            rawBody as unknown as DocumentRequest,
          );

        default:
          return jsonResponse(
            {
              success: false,
              error:
                "지원하지 않는 action입니다. suggest-hs-code, generate-feedback, auto-fill-document 중 하나를 사용하세요.",
            },
            400,
          );
      }
    } catch (error) {
      console.error(
        "[openai-assistant]",
        error,
      );

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "AI 요청 처리 중 오류가 발생했습니다.",
        },
        500,
      );
    }
  },
};