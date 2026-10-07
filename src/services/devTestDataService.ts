import type { GeneratedDocuments, TradeProfile } from '../types';
import { createPackageDimension } from '../utils/packageCbm';
import { tradeProfileToPrimaryShipperItem } from '../utils/shipperForm';

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

// 시연 품목 수량 — 포장(8박스 × 20개 = 160개)과 맞춰 수량 불일치(R10)는 걸리지 않게 한다(시연 시간 단축).
const DEMO_ITEM_QUANTITY = 160;
const DEMO_ITEM_UNIT_PRICE = 120;

/**
 * 시연 연습용 — 발표 때 직접 입력할 품명·HS·화물 규격과 거래처(자주 거래한 거래처 불러오기)만 남기고 나머지를 고정값으로 채운다.
 * 품목은 수량·단가·통화·상표명·성분을, 포장은 박스 수·박스당 수량·포장 종류·중량을 채운다.
 *
 * 생성하면 일부러 아래 항목이 걸리게 맞춰 두었다.
 * - 반드시 수정: 신용장 개설일이 출항일보다 늦음(R14)
 * - 확인 권장: 도착 예정일 연도 오타(R21 — 운송 기간 반년 초과)
 * 상업송장 수량(160)은 포장(8박스 × 20개)과 같고, 중량은 총중량 ≥ 순중량으로 맞춰 오류가 나지 않게 한다.
 */
export function createDemoRehearsalProfile(currentProfile: TradeProfile, now = new Date()): TradeProfile {
  const departureDate = futureDate(7, now);
  return {
    ...currentProfile,
    tradeType: 'export',
    // 품목: 품명·HS는 발표 때 직접 입력하고, 수량·단가·통화(USD)·상표명·성분을 채운다.
    // 통화를 USD로 고정하는 건 관세청 환율 환산을 시연에서 보여주기 위해서다.
    currency: 'USD',
    unit: 'EA',
    quantity: DEMO_ITEM_QUANTITY,
    unitPrice: DEMO_ITEM_UNIT_PRICE,
    totalAmount: DEMO_ITEM_QUANTITY * DEMO_ITEM_UNIT_PRICE,
    invoiceAmount: DEMO_ITEM_QUANTITY * DEMO_ITEM_UNIT_PRICE,
    shipperItems: (currentProfile.shipperItems?.length
      ? currentProfile.shipperItems
      : [tradeProfileToPrimaryShipperItem(currentProfile)]
    ).map((item, index) => ({
      ...item,
      ...(index === 0 ? { quantity: DEMO_ITEM_QUANTITY, unit: 'EA' as const, unitPrice: DEMO_ITEM_UNIT_PRICE } : {}),
      currency: 'USD' as const,
      brand: 'NO BRAND',
      composition: 'Wood (Oak) 100%',
    })),
    // 5. 포장: 박스 8개 × 박스당 20개 = 포장명세서 160개. 규격(가로·세로·높이)은 발표 때 입력해 CBM을 보여 준다.
    // 사무용 책상은 분해(flat-pack)해 카톤에 담아 보내는 게 일반적이라 CARTON으로 둔다.
    packageType: 'CARTON',
    eaPerBox: 20,
    packageCount: 8,
    // 중량은 미리 채운다 — 비어 있으면 '중량 입력' 확인 권장과 패킹리스트 '검토 필요'가 함께 뜬다.
    // 카톤 8개 × 130kg(포장재 10kg 포함) = G.W. 1,040kg, N.W. 960kg.
    grossWeight: 1040,
    netWeight: 960,
    weight: 1040,
    // 화물 크기(가로·세로·높이·박스 수)는 발표 때 직접 입력해 CBM 계산을 보여 주므로 빈 줄 하나로 비운다.
    // 비워 두면 포장 수량은 위 packageCount(8)로 보이고, 박스 수를 입력하면 그 합계로 다시 계산된다.
    packageDimensions: [createPackageDimension('package-dimension-1')],
    measurement: '',
    // 화인 — 바이어 약호(Test Import Company)·도착지·카톤 번호(8박스)·원산지.
    shippingMarks: 'TIC\nLOS ANGELES\nC/NO. 1-8\nMADE IN KOREA',
    // 1. 화주 기본정보
    companyName: 'PortAI Trading Co., Ltd.',
    companyAddress: '123 Teheran-ro, Gangnam-gu, Seoul, Korea',
    companyCountry: 'South Korea',
    contact: '+82-2-1234-5678',
    businessRegistrationNo: '124-81-00998',
    taxNo: '124-81-00998',
    // 2. 거래처 정보는 채우지 않는다 — 발표 때 '자주 거래한 거래처'를 눌러 불러오는 걸 보여 준다.
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
    // 도착 예정일 연도 오타(1년 뒤) — 운송 기간이 반년을 넘어 확인 권장(R21)이 걸린다.
    arrivalDate: futureDate(19 + 365, now),
    // 소량 화물이라 LCL — 컨테이너 정보 확인 권장이 끼어들지 않게 한다.
    loadingMode: 'LCL',
    placeOfReceipt: 'Busan, Korea',
    placeOfDelivery: 'Los Angeles, CA, USA',
    freightTerms: 'COLLECT',
    // 7. 원산지
    countryOfOrigin: 'South Korea',
    exportDeclaration: {
      ...currentProfile.exportDeclaration,
      ownerCeoName: '홍길동',
      customsCode: 'PORTA2026001',
      postalCode: '44776',
      tradeKind: 'GENERAL',
      goodsCondition: 'N',
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
      hasNoShippingMarks: false,
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
