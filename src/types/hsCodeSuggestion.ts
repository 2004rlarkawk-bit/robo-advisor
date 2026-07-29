export interface HSCodeCandidateContext {
  code: string;
  koreanName: string;
  englishName: string;
  classificationName?: string;
}

export interface HSCodeItemDetails {
  material?: string;
  fabricConstruction?: string;
  intendedUse?: string;
  productForm?: string;
  processingState?: string;
  ageGroup?: string;
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
}
