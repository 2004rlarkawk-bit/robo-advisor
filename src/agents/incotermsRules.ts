import { DocumentType } from '../types';

export interface IncotermsRule {
  incoterm: 'EXW' | 'FOB' | 'CIF' | 'DDP';
  description: string;
  exporterResponsibility: string;
  requiredDocuments: DocumentType[];
  insuranceRequirement: 'buyer' | 'exporter_required' | 'not_required';
  transportMode: 'sea' | 'all';
  keyBranchingNote: string;
}

export const INCOTERMS_RULES: Record<'EXW' | 'FOB' | 'CIF' | 'DDP', IncotermsRule> = {
  EXW: {
    incoterm: 'EXW',
    description: '공장 인도 조건 (Ex Works)',
    exporterResponsibility: '최소 의무 (공장 인도)',
    requiredDocuments: ['invoice', 'packing_list'], // BL, CO, Insurance excluded by default for exporter
    insuranceRequirement: 'not_required',
    transportMode: 'all',
    keyBranchingNote: '송장·패킹리스트만 필수. 운송·수출통관은 매수인이 전적으로 부담합니다.'
  },
  FOB: {
    incoterm: 'FOB',
    description: '본선 인도 조건 (Free On Board)',
    exporterResponsibility: '본선 적재시까지 + 수출통관',
    requiredDocuments: ['invoice', 'packing_list', 'bl'], // BL required
    insuranceRequirement: 'buyer',
    transportMode: 'sea',
    keyBranchingNote: '선하증권(B/L) 필수. 적하보험은 매수인 부담 및 수배 사항입니다.'
  },
  CIF: {
    incoterm: 'CIF',
    description: '운임·보험료 포함 인도 조건 (Cost, Insurance and Freight)',
    exporterResponsibility: '운임 및 보험 도착항까지 매도인 부담',
    requiredDocuments: ['invoice', 'packing_list', 'bl', 'insurance'], // Insurance Policy and BL required
    insuranceRequirement: 'exporter_required',
    transportMode: 'sea',
    keyBranchingNote: '적하보험증권(Insurance Policy) 제출 필수. 운임 및 보험 도착항까지 매도인 부담.'
  },
  DDP: {
    incoterm: 'DDP',
    description: '관세지급 인도 조건 (Delivered Duty Paid)',
    exporterResponsibility: '수입국 통관 및 관세 납부 완료시까지',
    requiredDocuments: ['invoice', 'packing_list', 'bl', 'customs_dec'], // Requires customs clearance & duties
    insuranceRequirement: 'buyer',
    transportMode: 'all',
    keyBranchingNote: '최대 의무 조건. 수입국 통관 및 관세까지 매도인이 부담하므로 수입국 관세율 확인 필수.'
  }
};

export function getIncotermsRule(incoterm: string): IncotermsRule | null {
  const normalized = incoterm.toUpperCase();
  if (normalized === 'EXW' || normalized === 'FOB' || normalized === 'CIF' || normalized === 'DDP') {
    return INCOTERMS_RULES[normalized];
  }
  return null;
}
