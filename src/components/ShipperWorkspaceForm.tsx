import type { ReactNode } from 'react';
import { FileSignature, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DISCHARGE_PORT_OPTIONS, LOAD_PORT_OPTIONS } from '../constants/ports';
import type { Incoterms, NumericInput, ShipperItem, TradeProfile } from '../types';
import CountrySelect from './CountrySelect';
import {
  calculateShipperItemAmount,
  createEmptyShipperItem,
  isGrossWeightBelowNet,
  SHIPPER_CURRENCIES,
  SHIPPER_ITEM_UNITS,
  summarizeShipperItems,
  type ShipperSupplementalState,
} from '../utils/shipperForm';

interface Props {
  profile: TradeProfile;
  items: ShipperItem[];
  supplemental: ShipperSupplementalState;
  isProcessing: boolean;
  toolbar?: ReactNode;
  statusContent?: ReactNode;
  onProfilePatch: (patch: Partial<TradeProfile>) => void;
  onItemsChange: (items: ShipperItem[]) => void;
  onSupplementalChange: (state: ShipperSupplementalState) => void;
  onReset: () => void;
  onGenerate: () => void;
}

const INCOTERMS_OPTIONS: Exclude<Incoterms, ''>[] = ['EXW', 'FOB', 'CFR', 'CIF', 'DDP'];
const PAYMENT_TERM_OPTIONS = ['T/T', 'L/C', 'D/P', 'D/A'] as const;
const PACKAGE_TYPE_OPTIONS = ['CTNS', 'PALLETS', 'CASES', 'BOXES', 'BAGS', 'DRUMS'] as const;

function numericValue(eventValue: string): NumericInput {
  return eventValue === '' ? '' : Number(eventValue);
}

export default function ShipperWorkspaceForm({
  profile,
  items,
  supplemental,
  isProcessing,
  toolbar,
  statusContent,
  onProfilePatch,
  onItemsChange,
  onSupplementalChange,
  onReset,
  onGenerate,
}: Props) {
  const invoiceSummary = summarizeShipperItems(items);
  const hasInvalidWeight = isGrossWeightBelowNet(profile.grossWeight, profile.netWeight);

  const updateItem = <K extends keyof ShipperItem>(id: string, field: K, value: ShipperItem[K]) => {
    onItemsChange(items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    onItemsChange([...items, createEmptyShipperItem(`shipper-item-${crypto.randomUUID()}`)]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) return;
    onItemsChange(items.filter((item) => item.id !== id));
  };

  const patchParty = (field: keyof TradeProfile, value: string) => {
    const patch: Record<string, string> = { [field]: value };
    const buyerToConsignee: Partial<Record<keyof TradeProfile, keyof TradeProfile>> = {
      buyerName: 'partnerName',
      buyerAddress: 'partnerAddress',
      buyerCountry: 'partnerCountry',
    };
    const consigneeToNotify: Partial<Record<keyof TradeProfile, keyof TradeProfile>> = {
      partnerName: 'notifyPartyName',
      partnerAddress: 'notifyPartyAddress',
    };

    const consigneeField = buyerToConsignee[field];
    if (supplemental.buyerMatchesConsignee && consigneeField) {
      patch[consigneeField] = value;
      const notifyField = consigneeToNotify[consigneeField];
      if (supplemental.consigneeMatchesNotifyParty && notifyField) patch[notifyField] = value;
    }

    const notifyField = consigneeToNotify[field];
    if (supplemental.consigneeMatchesNotifyParty && notifyField) patch[notifyField] = value;
    onProfilePatch(patch as Partial<TradeProfile>);
  };

  const setBuyerMatchesConsignee = (checked: boolean) => {
    onSupplementalChange({ ...supplemental, buyerMatchesConsignee: checked });
    if (!checked) return;
    const patch: Partial<TradeProfile> = {
      partnerName: profile.buyerName ?? '',
      partnerAddress: profile.buyerAddress ?? '',
      partnerCountry: profile.buyerCountry ?? '',
    };
    if (supplemental.consigneeMatchesNotifyParty) {
      patch.notifyPartyName = profile.buyerName ?? '';
      patch.notifyPartyAddress = profile.buyerAddress ?? '';
    }
    onProfilePatch(patch);
  };

  const setConsigneeMatchesNotify = (checked: boolean) => {
    onSupplementalChange({ ...supplemental, consigneeMatchesNotifyParty: checked });
    if (checked) {
      onProfilePatch({
        notifyPartyName: profile.partnerName ?? '',
        notifyPartyAddress: profile.partnerAddress ?? '',
      });
    }
  };

  return (
    <div className="form-card shipper-workspace-form">
      <div className="trade-section-header">
        <div className="trade-section-title">
          <FileSignature size={20} className="text-primary" />
          <h2 className="card-title">화주 통관 정보 입력</h2>
        </div>
        {toolbar}
      </div>
      {statusContent}

      {/* 2026-07-23 편의성 업그레이드: 화주용 통관 입력 폼 확장 */}
      <details className="form-section" open>
        <summary className="form-section-summary">1. 화주 기본정보</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">회사명(상호명)</label><input className="form-input" value={profile.companyName} onChange={(event) => onProfilePatch({ companyName: event.target.value })} placeholder="ABC Logistics Co., Ltd." /></div>
          <div className="form-group"><label className="form-label">회사 주소</label><input className="form-input" value={profile.companyAddress ?? ''} onChange={(event) => onProfilePatch({ companyAddress: event.target.value })} placeholder="123 Teheran-ro, Gangnam-gu, Seoul, South Korea" /></div>
          <div className="form-group"><label className="form-label">국가</label><CountrySelect className="form-input" value={profile.companyCountry ?? ''} onChange={(value) => onProfilePatch({ companyCountry: value })} /></div>
          <div className="form-group"><label className="form-label">회사 연락처</label><input className="form-input" type="tel" value={profile.contact} onChange={(event) => onProfilePatch({ contact: event.target.value })} placeholder="+82-2-1234-5678" /></div>
          <div className="form-group"><label className="form-label">사업자등록번호</label><input className="form-input" value={profile.businessRegistrationNo ?? ''} onChange={(event) => onProfilePatch({ businessRegistrationNo: event.target.value, taxNo: event.target.value })} placeholder="123-45-67890" /></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">2. 거래처 정보</summary>
        <div className="form-message info">저장된 거래처 없음 · 아래에서 직접 입력해 주세요.</div>
        <div className="shipper-checkbox-row">
          <label><input type="checkbox" checked={supplemental.buyerMatchesConsignee} onChange={(event) => setBuyerMatchesConsignee(event.target.checked)} /> Buyer와 Consignee 동일</label>
          <label><input type="checkbox" checked={supplemental.consigneeMatchesNotifyParty} onChange={(event) => setConsigneeMatchesNotify(event.target.checked)} /> Consignee와 Notify Party 동일</label>
        </div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Buyer 회사명</label><input className="form-input" value={profile.buyerName ?? ''} onChange={(e) => patchParty('buyerName', e.target.value)} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Buyer 영문 주소</label><input className="form-input" value={profile.buyerAddress ?? ''} onChange={(e) => patchParty('buyerAddress', e.target.value)} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
          <div className="form-group"><label className="form-label">Buyer 국가</label><CountrySelect className="form-input" value={profile.buyerCountry ?? ''} onChange={(value) => patchParty('buyerCountry', value)} /></div>
          <div className="form-group"><label className="form-label">Consignee 회사명</label><input className="form-input" value={profile.partnerName ?? ''} onChange={(e) => patchParty('partnerName', e.target.value)} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Consignee 영문 주소</label><input className="form-input" value={profile.partnerAddress ?? ''} onChange={(e) => patchParty('partnerAddress', e.target.value)} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
          <div className="form-group"><label className="form-label">Consignee 국가</label><CountrySelect className="form-input" value={profile.partnerCountry ?? ''} onChange={(value) => patchParty('partnerCountry', value)} /></div>
          <div className="form-group"><label className="form-label">Notify Party 회사명</label><input className="form-input" value={profile.notifyPartyName ?? ''} onChange={(e) => patchParty('notifyPartyName', e.target.value)} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Notify Party 주소</label><input className="form-input" value={profile.notifyPartyAddress ?? ''} onChange={(e) => patchParty('notifyPartyAddress', e.target.value)} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">3. 품목 정보 · {items.length}개</summary>
        <div className="shipper-item-list">
          {items.map((item, index) => (
            <div className="shipper-item-card" key={item.id}>
              <div className="shipper-item-heading"><strong>품목 {index + 1}</strong><button type="button" className="btn btn-secondary btn-sm" disabled={items.length === 1} onClick={() => removeItem(item.id)}><Trash2 size={14} /> 삭제</button></div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">품명</label><input className="form-input" value={item.itemName} onChange={(e) => updateItem(item.id, 'itemName', e.target.value)} placeholder="Cotton T-Shirts" /></div>
                <div className="form-group"><label className="form-label">HS Code</label><input className="form-input" value={item.hsCode} onChange={(e) => updateItem(item.id, 'hsCode', e.target.value)} placeholder={index === 0 ? 'e.g. 6109.10' : ''} /></div>
                <div className="form-group"><label className="form-label">수량</label><input type="number" min="0" className="form-input" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', numericValue(e.target.value))} /></div>
                <div className="form-group"><label className="form-label">단위</label><select className="form-input" value={item.unit} onChange={(e) => updateItem(item.id, 'unit', e.target.value as ShipperItem['unit'])}>{SHIPPER_ITEM_UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></div>
                <div className="form-group"><label className="form-label">단가</label><input type="number" min="0" step="any" className="form-input" value={item.unitPrice} onChange={(e) => updateItem(item.id, 'unitPrice', numericValue(e.target.value))} /></div>
                <div className="form-group"><label className="form-label">통화</label><select className="form-input" value={item.currency} onChange={(e) => updateItem(item.id, 'currency', e.target.value as ShipperItem['currency'])}>{SHIPPER_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></div>
                <div className="form-group"><span className="form-label">금액</span><div className="form-input shipper-readonly-value">{item.currency} {calculateShipperItemAmount(item).toLocaleString()}</div></div>
              </div>
            </div>
          ))}
        </div>
        <div className="shipper-item-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}><Plus size={14} /> 품목 추가</button>
          {invoiceSummary.mixedCurrencies
            ? <span className="form-message info">통화가 서로 달라 Invoice 총액을 단순 합산하지 않습니다.</span>
            : <strong>Invoice 총액: {invoiceSummary.currency} {(invoiceSummary.total ?? 0).toLocaleString()}</strong>}
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">4. 거래 조건</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Incoterms</label><select className="form-input" value={profile.incoterms} onChange={(e) => onProfilePatch({ incoterms: e.target.value as Incoterms })}><option value="">선택하세요</option>{INCOTERMS_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-group"><label className="form-label">결제조건</label><select className="form-input" value={profile.paymentTerms ?? ''} onChange={(e) => onProfilePatch({ paymentTerms: e.target.value })}><option value="">선택하세요</option>{PAYMENT_TERM_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Incoterms 지정 장소 또는 항만</label><input className="form-input" value={supplemental.incotermsPlace} onChange={(e) => onSupplementalChange({ ...supplemental, incotermsPlace: e.target.value })} placeholder="Busan Port" /></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">5. 포장 정보</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">포장 수량</label><input type="number" min="0" className="form-input" value={profile.packageCount ?? ''} onChange={(e) => onProfilePatch({ packageCount: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">포장 종류</label><select className="form-input" value={profile.packageType ?? ''} onChange={(e) => onProfilePatch({ packageType: e.target.value })}><option value="">선택하세요</option>{PACKAGE_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-group"><label className="form-label">총중량 G.W. (kg)</label><input type="number" min="0" step="any" className="form-input" value={profile.grossWeight ?? ''} onChange={(e) => onProfilePatch({ grossWeight: numericValue(e.target.value), weight: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">순중량 N.W. (kg)</label><input type="number" min="0" step="any" className="form-input" value={profile.netWeight ?? ''} onChange={(e) => onProfilePatch({ netWeight: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">CBM</label><input className="form-input" value={profile.measurement ?? ''} onChange={(e) => onProfilePatch({ measurement: e.target.value })} /></div>
        </div>
        {hasInvalidWeight && <div className="form-message error" role="alert">총중량 G.W.은 순중량 N.W.보다 작을 수 없습니다.</div>}
      </details>

      <details className="form-section">
        <summary className="form-section-summary">6. 항만 및 일정</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">선적항 POL</label><select className="form-input" value={profile.loadPort} onChange={(e) => onProfilePatch({ loadPort: e.target.value })}><option value="">선적항을 선택하세요</option>{LOAD_PORT_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">도착항 POD</label><select className="form-input" value={profile.dischargePort} onChange={(e) => onProfilePatch({ dischargePort: e.target.value })}><option value="">도착항을 선택하세요</option>{DISCHARGE_PORT_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}</select></div>
          <div className="form-group"><label className="form-label">희망 출항일</label><input type="date" className="form-input" value={profile.departureDate} onChange={(e) => onProfilePatch({ departureDate: e.target.value })} /></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">7. 원산지 및 요건서류</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">원산지 국가</label><CountrySelect className="form-input" value={profile.countryOfOrigin ?? ''} onChange={(value) => onProfilePatch({ countryOfOrigin: value })} /></div>
          <div className="form-group"><label className="form-label">원산지 결정기준</label><select className="form-input" value={supplemental.originCriterion} onChange={(e) => onSupplementalChange({ ...supplemental, originCriterion: e.target.value as ShipperSupplementalState['originCriterion'] })}><option value="">선택하세요</option><option value="세번변경기준">세번변경기준</option><option value="부가가치기준">부가가치기준</option><option value="완전생산기준">완전생산기준</option></select></div>
          <div className="form-group"><span className="form-label">BOM 또는 원료명세서</span><input className="form-input" value="추후 첨부 지원 예정" disabled /></div>
          <div className="form-group"><span className="form-label">수출요건 확인서류</span><input className="form-input" value="추후 첨부 지원 예정" disabled /></div>
        </div>
      </details>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onReset}><RotateCcw size={16} /> 초기화</button>
        <button type="button" className="btn btn-primary" onClick={onGenerate} disabled={isProcessing}><FileText size={16} />{isProcessing ? '생성 중...' : '필요 서류 자동 생성'}</button>
      </div>
    </div>
  );
}
