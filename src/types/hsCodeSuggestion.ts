export interface HSCodeCandidateContext {
  code: string;
  koreanName: string;
  englishName: string;
  classificationName?: string;
}

export interface HSCodeItemDetails {
  material?: string;
  composition?: string;
  fabricConstruction?: string;
  intendedUse?: string;
  productForm?: string;
  processingState?: string;
  ageGroup?: string;
  gender?: string;
  koreanDescription?: string;
  modelName?: string;
  specification?: string;
  originCountry?: string;
  documentHSCode?: string;
}

/** 후보가 여러 소호로 갈릴 때 사용자에게 되묻기 위한 선택지 */
export interface HSCodeDisambiguationOption {
  /** 6자리 소호 (예: "960810") */
  subheading: string;
  /** 화면 표기용 (예: "9608.10") */
  formattedSubheading: string;
  /** 관세청 공식 국문 품명 */
  label: string;
  /** 관세청 공식 영문 품명 */
  englishLabel: string;
  /** 이 소호에 속한 10자리 후보 수 */
  candidateCount: number;
}

export interface HSCodeDisambiguation {
  question: string;
  note: string;
  options: HSCodeDisambiguationOption[];
}

export interface VerifiedHSCodeSuggestion {
  code: string;
  formattedCode: string;
  koreanName: string;
  englishName: string;
  classificationName: string;
  reasoning: string;
  confidenceLabel: '높음' | '보통';
  distinguishingFactors?: string[];
  missingInformation?: string[];
  source: 'openai-verified';
}

export interface HSCodeSuggestionResponse {
  suggestions: VerifiedHSCodeSuggestion[];
  additionalInformationRequired: boolean;
  requiredAdditionalInfo: string[];
  /** 값이 있으면 추천 대신 선택지를 먼저 보여준다. */
  disambiguation?: HSCodeDisambiguation | null;
}

export interface ItemHSCodeSuggestionState {
  loading: boolean;
  suggestions: VerifiedHSCodeSuggestion[];
  error: string | null;
  lastRequestedItemName: string;
  requestId: number;
  userEditedHSCode: boolean;
  appliedSuggestionCode: string | null;
  additionalInformationRequired: boolean;
  requiredAdditionalInfo: string[];
  /** 후보가 갈릴 때 표시할 질문. 사용자가 고르면 null로 돌아간다. */
  disambiguation: HSCodeDisambiguation | null;
  /** 사용자가 고른 소호(6자리). 이후 추천은 이 범위로 좁힌다. */
  chosenSubheading: string | null;
}
