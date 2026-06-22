/**
 * 규칙 엔진 - Incoterms별 서류 분기 포함
 */
import { TradeProfile, DocumentStatus } from '../types';
import { getIncotermsRule } from '../agents/incotermsRules';

export function determineRequiredDocuments(profile: TradeProfile): DocumentStatus[] {
  const docs: DocumentStatus[] = [];
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  const rule = getIncotermsRule(profile.incoterms);

  // 1. 상업송장 (Commercial Invoice) - 항상 필수
  const hasInvoiceInfo = !!(profile.itemName && profile.companyName && profile.incoterms);
  docs.push({
    id: 'invoice',
    name: '상업송장(Invoice)',
    status: hasInvoiceInfo ? 'completed' : 'not_started',
    statusText: hasInvoiceInfo ? '생성 완료' : '작성 필요',
    lastReviewed: hasInvoiceInfo ? timestamp : undefined
  });

  // 2. 패킹리스트 (Packing List) - 항상 필수
  const hasPackingInfo = profile.quantity !== '' && Number(profile.quantity) > 0;
  const hasWeightInfo = profile.weight !== '' && Number(profile.weight) > 0;
  
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
    lastReviewed: hasPackingInfo ? timestamp : undefined
  });

  // 3. 선하증권 (B/L) - EXW에서는 선택적 (매도인 필수 제외)
  const hasBLInfo = !!(profile.loadPort && profile.dischargePort);
  const isEXW = profile.incoterms === 'EXW';
  
  if (isEXW) {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: 'not_needed',
      statusText: 'EXW 조건 - 매수인 측 처리'
    });
  } else {
    docs.push({
      id: 'bl',
      name: '선하증권(B/L)',
      status: hasBLInfo ? 'completed' : 'not_started',
      statusText: hasBLInfo ? '생성 완료' : '작성 필요',
      lastReviewed: hasBLInfo ? timestamp : undefined
    });
  }

  // 4. 통관신고서 - 항상 필수
  const hasHSCode = !!profile.hsCode;
  const cleanCode = profile.hsCode.replace(/[-.\s]/g, '');
  const isHSCodeNumeric = /^\d+$/.test(cleanCode);
  const isHSCodeValid = hasHSCode && isHSCodeNumeric && cleanCode.length >= 6;
  
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
    lastReviewed: hasHSCode ? timestamp : undefined
  });

  // 5. 원산지증명서 (C/O) - 수출의 경우 필수
  const isExport = profile.tradeType === 'export';
  const isCOCompleted = isExport && profile.companyName.includes('산');
  docs.push({
    id: 'co',
    name: '원산지증명서(C/O)',
    status: isExport ? (isCOCompleted ? 'completed' : 'not_started') : 'not_needed',
    statusText: isExport ? (isCOCompleted ? '생성 완료' : '작성 필요') : '해당 없음',
    lastReviewed: isCOCompleted ? timestamp : undefined
  });

  // 6. 보험증서 (Insurance) - CIF 조건일 때만 필수 (규칙 매트릭스 참조)
  if (rule && rule.requiredDocuments.includes('insurance')) {
    docs.push({
      id: 'insurance',
      name: '적하보험증권(Insurance Policy)',
      status: 'not_started',
      statusText: 'CIF 조건 - 작성 필요',
    });
  }

  return docs;
}
