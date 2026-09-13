import { DocumentType } from '../types';

export type RuledIncoterm = 'EXW' | 'FAS' | 'FOB' | 'CFR' | 'CIF' | 'DDP' | 'DAP' | 'FCA';

export interface IncotermsRule {
  incoterm: RuledIncoterm;
  description: string;
  exporterResponsibility: string;
  requiredDocuments: DocumentType[];
  insuranceRequirement: 'buyer' | 'exporter_required' | 'not_required';
  transportMode: 'sea' | 'all';
  keyBranchingNote: string;
}

export const INCOTERMS_RULES: Record<RuledIncoterm, IncotermsRule> = {
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
  FAS: {
    incoterm: 'FAS',
    description: '선측 인도 조건 (Free Alongside Ship)',
    exporterResponsibility: '지정 선적항의 본선 선측 인도 + 수출통관',
    requiredDocuments: ['invoice', 'packing_list', 'bl'],
    insuranceRequirement: 'buyer',
    transportMode: 'sea',
    keyBranchingNote: '지정 선적항의 본선 선측에서 위험이 이전되며, 이후 운송·보험은 매수인이 수배합니다.'
  },
  CFR: {
    incoterm: 'CFR',
    description: '운임 포함 인도 조건 (Cost and Freight)',
    exporterResponsibility: '도착항까지 운임 부담, 본선 적재 시 위험 이전',
    requiredDocuments: ['invoice', 'packing_list', 'bl'],
    insuranceRequirement: 'buyer',
    transportMode: 'sea',
    keyBranchingNote: '도착항까지 운임은 매도인이 부담하지만 적하보험은 매수인이 수배합니다.'
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
  },
  DAP: {
    incoterm: 'DAP',
    description: '도착장소 인도 조건 (Delivered At Place)',
    exporterResponsibility: '지정 목적지 도착까지 운송 매도인 부담 (수입통관 제외)',
    requiredDocuments: ['invoice', 'packing_list', 'bl'],
    insuranceRequirement: 'buyer',
    transportMode: 'all',
    keyBranchingNote: '지정 목적지까지 운송은 매도인 부담이며, 수입통관·관세는 매수인 부담입니다.'
  },
  FCA: {
    incoterm: 'FCA',
    description: '운송인 인도 조건 (Free Carrier)',
    exporterResponsibility: '지정 장소에서 운송인 인도 + 수출통관',
    requiredDocuments: ['invoice', 'packing_list'],
    insuranceRequirement: 'buyer',
    transportMode: 'all',
    keyBranchingNote: '매수인이 지정한 운송인에게 인도하는 시점에 위험이 이전됩니다. 이후 운송·보험은 매수인 수배 사항입니다.'
  }
};

export function getIncotermsRule(incoterm: string): IncotermsRule | null {
  const normalized = incoterm.toUpperCase() as RuledIncoterm;
  return normalized in INCOTERMS_RULES ? INCOTERMS_RULES[normalized] : null;
}
