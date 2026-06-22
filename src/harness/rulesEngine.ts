import { TradeProfile, DocumentStatus } from '../types';

export function determineRequiredDocuments(profile: TradeProfile): DocumentStatus[] {
  const docs: DocumentStatus[] = [];

  // 1. 상업송장 (Commercial Invoice) - 항상 필수
  const hasInvoiceInfo = !!(profile.itemName && profile.companyName && profile.incoterms);
  docs.push({
    id: 'invoice',
    name: '상업송장(Invoice)',
    status: hasInvoiceInfo ? 'completed' : 'not_started',
    statusText: hasInvoiceInfo ? '생성 완료' : '작성 필요',
    lastReviewed: hasInvoiceInfo ? new Date().toISOString().split('T')[0] + ' 14:32' : undefined
  });

  // 2. 패킹리스트 (Packing List) - 항상 필수
  const hasPackingInfo = profile.quantity !== '' && profile.quantity > 0;
  const hasWeightInfo = profile.weight !== '' && profile.weight > 0;
  
  let packingStatus: DocumentStatus['status'] = 'not_started';
  let packingStatusText = '작성 필요';
  
  if (hasPackingInfo && hasWeightInfo) {
    packingStatus = 'completed';
    packingStatusText = '생성 완료';
  } else if (hasPackingInfo && !hasWeightInfo) {
    packingStatus = 'review_required';
    packingStatusText = '검토 필요';
  }
  
  docs.push({
    id: 'packing_list',
    name: '패킹리스트(Packing List)',
    status: packingStatus,
    statusText: packingStatusText,
    lastReviewed: hasPackingInfo ? new Date().toISOString().split('T')[0] + ' 13:48' : undefined
  });

  // 3. 선하증권 (B/L) - 해상 물류의 경우 항상 필수
  const hasBLInfo = !!(profile.loadPort && profile.dischargePort);
  docs.push({
    id: 'bl',
    name: '선하증권(B/L)',
    status: hasBLInfo ? 'completed' : 'not_started',
    statusText: hasBLInfo ? '생성 완료' : '작성 필요',
    lastReviewed: hasBLInfo ? new Date().toISOString().split('T')[0] + ' 14:05' : undefined
  });

  // 4. 통관신고서 관련 서류 - 최종 신고용 항상 필수
  const hasHSCode = !!profile.hsCode;
  const isHSCodeNumeric = /^\d+$/.test(profile.hsCode.replace(/-/g, ''));
  const isHSCodeValid = hasHSCode && isHSCodeNumeric && profile.hsCode.replace(/-/g, '').length >= 6;
  
  let customsStatus: DocumentStatus['status'] = 'not_started';
  let customsStatusText = '작성 필요';

  if (hasHSCode) {
    if (isHSCodeValid) {
      customsStatus = 'completed';
      customsStatusText = '생성 완료';
    } else {
      customsStatus = 'review_required';
      customsStatusText = '검토 필요';
    }
  }

  docs.push({
    id: 'customs_dec',
    name: '통관신고 관련 서류',
    status: customsStatus,
    statusText: customsStatusText,
    lastReviewed: hasHSCode ? new Date().toISOString().split('T')[0] + ' 15:10' : undefined
  });

  // 5. 원산지증명서 (C/O) - 수출의 경우 또는 특정 국가 거래시 필수
  const isExport = profile.tradeType === 'export';
  
  docs.push({
    id: 'co',
    name: '원산지증명서',
    status: isExport ? 'not_started' : 'not_needed',
    statusText: isExport ? '작성 필요' : '해당 없음',
  });

  return docs;
}
