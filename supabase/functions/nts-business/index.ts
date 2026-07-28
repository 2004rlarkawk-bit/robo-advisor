const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NTS_STATUS_URL =
  "https://api.odcloud.kr/api/nts-businessman/v1/status";

const NTS_VALIDATE_URL =
  "https://api.odcloud.kr/api/nts-businessman/v1/validate";

type BusinessAction = "status" | "validate";

interface BusinessRequest {
  action?: BusinessAction;
  bizNo?: string;
  startDate?: string;
  representativeName?: string;
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

function cleanBizNo(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^0-9]/g, "")
    : "";
}

async function requestBusinessStatus(
  apiKey: string,
  bizNo: string,
): Promise<Response> {
  const url = new URL(NTS_STATUS_URL);
  url.searchParams.set("serviceKey", apiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      b_no: [bizNo],
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `국세청 사업자 상태조회 API 오류(${response.status}): ${
        responseText.slice(0, 300)
      }`,
    );
  }

  let data: {
    data?: Array<{
      b_no?: string;
      b_stt?: string;
      b_stt_cd?: string;
      tax_type?: string;
      tax_type_cd?: string;
      end_dt?: string;
      utcc_yn?: string;
      tax_type_change_dt?: string;
      invoice_apply_dt?: string;
      rbf_tax_type?: string;
      rbf_tax_type_cd?: string;
    }>;
  };

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      "국세청 상태조회 응답을 JSON으로 해석할 수 없습니다.",
    );
  }

  const item = data.data?.[0];

  if (!item) {
    return jsonResponse({
      success: true,
      action: "status",
      found: false,
      bizNo,
      data: null,
    });
  }

  const statusText =
    item.b_stt?.trim() ||
    "국세청에 등록되지 않은 사업자등록번호입니다.";

  return jsonResponse({
    success: true,
    action: "status",
    found: Boolean(item.b_stt),
    bizNo,
    data: {
      bizNo: item.b_no || bizNo,
      valid: item.b_stt === "계속사업자",
      statusText,
      statusCode: item.b_stt_cd || "",
      taxType: item.tax_type || "",
      taxTypeCode: item.tax_type_cd || "",
      closureDate: item.end_dt || "",
      source: "api",
    },
  });
}

async function requestBusinessValidation(
  apiKey: string,
  bizNo: string,
  startDate: string,
  representativeName: string,
): Promise<Response> {
  const url = new URL(NTS_VALIDATE_URL);
  url.searchParams.set("serviceKey", apiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      businesses: [
        {
          b_no: bizNo,
          start_dt: startDate,
          p_nm: representativeName,
        },
      ],
    }),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `국세청 사업자 진위확인 API 오류(${response.status}): ${
        responseText.slice(0, 300)
      }`,
    );
  }

  let data: {
    data?: Array<{
      b_no?: string;
      valid?: string;
      valid_msg?: string;
      request_param?: {
        b_no?: string;
        start_dt?: string;
        p_nm?: string;
      };
      status?: {
        b_no?: string;
        b_stt?: string;
        b_stt_cd?: string;
        tax_type?: string;
        tax_type_cd?: string;
        end_dt?: string;
      };
    }>;
  };

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      "국세청 진위확인 응답을 JSON으로 해석할 수 없습니다.",
    );
  }

  const item = data.data?.[0];

  if (!item) {
    return jsonResponse({
      success: true,
      action: "validate",
      found: false,
      bizNo,
      data: null,
    });
  }

  const matched = item.valid === "01";

  return jsonResponse({
    success: true,
    action: "validate",
    found: true,
    bizNo,
    data: {
      bizNo: item.b_no || bizNo,
      valid: matched,
      message: matched
        ? "국세청 등록정보와 일치합니다."
        : `등록정보가 일치하지 않습니다: ${
            item.valid_msg || "사업자번호, 개업일, 대표자명을 확인하세요."
          }`,
      status: item.status
        ? {
            valid:
              item.status.b_stt === "계속사업자",
            statusText:
              item.status.b_stt || "",
            statusCode:
              item.status.b_stt_cd || "",
            taxType:
              item.status.tax_type || "",
            taxTypeCode:
              item.status.tax_type_cd || "",
            closureDate:
              item.status.end_dt || "",
          }
        : null,
      source: "api",
    },
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
        "NTS_BUSINESS_KEY",
      );

      if (!apiKey) {
        throw new Error(
          "NTS_BUSINESS_KEY가 Supabase Secrets에 설정되지 않았습니다.",
        );
      }

      const body = await req
        .json()
        .catch(() => ({} as BusinessRequest));

      const action: BusinessAction =
        body.action === "validate"
          ? "validate"
          : "status";

      const bizNo = cleanBizNo(body.bizNo);

      if (bizNo.length !== 10) {
        return jsonResponse(
          {
            success: false,
            error:
              "사업자등록번호는 숫자 10자리여야 합니다.",
          },
          400,
        );
      }

      if (action === "status") {
        return await requestBusinessStatus(
          apiKey,
          bizNo,
        );
      }

      const startDate =
        typeof body.startDate === "string"
          ? body.startDate.replace(/[^0-9]/g, "")
          : "";

      const representativeName =
        typeof body.representativeName === "string"
          ? body.representativeName.trim()
          : "";

      if (!/^\d{8}$/.test(startDate)) {
        return jsonResponse(
          {
            success: false,
            error:
              "개업일자는 yyyyMMdd 형식의 숫자 8자리여야 합니다.",
          },
          400,
        );
      }

      if (!representativeName) {
        return jsonResponse(
          {
            success: false,
            error:
              "대표자명을 입력해야 합니다.",
          },
          400,
        );
      }

      return await requestBusinessValidation(
        apiKey,
        bizNo,
        startDate,
        representativeName,
      );
    } catch (error) {
      console.error("[nts-business]", error);

      return jsonResponse(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "사업자 정보 조회 중 오류가 발생했습니다.",
        },
        500,
      );
    }
  },
};