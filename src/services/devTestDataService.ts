import type { GeneratedDocuments, TradeProfile } from '../types';

export type DevTestMode = 'perfect' | 'needs_revision';

export interface DevTestSubmissionMeta {
  isTestSubmission: true;
  submissionMode: DevTestMode;
  submittedWithValidationErrors: boolean;
  submittedAt: string;
}

function hasValue(value: unknown): boolean {
  return value !== undefined
    && value !== null
    && !(typeof value === 'string' && value.trim() === '');
}

export function fillMissingTestValues<T extends Record<string, unknown>>(defaults: T, values: Partial<T>): T {
  const result = { ...defaults };
  for (const [key, value] of Object.entries(values)) {
    if (hasValue(value)) result[key as keyof T] = value as T[keyof T];
  }
  return result;
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function futureDate(days: number, now: Date): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

/**
 * 완벽 테스트 기본값 — 시연 시나리오(목제 사무용 책상 10박스, 부산→LA, FOB·L/C)를
 * 오류 없이 끝까지 채운 상태. 시연 연습(createDemoRehearsalProfile)과 같은 거래처·항로를 쓴다.
 */
function createPerfectDefaults(now: Date): TradeProfile {
  const invoiceDate = toDateInputValue(now);
  return {
    tradeType: 'export',
    invoiceDate,
    issuePlace: 'Busan, Korea',
    issueDate: invoiceDate,
    itemName: 'Wooden Office Desk',
    shipperItems: [{
      id: 'primary-item',
      itemName: 'Wooden Office Desk',
      detail: 'Natural Oak, W1200 x D600 x H750 mm',
      brand: 'OAKLINE',
      composition: 'Oak wood 100%',
      hsCode: '9403301000',
      quantity: 10,
      unit: 'EA',
      unitPrice: 120,
      currency: 'USD',
    }],
    hsCode: '9403301000',
    countryOfOrigin: 'South Korea',
    quantity: 10,
    unit: 'EA',
    currency: 'USD',
    unitPrice: 120,
    totalAmount: 1200,
    invoiceAmount: 1200,
    // 40×30×25cm 10박스 = 0.300 CBM, 박스당 1개 → 포장명세서 10개 = 상업송장 10개
    packageCount: 10,
    packageType: 'Carton',
    eaPerBox: 1,
    packageDimensionUnit: 'cm',
    packageDimensions: [{ id: 'dim-1', width: 40, length: 30, height: 25, boxes: 10 }],
    measurement: '0.300',
    netWeight: 100,
    grossWeight: 120,
    weight: 120,
    shippingMarks: 'TIC\nLOS ANGELES\nC/NO. 1-10\nMADE IN KOREA',
    loadPort: 'Busan Port',
    dischargePort: 'Los Angeles Port',
    departureDate: futureDate(7, now),
    arrivalDate: futureDate(21, now),
    // 소량 화물이라 LCL — FCL이면 확인 권장(R23)이 뜬다.
    loadingMode: 'LCL',
    vesselOrFlight: 'OCEAN STAR V.1001',
    carrier: 'Korea Shipping',
    placeOfReceipt: 'Busan, Korea',
    placeOfDelivery: 'Los Angeles, CA, USA',
    finalDestination: 'Los Angeles, USA',
    voyageNo: '1001E',
    flag: 'Korea',
    incoterms: 'FOB',
    // 신용장은 출항 전에 개설돼 있어야 한다(R14).
    paymentTerms: 'L/C',
    lcNo: 'M0461261NU00012',
    lcDate: invoiceDate,
    otherReferences: 'PO No. PO-2026-1003',
    reasonForExport: 'Sale of goods',
    freightTerms: 'COLLECT',
    companyName: 'PortAI Trading Co., Ltd.',
    companyAddress: '123 Teheran-ro, Gangnam-gu, Seoul, Korea',
    companyCountry: 'South Korea',
    contact: '+82-2-1234-5678',
    contactName: 'Gildong Hong',
    taxNo: '124-81-00998',
    businessRegistrationNo: '124-81-00998',
    partnerName: 'Test Import Company',
    partnerAddress: '100 Test Street, Los Angeles, CA',
    partnerCountry: 'United States',
    partnerContact: '+1-213-555-0100',
    buyerName: 'Test Import Company',
    buyerAddress: '100 Test Street, Los Angeles, CA',
    buyerCountry: 'United States',
    notifyPartyName: 'Test Import Company',
    notifyPartyAddress: '100 Test Street, Los Angeles, CA',
    notifyPartyContact: '+1-213-555-0100',
    signedBy: 'Gildong Hong',
    signerName: 'Gildong Hong',
    signerPosition: 'Export Manager',
    insuranceConfirmed: false,
    coNeeded: 'yes' as const,
    exportDeclaration: {
      ownerCeoName: '홍길동',
      customsCode: 'PORTA2026001',
      postalCode: '44776',
      buyerCustomsCode: 'USTICO0001',
      tradeKind: 'GENERAL',
      goodsCondition: 'N',
      lcPaymentType: 'SIGHT',
      exporterType: 'A',
      industrialComplexCode: '999',
    },
    shipperSupplemental: {
      buyerMatchesConsignee: true,
      consigneeMatchesNotifyParty: true,
      incotermsPlace: 'Busan Port',
      originCriterion: '세번변경기준',
      isSignerSameAsCompany: false,
      hasNoShippingMarks: false,
      shippingMarksBeforeNoMarks: '',
    },
  };
}

export function createPerfectTestProfile(currentProfile: TradeProfile, now = new Date()): TradeProfile {
  return fillMissingTestValues(
    createPerfectDefaults(now) as unknown as Record<string, unknown>,
    currentProfile as unknown as Record<string, unknown>,
  ) as unknown as TradeProfile;
}

/**
 * 시연 연습용 — 품목(3)·포장(5) 섹션만 비워 두고 나머지 섹션을 고정값으로 채운다.
 * 품목·포장 입력값은 현재 화면 값을 그대로 둔다(발표 때 직접 입력하는 부분).
 *
 * 생성하면 일부러 아래 항목이 걸리게 맞춰 두었다.
 * - 반드시 수정: 원산지 Japan(R15), 신용장 개설일이 출항일보다 늦음(R14)
 * - 확인 권장: 운송방식 FCL인 소량 화물(R23)
 * 패킹리스트·상업송장 수량 불일치(R10)는 품목·포장 입력으로 만든다.
 */
export function createDemoRehearsalProfile(currentProfile: TradeProfile, now = new Date()): TradeProfile {
  const departureDate = futureDate(7, now);
  return {
    ...currentProfile,
    tradeType: 'export',
    // 통화만은 USD로 고정 — 관세청 환율 환산을 시연에서 보여주기 위해. 품목의 나머지 값은 그대로 둔다.
    currency: 'USD',
    ...(currentProfile.shipperItems
      ? { shipperItems: currentProfile.shipperItems.map((item) => ({ ...item, currency: 'USD' as const })) }
      : {}),
    // 1. 화주 기본정보
    companyName: 'PortAI Trading Co., Ltd.',
    companyAddress: '123 Teheran-ro, Gangnam-gu, Seoul, Korea',
    companyCountry: 'South Korea',
    contact: '+82-2-1234-5678',
    businessRegistrationNo: '124-81-00998',
    taxNo: '124-81-00998',
    // 2. 거래처 정보
    buyerName: 'Test Import Company',
    buyerAddress: '100 Test Street, Los Angeles, CA',
    buyerCountry: 'United States',
    partnerName: 'Test Import Company',
    partnerAddress: '100 Test Street, Los Angeles, CA',
    partnerCountry: 'United States',
    partnerContact: '+1-213-555-0100',
    notifyPartyName: 'Test Import Company',
    notifyPartyAddress: '100 Test Street, Los Angeles, CA',
    notifyPartyContact: '+1-213-555-0100',
    // 4. 거래 조건 — 신용장 개설일을 출항일 뒤로 둬 R14가 걸리게 한다.
    incoterms: 'FOB',
    paymentTerms: 'L/C',
    lcNo: 'M0461261NU00012',
    lcDate: futureDate(28, now),
    otherReferences: 'PO No. PO-2026-1003',
    // 6. 항만 및 일정
    loadPort: 'Busan Port',
    dischargePort: 'Los Angeles Port',
    departureDate,
    arrivalDate: futureDate(19, now),
    loadingMode: 'FCL',
    placeOfReceipt: 'Busan, Korea',
    placeOfDelivery: 'Los Angeles, CA, USA',
    freightTerms: 'COLLECT',
    // 7. 원산지 — 일부러 Japan
    countryOfOrigin: 'Japan',
    exportDeclaration: {
      ...currentProfile.exportDeclaration,
      ownerCeoName: '홍길동',
      customsCode: 'PORTA2026001',
      postalCode: '44776',
      buyerCustomsCode: 'USTICO0001',
      tradeKind: 'GENERAL',
      lcPaymentType: 'SIGHT',
      freightKrw: 1200000,
      insuranceKrw: 1200000,
      exporterType: 'A',
      industrialComplexCode: '999',
    },
    shipperSupplemental: {
      ...currentProfile.shipperSupplemental,
      buyerMatchesConsignee: true,
      consigneeMatchesNotifyParty: true,
      incotermsPlace: 'Busan Port',
    } as TradeProfile['shipperSupplemental'],
  };
}

export function createTestSubmissionMeta(mode: DevTestMode, validationErrorCount: number, now = new Date()): DevTestSubmissionMeta {
  return {
    isTestSubmission: true,
    submissionMode: mode,
    submittedWithValidationErrors: validationErrorCount > 0,
    submittedAt: now.toISOString(),
  };
}

const DOCUMENT_IDENTIFIER_FIELDS = ['documentNo', 'invoiceNo', 'referenceNo', 'blNo'] as const;
const DEV_IDENTIFIER_PATTERN = /^(DEV|TEST)[-_]/i;

export function removeDevOnlyFields(profile: TradeProfile): TradeProfile {
  const { _testMeta: _ignored, ...withoutMeta } = profile as TradeProfile & { _testMeta?: unknown };
  const cleaned = { ...withoutMeta } as TradeProfile;
  for (const field of DOCUMENT_IDENTIFIER_FIELDS) {
    const value = cleaned[field];
    if (typeof value === 'string' && DEV_IDENTIFIER_PATTERN.test(value.trim())) cleaned[field] = '';
  }
  return cleaned;
}

export function createNormalDocumentIdentifiers(profile: TradeProfile, now = new Date()): TradeProfile {
  const cleaned = removeDevOnlyFields(profile);
  const date = toDateInputValue(now).replace(/-/g, '');
  const year = String(now.getFullYear());
  const sequence = String(now.getTime()).slice(-6).padStart(6, '0');
  return {
    ...cleaned,
    documentNo: cleaned.documentNo?.trim() || `DOC-${date}-${sequence}`,
    invoiceNo: cleaned.invoiceNo?.trim() || `INV-${year}-${sequence}`,
    referenceNo: cleaned.referenceNo?.trim() || `REF-${date}-${sequence}`,
    blNo: cleaned.blNo?.trim() || `BL-${year}-${sequence}`,
  };
}

export function getTestSubmissionMeta(generatedDocs?: GeneratedDocuments): DevTestSubmissionMeta | null {
  const candidate = generatedDocs?._testMeta as Partial<DevTestSubmissionMeta> | undefined;
  if (!candidate || candidate.isTestSubmission !== true) return null;
  if (candidate.submissionMode !== 'perfect' && candidate.submissionMode !== 'needs_revision') return null;
  if (typeof candidate.submittedWithValidationErrors !== 'boolean' || typeof candidate.submittedAt !== 'string') return null;
  return candidate as DevTestSubmissionMeta;
}

export function createProfileForNewTrade(source: TradeProfile): TradeProfile {
  return removeDevOnlyFields(source);
}
