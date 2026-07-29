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
  candidateCodes?: unknown;
  itemDetails?: unknown;
  discoveryMode?: unknown;
}

interface HSCodeCandidate {
  code: string;
  koreanName: string;
  englishName: string;
  classificationName: string;
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

interface HSCodeSuggestion {
  code: string;
  description: string;
  confidence: string;
  reasoning: string;
  distinguishingFactors?: string[];
  missingInformation?: string[];
}

interface HSCodeDecision {
  suggestions: HSCodeSuggestion[];
  additionalInformationRequired: boolean;
  requiredAdditionalInfo: string[];
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

function normalizeStringList(
  value: unknown,
  limit = 6,
): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string =>
          typeof item === "string"
        )
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, limit)
    : [];
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

function cleanHSCode(value: string): string {
  return value.replace(/[\s.-]/g, "");
}

function normalizeHSPrefixes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string =>
          typeof item === "string"
        )
        .map(cleanHSCode)
        .filter((item) => /^(\d{4}|\d{6})$/.test(item)),
    ),
  ).slice(0, 3);
}

function normalizeCandidateCodes(
  value: unknown,
): HSCodeCandidate[] | null {
  if (!Array.isArray(value)) return null;

  const seen = new Set<string>();
  const candidates: HSCodeCandidate[] = [];

  for (const entry of value.slice(0, 30)) {
    if (!isRecord(entry)) continue;

    const code = cleanHSCode(getString(entry.code, 30));
    const koreanName = getString(entry.koreanName, 300);
    const englishName = getString(entry.englishName, 300);
    const classificationName = getString(
      entry.classificationName,
      300,
    );

    if (!/^\d{10}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    candidates.push({
      code,
      koreanName,
      englishName,
      classificationName,
    });
  }

  return candidates;
}

function normalizeItemDetails(
  value: unknown,
): Record<string, string> {
  if (!isRecord(value)) return {};

  const allowedFields = [
    "material",
    "fabricConstruction",
    "intendedUse",
    "productForm",
    "processingState",
    "ageGroup",
  ];
  const details: Record<string, string> = {};

  for (const field of allowedFields) {
    const detail = getString(value[field], 300);
    if (detail) details[field] = detail;
  }
  return details;
}

function normalizeHSCodeDecision(
  value: unknown,
  allowedCodes: Set<string>,
): HSCodeDecision {
  if (!isRecord(value)) {
    throw new Error(
      "HS CODE 추천 판단 응답이 객체 형식이 아닙니다.",
    );
  }

  const rawSuggestions = Array.isArray(value.suggestions)
    ? value.suggestions
    : [];
  const seenDescriptions = new Set<string>();
  const seenReasonings = new Set<string>();
  const suggestions = rawSuggestions
    .filter(isHSCodeSuggestion)
    .map((item) => ({
      code: cleanHSCode(item.code),
      description: item.description.trim(),
      confidence: item.confidence.trim(),
      reasoning: item.reasoning.trim(),
      distinguishingFactors: normalizeStringList(
        item.distinguishingFactors,
      ),
      missingInformation: normalizeStringList(
        item.missingInformation,
      ),
    }))
    .filter((item) =>
      /^\d{10}$/.test(item.code) &&
      allowedCodes.has(item.code) &&
      ["높음", "high", "보통", "medium", "moderate"].includes(
        item.confidence.toLowerCase(),
      )
    )
    .filter((item) => {
      const descriptionKey = item.description
        .toLowerCase()
        .replace(/\s+/g, " ");
      const reasoningKey = item.reasoning
        .toLowerCase()
        .replace(/\s+/g, " ");

      if (
        !descriptionKey ||
        !reasoningKey ||
        seenDescriptions.has(descriptionKey) ||
        seenReasonings.has(reasoningKey)
      ) {
        return false;
      }

      seenDescriptions.add(descriptionKey);
      seenReasonings.add(reasoningKey);
      return true;
    })
    .slice(0, 3);

  const requiredAdditionalInfo = Array.from(
    new Set([
      ...normalizeStringList(value.requiredAdditionalInfo),
      ...suggestions.flatMap((item) =>
        item.missingInformation
      ),
    ]),
  ).slice(0, 6);

  const additionalInformationRequired =
    value.additionalInformationRequired === true ||
    requiredAdditionalInfo.length > 0 ||
    suggestions.length === 0;

  return {
    suggestions,
    additionalInformationRequired,
    requiredAdditionalInfo,
  };
}

function ensureApparelConfirmationInfo(
  decision: HSCodeDecision,
  itemName: string,
  itemDetails: Record<string, string>,
): HSCodeDecision {
  if (
    !decision.suggestions.some(({ code }) =>
      /^(61|62)/.test(code)
    )
  ) {
    return decision;
  }

  const providedDetails = [
    itemName,
    ...Object.values(itemDetails),
  ].join(" ");
  const hasCompositionRatio =
    /\d+(?:\.\d+)?\s*%/.test(providedDetails);
  const hasOuterShellBasis =
    /(겉감|outer\s*shell|shell\s*fabric)/i.test(
      providedDetails,
    );
  const alreadyRequestsComposition =
    decision.requiredAdditionalInfo.some((info) =>
      /(겉감|outer\s*shell|shell\s*fabric)/i.test(info) &&
      /(조성|함량|composition|content|percentage)/i.test(info)
    );

  if (
    alreadyRequestsComposition ||
    (hasCompositionRatio && hasOuterShellBasis)
  ) {
    return decision;
  }

  const confirmation =
    "주된 겉감의 재질인지와 정확한 섬유 조성비";

  return {
    ...decision,
    additionalInformationRequired: true,
    requiredAdditionalInfo: Array.from(
      new Set([
        ...decision.requiredAdditionalInfo,
        confirmation,
      ]),
    ).slice(0, 6),
  };
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

  /*
   * candidateCodes가 전달된 경우에만 입력 폼용 근거 제한 모드로 동작합니다.
   * 필드가 없는 기존 HSCodeAgent 호출은 아래의 기존 프롬프트와 배열 응답을
   * 그대로 사용하므로 하위 호환됩니다.
   */
  const candidateCodes =
    normalizeCandidateCodes(body.candidateCodes);

  if (candidateCodes !== null) {
    const itemDetails = normalizeItemDetails(
      body.itemDetails,
    );

    if (body.discoveryMode === true) {
      const discoveryPrompt = `
당신은 한국 관세청 HSK 품목분류를 지원하는 전문가입니다.
법적 확정이 아니라 관련 10자리 HSK 후보를 찾기 위한 HS 6자리 방향 탐색 단계입니다.

사용자 품목명과 상세정보를 기준으로 가장 관련 있는 HS 6자리 subheading prefix를 1~3개 반환하세요. 정확한 6자리를 판단하기 어려우면 관련 HS 4자리 heading을 fallback으로 반환할 수 있습니다.
- 제공된 candidateCodes는 문자열 검색 참고자료일 뿐이며 그 목록의 prefix로 제한되지 않습니다.
- 완제품 입력에는 부품ㆍ원재료ㆍ스크랩 prefix를 선택하지 마세요.
- 명시된 재질과 충돌하는 재질의 prefix를 선택하지 마세요.
- 제품의 핵심 명사와 기능을 재질 단어보다 우선하세요. 티셔츠를 코트ㆍ슈트로, 완제품 노트북을 케이스ㆍCPU 같은 부품으로, 식사용 스푼을 철강 스크랩ㆍ원재료로 분류하지 마세요.
- candidateCodes에서 classificationName이 사용자 제품 종류와 직접 일치하는 후보가 있으면, 재질만 일치하고 제품 종류가 다른 후보보다 그 후보의 6자리 방향을 우선하세요.
- 성별이 명시되지 않은 의류처럼 실제로 서로 다른 방향이 가능한 경우에는 의미 있게 다른 방향을 함께 반환하세요.
- 성별, 직물/편물, 재질, 용도, 완제품/부분품, 가공 상태와 품종을 실제 분류 조건으로 적용하세요.
- 정보가 부족해 의미 있게 다른 방향이 가능하면 최대 3개를 반환하고 확인할 정보를 함께 작성하세요.
- 품목명이 무의미하거나 지나치게 일반적일 때만 prefix를 비우세요.
- 10자리 코드는 반환하지 마세요. 6자리 subheading을 우선하고 불가능할 때만 4자리 heading을 반환하세요.
- 반드시 JSON 객체만 출력하세요.

출력 형식:
{
  "suggestedPrefixes": ["6자리 또는 fallback 4자리 숫자"],
  "additionalInformationRequired": true,
  "requiredAdditionalInfo": ["방향을 좁히기 위해 확인할 정보"]
}
`.trim();
      const discoveryMessage = `
사용자 품목명:
${itemName}

현재 제공된 상세정보:
${JSON.stringify(itemDetails)}

로컬 문자열 검색 참고 후보:
${JSON.stringify(candidateCodes)}
`.trim();
      const discoveryText = await callOpenAI(
        apiKey,
        discoveryPrompt,
        discoveryMessage,
      );

      let discovery: unknown;
      try {
        discovery = JSON.parse(
          extractJson(discoveryText),
        );
      } catch {
        throw new Error(
          "OpenAI의 HS 6자리 방향 응답이 올바른 JSON 형식이 아닙니다.",
        );
      }
      if (!isRecord(discovery)) {
        throw new Error(
          "OpenAI의 HS 6자리 방향 응답이 객체 형식이 아닙니다.",
        );
      }

      const suggestedPrefixes = normalizeHSPrefixes(
        discovery.suggestedPrefixes,
      );
      const requiredAdditionalInfo = normalizeStringList(
        discovery.requiredAdditionalInfo,
      );

      return jsonResponse({
        success: true,
        action: "suggest-hs-code",
        itemName,
        suggestedPrefixes,
        additionalInformationRequired:
          discovery.additionalInformationRequired === true ||
          requiredAdditionalInfo.length > 0,
        requiredAdditionalInfo,
        source: "openai",
      });
    }

    if (candidateCodes.length === 0) {
      return jsonResponse({
        success: true,
        action: "suggest-hs-code",
        itemName,
        suggestions: [],
        additionalInformationRequired: true,
        requiredAdditionalInfo: [
          "관세청 데이터에서 관련 분류 후보를 찾을 수 있도록 더 구체적인 품목명",
        ],
        source: "openai",
      });
    }

    const systemPrompt = `
당신은 한국 관세청 HSK 품목분류를 지원하는 전문가입니다.
이 기능은 법적 확정이 아니라 사용자가 검토할 유력 후보를 제공하는 입력 지원 기능입니다.
사용자 정보와 candidateCodes를 비교하여 제공된 목록 안에서만 10자리 HSK 후보를 최대 3개 반환하세요.

판단 절차:
1. 품목명에서 가장 관련 있는 HS 6자리 방향을 판단하세요.
2. candidateCodes 중 그 방향과 공식 한글명ㆍ영문명ㆍ분류명이 합리적으로 관련된 10자리 후보를 비교하세요.
3. 재질, 성별, 직물/편물, 용도, 완제품/부분품, 가공 상태, 제품 종류처럼 실제 분류에 영향을 주는 조건을 적용하세요.

추천 정책:
- 정보가 부족해도 관련성이 합리적이면 confidence "보통" 후보를 반환하고 부족한 정보는 별도로 표시하세요.
- 매우 유력하면 "높음", 추가정보에 따라 달라질 수 있지만 충분히 관련 있으면 "보통"을 사용하세요.
- "낮음" 후보는 반환하지 마세요. confidence는 법적 정확도나 통계적 확률이 아니라 추천 강도입니다.
- additionalInformationRequired가 true여도 suggestions를 비우지 마세요. 후보와 추가정보 필요 상태는 동시에 존재할 수 있습니다.
- 다음 경우에만 suggestions를 비우세요: 품목명이 무의미하거나 지나치게 일반적임, 관련 관세청 후보가 없음, 판단한 6자리 방향의 10자리 후보가 없음, 입력과 후보의 관련성이 매우 낮음.
- 단순히 재질ㆍ성별ㆍ규격 등이 부족하다는 이유만으로 관련 후보를 숨기지 마세요.
- 품목의 핵심 명사와 기능을 재질 일치보다 우선하세요. 완제품 입력에는 부품ㆍ원재료ㆍ스크랩 후보를 추천하지 말고, 명시된 제품 종류와 다른 의류ㆍ도구ㆍ기계 후보도 제외하세요.
- candidateCodes의 classificationName이 사용자 제품 종류와 직접 일치하면 이를 강한 제품 형태 근거로 사용하세요. koreanName이나 englishName의 재질만 일치하고 classificationName의 제품 종류가 다른 후보보다 우선합니다.
- 사용자가 명시한 성별ㆍ재질ㆍ직물/편물ㆍ제품 종류를 누락 정보라고 다시 요구하지 마세요.
- 유력 후보가 하나면 1개만, 의미 있게 다른 후보가 있으면 최대 3개까지 반환하세요.
- 설명과 분류 조건이 같은 후보를 개수 채우기용으로 반복하지 마세요.
- description에는 candidateCodes의 공식 명칭과 해당 코드만의 분류 조건을 반영하고 공식 데이터에 없는 특성을 만들지 마세요.
- reasoning에는 유력한 이유, 다른 후보와 구분되는 조건, 현재 부족한 정보를 구체적으로 쓰세요.
- distinguishingFactors에는 후보를 구분하는 조건을, missingInformation에는 해당 후보를 최종 확인하려면 필요한 정보를 쓰세요.
- requiredAdditionalInfo에는 모든 후보에 공통으로 추가 확인할 정보를 중복 없이 쓰세요.
- missingInformation 또는 requiredAdditionalInfo가 하나라도 있으면 additionalInformationRequired를 true로 설정하세요.
- 반드시 JSON 객체만 출력하고 마크다운이나 설명을 덧붙이지 마세요.

반드시 다음 JSON 객체만 출력하세요:
{
  "suggestions": [
    {
      "code": "10자리 코드",
      "description": "후보별 고유 설명",
      "confidence": "높음 또는 보통",
      "reasoning": "후보별 고유 근거와 차이",
      "distinguishingFactors": ["후보를 구분하는 조건"],
      "missingInformation": ["이 후보의 최종 확인에 필요한 정보"]
    }
  ],
  "additionalInformationRequired": true,
  "requiredAdditionalInfo": ["최종 확정 전 확인할 정보"]
}
`.trim();

    const userMessage = `
사용자 품목명:
${itemName}

현재 제공된 상세정보:
${JSON.stringify(itemDetails)}

관세청 10자리 HSK 후보:
${JSON.stringify(candidateCodes)}

법적 확정이 아니라 검토용 후보를 고르는 요청입니다. 합리적으로 관련된 높음 또는 보통 후보를 표시하고, 부족한 정보는 후보를 숨기지 말고 별도로 반환하세요.
`.trim();

    const outputText = await callOpenAI(
      apiKey,
      systemPrompt,
      userMessage,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(outputText));
    } catch {
      throw new Error(
        "OpenAI의 HS CODE 추천 판단 응답이 올바른 JSON 형식이 아닙니다.",
      );
    }

    const decision = ensureApparelConfirmationInfo(
      normalizeHSCodeDecision(
        parsed,
        new Set(candidateCodes.map((candidate) => candidate.code)),
      ),
      itemName,
      itemDetails,
    );

    return jsonResponse({
      success: true,
      action: "suggest-hs-code",
      itemName,
      ...decision,
      source: "openai",
    });
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
      )?.trim();

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
                "지원하지 않는 action입니다.",
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
