import type {
  GeneratedDocuments,
  Incoterms,
  ShipperCurrency,
  ShipperItemUnit,
  TradeProfile,
  TradeRole,
} from '../types';
import type {
  ArrivalNoticeMeta,
  ImportDocumentMeta,
  ImportDocumentType,
  ImportTradeSnapshot,
} from '../types/importTrade';
import {
  TRADE_FORM_SCHEMA_VERSION,
  type ImportTradeWorkflowData,
  type TradeAttachment,
  type TradeAttachmentDocumentType,
  type TradeDocumentData,
  type TradeFormDataV3,
  type TradeFormItem,
  type TradeWorkflowData,
} from '../types/tradeFormData';
import { sanitizeTradeProfile } from '../utils/tradeProfile';

const EMPTY_PARTY = {
  name: '',
  address: '',
  country: '',
  contactName: '',
  contact: '',
  businessNumber: '',
  taxNumber: '',
};

function numericInput(value: unknown): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return '';
}

function supportedIncoterm(value: string): Incoterms {
  return ['', 'FOB', 'CFR', 'CIF', 'EXW', 'DDP', 'DAP', 'FCA'].includes(value)
    ? value as Incoterms
    : '';
}

function supportedItemUnit(value: string): ShipperItemUnit {
  const units: ShipperItemUnit[] = ['EA', 'PCS', 'SET', 'CTN', 'BOX', 'KG', 'TON', 'M', 'M2', 'M3', 'L'];
  return units.includes(value as ShipperItemUnit) ? value as ShipperItemUnit : 'EA';
}

function supportedCurrency(value: string): ShipperCurrency {
  const currencies: ShipperCurrency[] = ['USD', 'EUR', 'JPY', 'CNY', 'KRW', 'GBP'];
  return currencies.includes(value as ShipperCurrency) ? value as ShipperCurrency : 'USD';
}

function profileItems(profile: TradeProfile): TradeFormItem[] {
  if (profile.shipperItems?.length) {
    return profile.shipperItems.map((item) => ({
      id: item.id,
      description: item.itemName,
      koreanDescription: '',
      hsCode: item.hsCode,
      documentHSCode: '',
      modelName: '',
      specification: '',
      material: '',
      composition: '',
      intendedUse: '',
      originCountry: profile.countryOfOrigin ?? '',
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      currency: item.currency,
      netWeight: '',
      grossWeight: '',
      measurement: '',
      packageCount: '',
      packageUnit: '',
      shippingMarks: '',
      sourceDocumentIds: [],
    }));
  }

  return [{
    id: 'primary-item',
    description: profile.itemName,
    koreanDescription: '',
    hsCode: profile.hsCode,
    documentHSCode: '',
    modelName: '',
    specification: '',
    material: '',
    composition: '',
    intendedUse: '',
    originCountry: profile.countryOfOrigin ?? '',
    quantity: profile.quantity,
    unit: profile.unit ?? '',
    unitPrice: profile.unitPrice ?? '',
    currency: profile.currency ?? '',
    netWeight: profile.netWeight ?? '',
    grossWeight: profile.grossWeight ?? profile.weight,
    measurement: profile.measurement ?? '',
    packageCount: profile.packageCount ?? '',
    packageUnit: profile.packageType ?? '',
    shippingMarks: profile.shippingMarks ?? '',
    sourceDocumentIds: [],
  }];
}

export function tradeProfileToFormData(
  profileInput: TradeProfile,
  role: TradeRole,
  attachments: TradeAttachment[] = [],
): TradeFormDataV3 {
  const profile = sanitizeTradeProfile(profileInput);
  const supplemental = profile.shipperSupplemental;
  return {
    schemaVersion: TRADE_FORM_SCHEMA_VERSION,
    direction: profile.tradeType,
    role,
    parties: {
      company: {
        ...EMPTY_PARTY,
        name: profile.companyName,
        address: profile.companyAddress ?? '',
        country: profile.companyCountry ?? '',
        contactName: profile.contactName ?? '',
        contact: profile.contact,
        businessNumber: profile.businessRegistrationNo ?? '',
        taxNumber: profile.taxNo ?? '',
      },
      partner: {
        ...EMPTY_PARTY,
        name: profile.partnerName ?? '',
        address: profile.partnerAddress ?? '',
        country: profile.partnerCountry ?? '',
        contact: profile.partnerContact ?? '',
      },
      buyer: {
        ...EMPTY_PARTY,
        name: profile.buyerName ?? '',
        address: profile.buyerAddress ?? '',
        country: profile.buyerCountry ?? '',
      },
      notifyParty: {
        ...EMPTY_PARTY,
        name: profile.notifyPartyName ?? '',
        address: profile.notifyPartyAddress ?? '',
        contact: profile.notifyPartyContact ?? '',
      },
      signer: {
        name: profile.signerName ?? '',
        position: profile.signerPosition ?? '',
        signedBy: profile.signedBy ?? '',
      },
    },
    items: profileItems(profile),
    terms: {
      incoterms: profile.incoterms,
      incotermsPlace: supplemental?.incotermsPlace ?? '',
      paymentTerms: profile.paymentTerms ?? '',
      currency: profile.currency ?? '',
      invoiceAmount: profile.invoiceAmount ?? '',
      totalAmount: profile.totalAmount ?? '',
      reasonForExport: profile.reasonForExport ?? '',
      freightTerms: profile.freightTerms ?? '',
      freightCharges: profile.freightCharges ?? '',
      freightPrepaidAt: profile.freightPrepaidAt ?? '',
      freightPayableAt: profile.freightPayableAt ?? '',
      lcNo: profile.lcNo ?? '',
      lcDate: profile.lcDate ?? '',
      lcBank: profile.lcBank ?? '',
      insuranceConfirmed: profile.insuranceConfirmed ?? false,
      coIssuanceConfirmed: profile.coIssuanceConfirmed ?? false,
      originCriterion: supplemental?.originCriterion ?? '',
    },
    shipment: {
      loadPort: profile.loadPort,
      dischargePort: profile.dischargePort,
      placeOfReceipt: profile.placeOfReceipt ?? '',
      placeOfDelivery: profile.placeOfDelivery ?? '',
      finalDestination: profile.finalDestination ?? '',
      departureDate: profile.departureDate,
      arrivalDate: profile.arrivalDate,
      vesselOrFlight: profile.vesselOrFlight ?? '',
      carrier: profile.carrier ?? '',
      exportDeclarationNo: profile.exportDeclarationNo ?? '',
      bookingNo: profile.bookingNo ?? '',
      bookingStatus: profile.bookingStatus ?? '',
      loadingMode: profile.loadingMode ?? '',
      voyageNo: profile.voyageNo ?? '',
      flag: profile.flag ?? '',
      blNo: profile.blNo ?? '',
      containerNo: profile.containerNo ?? '',
      sealNo: profile.sealNo ?? '',
      documentNo: profile.documentNo ?? '',
      invoiceNo: profile.invoiceNo ?? '',
      invoiceDate: profile.invoiceDate ?? '',
      referenceNo: profile.referenceNo ?? '',
      otherReferences: profile.otherReferences ?? '',
      issuePlace: profile.issuePlace ?? '',
      issueDate: profile.issueDate ?? '',
    },
    packaging: {
      packageCount: profile.packageCount ?? '',
      packageType: profile.packageType ?? '',
      netWeight: profile.netWeight ?? '',
      grossWeight: profile.grossWeight ?? profile.weight,
      measurement: profile.measurement ?? '',
      shippingMarks: profile.shippingMarks ?? '',
      containerSize: profile.containerSize ?? '',
      containerQuantity: profile.containerQuantity ?? '',
    },
    attachments,
  };
}

export function tradeFormDataToProfile(formData: TradeFormDataV3): TradeProfile {
  const primary = formData.items[0];
  const company = formData.parties.company;
  const partner = formData.parties.partner;
  const buyer = formData.parties.buyer;
  const notifyParty = formData.parties.notifyParty;
  const terms = formData.terms;
  const shipment = formData.shipment;
  const packaging = formData.packaging;

  return sanitizeTradeProfile({
    tradeType: formData.direction,
    itemName: primary?.description ?? '',
    hsCode: primary?.hsCode ?? primary?.documentHSCode ?? '',
    loadPort: shipment.loadPort,
    dischargePort: shipment.dischargePort,
    incoterms: supportedIncoterm(terms.incoterms),
    quantity: numericInput(primary?.quantity),
    weight: numericInput(packaging.grossWeight || primary?.grossWeight),
    departureDate: shipment.departureDate,
    arrivalDate: shipment.arrivalDate,
    companyName: company.name,
    contact: company.contact,
    contactName: company.contactName,
    partnerName: partner.name,
    partnerAddress: partner.address,
    partnerCountry: partner.country,
    partnerContact: partner.contact,
    buyerName: buyer.name,
    buyerAddress: buyer.address,
    buyerCountry: buyer.country,
    notifyPartyName: notifyParty.name,
    notifyPartyAddress: notifyParty.address,
    notifyPartyContact: notifyParty.contact,
    companyAddress: company.address,
    companyCountry: company.country,
    businessRegistrationNo: company.businessNumber,
    taxNo: company.taxNumber,
    currency: terms.currency,
    invoiceAmount: numericInput(terms.invoiceAmount),
    unitPrice: numericInput(primary?.unitPrice),
    totalAmount: numericInput(terms.totalAmount),
    countryOfOrigin: primary?.originCountry ?? '',
    unit: primary?.unit ?? '',
    paymentTerms: terms.paymentTerms,
    reasonForExport: terms.reasonForExport,
    freightTerms: terms.freightTerms,
    freightCharges: terms.freightCharges,
    freightPrepaidAt: terms.freightPrepaidAt,
    freightPayableAt: terms.freightPayableAt,
    lcNo: terms.lcNo,
    lcDate: terms.lcDate,
    lcBank: terms.lcBank,
    insuranceConfirmed: terms.insuranceConfirmed,
    coIssuanceConfirmed: terms.coIssuanceConfirmed,
    placeOfReceipt: shipment.placeOfReceipt,
    placeOfDelivery: shipment.placeOfDelivery,
    finalDestination: shipment.finalDestination,
    vesselOrFlight: shipment.vesselOrFlight,
    carrier: shipment.carrier,
    exportDeclarationNo: shipment.exportDeclarationNo,
    bookingNo: shipment.bookingNo,
    bookingStatus: ['requested', 'confirmed', 'cancelled'].includes(shipment.bookingStatus)
      ? shipment.bookingStatus as 'requested' | 'confirmed' | 'cancelled'
      : 'requested',
    loadingMode: shipment.loadingMode === 'LCL' ? 'LCL' : 'FCL',
    containerSize: ['20GP', '40GP', '40HC', '45HC'].includes(packaging.containerSize)
      ? packaging.containerSize as '20GP' | '40GP' | '40HC' | '45HC'
      : '20GP',
    containerQuantity: numericInput(packaging.containerQuantity),
    voyageNo: shipment.voyageNo,
    flag: shipment.flag,
    blNo: shipment.blNo,
    containerNo: shipment.containerNo,
    sealNo: shipment.sealNo,
    documentNo: shipment.documentNo,
    invoiceNo: shipment.invoiceNo,
    invoiceDate: shipment.invoiceDate,
    referenceNo: shipment.referenceNo,
    otherReferences: shipment.otherReferences,
    issuePlace: shipment.issuePlace,
    issueDate: shipment.issueDate,
    packageCount: numericInput(packaging.packageCount),
    packageType: packaging.packageType,
    netWeight: numericInput(packaging.netWeight),
    grossWeight: numericInput(packaging.grossWeight),
    measurement: packaging.measurement,
    shippingMarks: packaging.shippingMarks,
    signedBy: formData.parties.signer.signedBy,
    signerName: formData.parties.signer.name,
    signerPosition: formData.parties.signer.position,
    shipperItems: formData.items.map((item) => ({
      id: item.id,
      itemName: item.description,
      hsCode: item.hsCode || item.documentHSCode,
      quantity: numericInput(item.quantity),
      unit: supportedItemUnit(item.unit),
      unitPrice: numericInput(item.unitPrice),
      currency: supportedCurrency(item.currency || terms.currency),
    })),
    shipperSupplemental: {
      buyerMatchesConsignee: false,
      consigneeMatchesNotifyParty: false,
      incotermsPlace: terms.incotermsPlace,
      originCriterion: ['세번변경기준', '부가가치기준', '완전생산기준'].includes(terms.originCriterion)
        ? terms.originCriterion as '세번변경기준' | '부가가치기준' | '완전생산기준'
        : '',
    },
  });
}

function attachmentDocumentType(type: ImportDocumentType): TradeAttachmentDocumentType {
  return type === 'unknown' ? 'other' : type;
}

export function hasValidStoragePath(value: { storagePath?: string } | null | undefined): boolean {
  return typeof value?.storagePath === 'string' && value.storagePath.trim().length > 0;
}

export function importDocumentToAttachment(document: ImportDocumentMeta): TradeAttachment | null {
  if (!hasValidStoragePath(document)) return null;
  return {
    id: document.id,
    documentType: attachmentDocumentType(document.type),
    fileName: document.name,
    storageBucket: document.storageBucket?.trim() || 'trade-documents',
    storagePath: document.storagePath!.trim(),
    mimeType: document.mimeType || 'application/octet-stream',
    sizeBytes: document.size,
    uploadedAt: document.uploadedAt || new Date().toISOString(),
  };
}

export function tradeAttachmentToImportDocument(
  attachment: TradeAttachment,
): ImportDocumentMeta | null {
  if (attachment.documentType === 'arrival_notice' || !hasValidStoragePath(attachment)) {
    return null;
  }
  const type: ImportDocumentType = attachment.documentType === 'other'
    ? 'other'
    : attachment.documentType;
  return {
    id: attachment.id,
    name: attachment.fileName,
    size: attachment.sizeBytes,
    mimeType: attachment.mimeType,
    type,
    status: 'ready',
    uploadStatus: 'uploaded',
    analysisStatus: 'pending',
    sourceId: attachment.id,
    storageBucket: attachment.storageBucket,
    storagePath: attachment.storagePath,
    uploadedAt: attachment.uploadedAt,
  };
}

export function arrivalNoticeToAttachment(arrivalNotice: ArrivalNoticeMeta | null | undefined): TradeAttachment | null {
  if (!arrivalNotice || !hasValidStoragePath(arrivalNotice)) return null;
  return {
    id: arrivalNotice.id,
    documentType: 'arrival_notice',
    fileName: arrivalNotice.fileName,
    storageBucket: arrivalNotice.storageBucket?.trim() || 'trade-documents',
    storagePath: arrivalNotice.storagePath!.trim(),
    mimeType: arrivalNotice.mimeType,
    sizeBytes: arrivalNotice.sizeBytes,
    uploadedAt: arrivalNotice.uploadedAt,
  };
}

export function findArrivalNotice(formData: TradeFormDataV3): ArrivalNoticeMeta | null {
  const attachment = formData.attachments.find((candidate) =>
    candidate.documentType === 'arrival_notice' && hasValidStoragePath(candidate));
  if (!attachment) return null;
  return {
    id: attachment.id,
    documentType: 'arrival_notice',
    fileName: attachment.fileName,
    storageBucket: attachment.storageBucket,
    storagePath: attachment.storagePath,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedAt: attachment.uploadedAt,
  };
}

export function importSnapshotToPersistence(snapshot: ImportTradeSnapshot): {
  formData: TradeFormDataV3;
  workflowData: TradeWorkflowData;
  documents: ImportDocumentMeta[];
} {
  const extracted = snapshot.analysis.extracted;
  const profile: TradeProfile = {
    tradeType: 'import',
    itemName: extracted.productDescription,
    hsCode: extracted.items[0]?.confirmedHSCode ?? snapshot.selectedHSCode?.code ?? '',
    loadPort: extracted.loadPort,
    dischargePort: extracted.dischargePort,
    incoterms: supportedIncoterm(extracted.incoterms.trim().toUpperCase().split(/[\s-]/)[0]),
    quantity: numericInput(extracted.quantity),
    weight: numericInput(extracted.grossWeight),
    departureDate: extracted.shipmentDate,
    arrivalDate: extracted.estimatedArrivalDate,
    companyName: extracted.importer,
    contact: '',
    partnerName: extracted.exporterDetails.name || extracted.shipper,
    currency: extracted.currency,
    invoiceAmount: numericInput(extracted.totalAmount),
    invoiceNo: extracted.invoiceNo,
    blNo: extracted.blNo,
    countryOfOrigin: extracted.originCountry,
    netWeight: numericInput(extracted.netWeight),
    grossWeight: numericInput(extracted.grossWeight),
    containerNo: extracted.containerNo,
    sealNo: extracted.sealNo,
    vesselOrFlight: extracted.vesselName,
    voyageNo: extracted.voyageNo,
    notifyPartyName: extracted.notifyParty,
  };
  const attachments = snapshot.documents
    .map(importDocumentToAttachment)
    .filter((attachment): attachment is TradeAttachment => attachment !== null);
  const arrivalNotice = arrivalNoticeToAttachment(snapshot.arrivalNotice);
  if (arrivalNotice) attachments.push(arrivalNotice);

  const formData = tradeProfileToFormData(profile, snapshot.role, attachments);
  formData.parties.partner = {
    ...formData.parties.partner,
    name: extracted.exporterDetails.name || extracted.shipper,
    address: extracted.exporterDetails.address,
    country: extracted.exporterDetails.country,
    contactName: extracted.exporterDetails.contactName,
    contact: extracted.exporterDetails.phone || extracted.exporterDetails.email,
  };
  formData.parties.company = {
    ...formData.parties.company,
    name: extracted.importerDetails.name || extracted.importer,
    address: extracted.importerDetails.address,
    country: extracted.importerDetails.country,
    contactName: extracted.importerDetails.contactName,
    contact: extracted.importerDetails.phone || extracted.importerDetails.email,
  };
  formData.parties.notifyParty = {
    ...formData.parties.notifyParty,
    name: extracted.notifyPartyDetails.name || extracted.notifyParty,
    address: extracted.notifyPartyDetails.address,
    country: extracted.notifyPartyDetails.country,
    contactName: extracted.notifyPartyDetails.contactName,
    contact: extracted.notifyPartyDetails.phone || extracted.notifyPartyDetails.email,
  };
  formData.items = extracted.items.map((item) => ({
    id: item.id,
    description: item.description,
    koreanDescription: item.koreanDescription,
    hsCode: item.confirmedHSCode,
    documentHSCode: item.documentHSCode,
    modelName: item.modelName,
    specification: item.specification,
    material: item.material,
    composition: item.composition,
    intendedUse: item.intendedUse,
    originCountry: item.originCountry,
    quantity: item.quantity,
    unit: item.quantityUnit,
    unitPrice: item.unitPrice,
    currency: item.currency,
    netWeight: '',
    grossWeight: '',
    measurement: '',
    packageCount: '',
    packageUnit: '',
    shippingMarks: '',
    sourceDocumentIds: item.sourceDocumentIds,
  }));
  formData.terms = {
    ...formData.terms,
    incoterms: extracted.incoterms,
    paymentTerms: extracted.paymentTerms,
    currency: extracted.currency,
    invoiceAmount: extracted.totalAmount,
  };
  formData.shipment = {
    ...formData.shipment,
    loadPort: extracted.loadPort,
    dischargePort: extracted.dischargePort,
    departureDate: extracted.shipmentDate,
    arrivalDate: extracted.estimatedArrivalDate,
    vesselOrFlight: extracted.vesselName,
    voyageNo: extracted.voyageNo,
    blNo: extracted.blNo,
    containerNo: extracted.containerNo,
    sealNo: extracted.sealNo,
    invoiceNo: extracted.invoiceNo,
    invoiceDate: extracted.invoiceDate,
  };
  formData.packaging = {
    ...formData.packaging,
    packageCount: extracted.totalPackageCount,
    packageType: extracted.packageUnit,
    netWeight: extracted.netWeight,
    grossWeight: extracted.grossWeight,
    containerSize: '',
    containerQuantity: '',
  };

  const workflow: ImportTradeWorkflowData = {
    ...(snapshot.tradeId ? { tradeId: snapshot.tradeId } : {}),
    analysis: snapshot.analysis,
    selectedHSCode: snapshot.selectedHSCode,
    duty: snapshot.duty,
    risks: snapshot.risks,
    cargo: snapshot.cargo,
    generatedAt: snapshot.generatedAt,
    flowCompletedAt: snapshot.flowCompletedAt,
  };
  return {
    formData,
    workflowData: { importTrade: workflow },
    documents: snapshot.documents,
  };
}

export function reconstructImportSnapshot(
  formData: TradeFormDataV3,
  workflowData: TradeWorkflowData,
  documents: ImportDocumentMeta[],
  tradeId: string,
): ImportTradeSnapshot | undefined {
  const workflow = workflowData.importTrade;
  if (!workflow || formData.direction !== 'import') return undefined;
  const arrivalNotice = findArrivalNotice(formData) ?? undefined;
  return {
    tradeId,
    direction: 'import',
    role: formData.role,
    documents,
    arrivalNotice,
    analysis: workflow.analysis,
    selectedHSCode: workflow.selectedHSCode,
    duty: workflow.duty,
    risks: workflow.risks,
    cargo: workflow.cargo,
    generatedAt: workflow.generatedAt,
    flowCompletedAt: workflow.flowCompletedAt,
  };
}

export function generatedDocumentsToData(generatedDocuments?: GeneratedDocuments): TradeDocumentData | null {
  return generatedDocuments ? { generatedDocuments } : null;
}
