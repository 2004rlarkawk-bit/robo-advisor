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

function createPerfectDefaults(now: Date): TradeProfile {
  const invoiceDate = toDateInputValue(now);
  return {
    tradeType: 'export',
    invoiceDate,
    issuePlace: 'Busan, Korea',
    issueDate: invoiceDate,
    itemName: "Women's Cashmere Coats",
    hsCode: '620211',
    countryOfOrigin: 'South Korea',
    quantity: 100,
    unit: 'EA',
    currency: 'USD',
    unitPrice: 250,
    totalAmount: 25000,
    invoiceAmount: 25000,
    packageCount: 10,
    packageType: 'Carton',
    netWeight: 450,
    grossWeight: 500,
    weight: 500,
    measurement: '4.2 CBM',
    shippingMarks: 'CASHMERE COAT / LOS ANGELES / C/T 1-10',
    loadPort: 'Busan Port',
    dischargePort: 'Los Angeles Port',
    departureDate: futureDate(7, now),
    arrivalDate: futureDate(21, now),
    vesselOrFlight: 'OCEAN STAR V.1001',
    carrier: 'Korea Shipping',
    placeOfReceipt: 'Busan, Korea',
    placeOfDelivery: 'Los Angeles, USA',
    finalDestination: 'Los Angeles, USA',
    voyageNo: '1001E',
    flag: 'Korea',
    containerNo: 'KRSU1234567',
    sealNo: 'SEAL1001',
    incoterms: 'FOB',
    paymentTerms: 'T/T in advance',
    reasonForExport: 'Sale of goods',
    freightTerms: 'Prepaid',
    freightCharges: 'Prepaid',
    freightPrepaidAt: 'Busan, Korea',
    freightPayableAt: 'Los Angeles, USA',
    companyName: 'Test Export Co., Ltd.',
    companyAddress: '1 Jungang-daero, Jung-gu, Busan, South Korea',
    companyCountry: 'South Korea',
    contact: '+82-10-2222-2222',
    contactName: 'Test Manager',
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
    signedBy: 'Test Manager',
    signerName: 'Test Manager',
    signerPosition: 'Export Manager',
    insuranceConfirmed: false,
    coIssuanceConfirmed: true,
  };
}

export function createPerfectTestProfile(currentProfile: TradeProfile, now = new Date()): TradeProfile {
  return fillMissingTestValues(
    createPerfectDefaults(now) as unknown as Record<string, unknown>,
    currentProfile as unknown as Record<string, unknown>,
  ) as unknown as TradeProfile;
}

export function createRevisionTestProfile(currentProfile: TradeProfile, now = new Date()): TradeProfile {
  const filled = createPerfectTestProfile(currentProfile, now);
  return {
    ...filled,
    itemName: hasValue(currentProfile.itemName) ? currentProfile.itemName : 'Test Cargo',
    companyName: hasValue(currentProfile.companyName) ? currentProfile.companyName : 'Test Company',
    quantity: hasValue(currentProfile.quantity) ? currentProfile.quantity : 10,
    hsCode: '',
    weight: '',
    grossWeight: '',
    departureDate: '',
    arrivalDate: '',
    coIssuanceConfirmed: false,
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
