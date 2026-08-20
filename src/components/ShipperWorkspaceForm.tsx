import { useEffect, useState, type ReactNode } from 'react';
import { FileSignature, FileText, Plus, RotateCcw, Trash2 } from 'lucide-react';
import {
  EXPORT_POD_OPTIONS,
  EXPORT_POL_OPTIONS,
  OTHER_DOMESTIC_PORT_VALUE,
  OTHER_FOREIGN_PORT_VALUE,
  normalizeExportPortValue,
} from '../constants/ports';
import type { Incoterms, NumericInput, ShipperItem, ShipperSupplementalState, TradeProfile } from '../types';
import CountrySelect from './CountrySelect';
import { useShipperHSCodeSuggestions } from '../hooks/useShipperHSCodeSuggestions';
import {
  fetchFrequentTradePartners,
  type FrequentTradePartner,
} from '../services/frequentTradePartnerService';
import {
  calculateShipperItemAmount,
  createEmptyShipperItem,
  EMPTY_GOODS_DESCRIPTION_MESSAGE,
  getGoodsDescriptionValidationMessage,
  isGrossWeightBelowNet,
  NON_ENGLISH_GOODS_DESCRIPTION_MESSAGE,
  SHIPPER_CURRENCIES,
  SHIPPER_ITEM_UNIT_OPTIONS,
  SHIPPER_PACKAGE_TYPE_OPTIONS,
  summarizeShipperItems,
  getShipperPackageTypeOptionValue,
} from '../utils/shipperForm';

interface Props {
  profile: TradeProfile;
  items: ShipperItem[];
  supplemental: ShipperSupplementalState;
  isProcessing: boolean;
  toolbar?: ReactNode;
  statusContent?: ReactNode;
  profileSignerDefault?: string;
  tradeId?: string | null;
  userId?: string;
  onProfilePatch: (patch: Partial<TradeProfile>) => void;
  onItemsChange: (items: ShipperItem[]) => void;
  onSupplementalChange: (state: ShipperSupplementalState) => void;
  onReset: () => void;
  onGenerate: () => void;
}

const INCOTERMS_OPTIONS: Exclude<Incoterms, ''>[] = ['FOB', 'CFR', 'CIF', 'FAS', 'FCA'];
const PAYMENT_TERM_OPTIONS = [
  { value: 'T/T', label: 'T/T (전신송금)' },
  { value: 'L/C', label: 'L/C (신용장)' },
  { value: 'D/P', label: 'D/P (지급인도)' },
  { value: 'D/A', label: 'D/A (인수인도)' },
  { value: 'Open Account', label: 'Open Account (외상거래)' },
] as const;
const OTHER_ITEM_UNIT_VALUE = '__OTHER_ITEM_UNIT__';
const OTHER_PACKAGE_TYPE_VALUE = '__OTHER_PACKAGE_TYPE__';

// 필수 입력 배지 — 미입력 시 문서 생성이 차단(error)되는 항목의 라벨에만 붙인다
const Req = () => <span className="req-badge">필수</span>;

function numericValue(eventValue: string): NumericInput {
  return eventValue === '' ? '' : Number(eventValue);
}

function normalizePartyValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function formatPartnerDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\. /g, '.').replace(/\.$/, '');
}

export default function ShipperWorkspaceForm({
  profile,
  items,
  supplemental,
  isProcessing,
  toolbar,
  statusContent,
  profileSignerDefault = '',
  tradeId,
  userId,
  onProfilePatch,
  onItemsChange,
  onSupplementalChange,
  onReset,
  onGenerate,
}: Props) {
  const invoiceSummary = summarizeShipperItems(items);
  const hasInvalidWeight = isGrossWeightBelowNet(profile.grossWeight, profile.netWeight);
  const hsCodeSuggestions = useShipperHSCodeSuggestions(items);
  const [showItemValidation, setShowItemValidation] = useState(false);
  const [incotermsPlaceSource, setIncotermsPlaceSource] = useState<'loadPort' | 'dischargePort' | null>(null);
  const [forceCustomLoadPort, setForceCustomLoadPort] = useState(false);
  const [forceCustomDischargePort, setForceCustomDischargePort] = useState(false);
  const [forceCustomPackageType, setForceCustomPackageType] = useState(false);
  const [frequentPartners, setFrequentPartners] = useState<FrequentTradePartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(Boolean(userId));

  const normalizedLoadPort = normalizeExportPortValue(profile.loadPort);
  const normalizedDischargePort = normalizeExportPortValue(profile.dischargePort);
  const isKnownLoadPort = EXPORT_POL_OPTIONS.some((port) => port.value === normalizedLoadPort);
  const isKnownDischargePort = EXPORT_POD_OPTIONS.some((port) => port.value === normalizedDischargePort);
  const loadPortSelection = forceCustomLoadPort || (profile.loadPort && !isKnownLoadPort)
    ? OTHER_DOMESTIC_PORT_VALUE
    : normalizedLoadPort;
  const dischargePortSelection = forceCustomDischargePort || (profile.dischargePort && !isKnownDischargePort)
    ? OTHER_FOREIGN_PORT_VALUE
    : normalizedDischargePort;
  const knownPackageType = getShipperPackageTypeOptionValue(profile.packageType);
  const packageTypeSelection = forceCustomPackageType || (profile.packageType && !knownPackageType)
    ? OTHER_PACKAGE_TYPE_VALUE
    : knownPackageType ?? '';

  useEffect(() => {
    let active = true;
    if (!userId) {
      setFrequentPartners([]);
      setPartnersLoading(false);
      return () => { active = false; };
    }

    setPartnersLoading(true);
    void fetchFrequentTradePartners(userId)
      .then((partners) => {
        if (active) setFrequentPartners(partners);
      })
      .catch((error: unknown) => {
        console.warn('자주 거래한 거래처 조회 실패 — 직접 입력을 유지합니다:', error);
        if (active) setFrequentPartners([]);
      })
      .finally(() => {
        if (active) setPartnersLoading(false);
      });

    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    setIncotermsPlaceSource(null);
    setForceCustomPackageType(false);
  }, [tradeId]);

  useEffect(() => {
    if (isKnownLoadPort) setForceCustomLoadPort(false);
    else if (profile.loadPort) setForceCustomLoadPort(true);
  }, [isKnownLoadPort, profile.loadPort]);

  useEffect(() => {
    if (isKnownDischargePort) setForceCustomDischargePort(false);
    else if (profile.dischargePort) setForceCustomDischargePort(true);
  }, [isKnownDischargePort, profile.dischargePort]);

  useEffect(() => {
    const patch: Partial<TradeProfile> = {};
    if (profile.loadPort && normalizedLoadPort !== profile.loadPort) patch.loadPort = normalizedLoadPort;
    if (profile.dischargePort && normalizedDischargePort !== profile.dischargePort) {
      patch.dischargePort = normalizedDischargePort;
    }
    if (Object.keys(patch).length > 0) onProfilePatch(patch);
  }, [normalizedDischargePort, normalizedLoadPort, onProfilePatch, profile.dischargePort, profile.loadPort]);

  useEffect(() => {
    if (knownPackageType) setForceCustomPackageType(false);
    else if (profile.packageType) setForceCustomPackageType(true);
  }, [knownPackageType, profile.packageType]);

  useEffect(() => {
    if (!incotermsPlaceSource) return;
    const nextPlace = incotermsPlaceSource === 'loadPort' ? normalizedLoadPort : normalizedDischargePort;
    if (supplemental.incotermsPlace !== nextPlace) {
      onSupplementalChange({ ...supplemental, incotermsPlace: nextPlace });
    }
  }, [incotermsPlaceSource, normalizedDischargePort, normalizedLoadPort, onSupplementalChange, supplemental]);

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

  const handleGenerateClick = () => {
    setShowItemValidation(true);
    if (getGoodsDescriptionValidationMessage(items)) return;
    onGenerate();
  };

  const handleResetClick = () => {
    setIncotermsPlaceSource(null);
    setForceCustomLoadPort(false);
    setForceCustomDischargePort(false);
    setForceCustomPackageType(false);
    onReset();
  };

  const toggleIncotermsPlaceSource = (source: 'loadPort' | 'dischargePort', checked: boolean) => {
    const nextSource = checked ? source : null;
    setIncotermsPlaceSource(nextSource);
    if (nextSource) {
      onSupplementalChange({
        ...supplemental,
        incotermsPlace: nextSource === 'loadPort' ? normalizedLoadPort : normalizedDischargePort,
      });
    }
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

  const loadFrequentPartner = (partner: FrequentTradePartner) => {
    const buyerMatchesConsignee =
      normalizePartyValue(partner.buyer.name) === normalizePartyValue(partner.consignee.name) &&
      normalizePartyValue(partner.buyer.address) === normalizePartyValue(partner.consignee.address) &&
      normalizePartyValue(partner.buyer.country) === normalizePartyValue(partner.consignee.country);
    const consigneeMatchesNotifyParty =
      normalizePartyValue(partner.consignee.name) === normalizePartyValue(partner.notifyParty.name) &&
      normalizePartyValue(partner.consignee.address) === normalizePartyValue(partner.notifyParty.address);

    onProfilePatch({
      buyerName: partner.buyer.name,
      buyerAddress: partner.buyer.address,
      buyerCountry: partner.buyer.country,
      partnerName: partner.consignee.name,
      partnerAddress: partner.consignee.address,
      partnerCountry: partner.consignee.country,
      notifyPartyName: partner.notifyParty.name,
      notifyPartyAddress: partner.notifyParty.address,
    });
    onSupplementalChange({
      ...supplemental,
      buyerMatchesConsignee,
      consigneeMatchesNotifyParty,
    });
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
          <div className="form-group" data-field="companyName"><label className="form-label">회사명(상호명) <Req /></label><input className="form-input" value={profile.companyName} onChange={(event) => onProfilePatch({
            companyName: event.target.value,
            ...(supplemental.isSignerSameAsCompany ? { signedBy: event.target.value } : {}),
          })} placeholder="ABC Logistics Co., Ltd." /></div>
          <div className="form-group"><label className="form-label">회사 주소 <Req /></label><input className="form-input" value={profile.companyAddress ?? ''} onChange={(event) => onProfilePatch({ companyAddress: event.target.value })} placeholder="123 Teheran-ro, Gangnam-gu, Seoul, South Korea" /></div>
          <div className="form-group"><label className="form-label">국가</label><CountrySelect className="form-input" value={profile.companyCountry ?? ''} onChange={(value) => onProfilePatch({ companyCountry: value })} /></div>
          <div className="form-group" data-field="contact"><label className="form-label">회사 연락처 <Req /></label><input className="form-input" type="tel" value={profile.contact} onChange={(event) => onProfilePatch({ contact: event.target.value })} placeholder="+82-2-1234-5678" /></div>
          <div className="form-group" data-field="businessRegistrationNo"><label className="form-label">사업자등록번호</label><input className="form-input" value={profile.businessRegistrationNo ?? ''} onChange={(event) => onProfilePatch({ businessRegistrationNo: event.target.value, taxNo: event.target.value })} placeholder="123-45-67890" /></div>
          <div className="form-group">
            <label className="form-label">서명자 영문명</label>
            <input
              className="form-input"
              value={profile.signedBy ?? ''}
              readOnly={supplemental.isSignerSameAsCompany}
              onChange={(event) => {
                if (!supplemental.isSignerSameAsCompany) onProfilePatch({ signedBy: event.target.value });
              }}
              placeholder="Gildong Hong"
            />
            <label className="shipper-inline-checkbox"><input type="checkbox" checked={supplemental.isSignerSameAsCompany} onChange={(event) => {
              const checked = event.target.checked;
              const signerNameBeforeCompany = checked
                ? (profile.signedBy ?? '')
                : supplemental.signerNameBeforeCompany;
              onSupplementalChange({
                ...supplemental,
                isSignerSameAsCompany: checked,
                signerNameBeforeCompany,
              });
              onProfilePatch({
                signedBy: checked
                  ? profile.companyName
                  : (supplemental.signerNameBeforeCompany || profileSignerDefault || profile.contactName || ''),
              });
            }} /> 회사명과 서명자 동일</label>
          </div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">2. 거래처 정보</summary>
        {partnersLoading ? (
          <div className="form-message info" role="status">자주 거래한 거래처를 불러오는 중입니다.</div>
        ) : frequentPartners.length > 0 ? (
          <div className="frequent-partners" aria-label="자주 거래한 거래처">
            <strong className="frequent-partners-title">자주 거래한 거래처</strong>
            <div className="frequent-partner-list">
              {frequentPartners.map((partner, index) => (
                <div className="frequent-partner-card" key={partner.key}>
                  <div className="frequent-partner-copy">
                    <strong>{index + 1}. {partner.buyer.name}</strong>
                    <span>{partner.transactionCount}회 거래 · 최근 거래 {formatPartnerDate(partner.lastTransactionDate)}</span>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => loadFrequentPartner(partner)}>불러오기</button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="form-message info">저장된 거래처가 없습니다.<br />아래에서 직접 입력해 주세요.</div>
        )}
        <div className="shipper-checkbox-row">
          <label><input type="checkbox" checked={supplemental.buyerMatchesConsignee} onChange={(event) => setBuyerMatchesConsignee(event.target.checked)} /> Buyer와 Consignee 동일</label>
          <label><input type="checkbox" checked={supplemental.consigneeMatchesNotifyParty} onChange={(event) => setConsigneeMatchesNotify(event.target.checked)} /> Consignee와 Notify Party 동일</label>
        </div>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">Buyer 회사명</label><input className="form-input" value={profile.buyerName ?? ''} onChange={(e) => patchParty('buyerName', e.target.value)} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Buyer 영문 주소</label><input className="form-input" value={profile.buyerAddress ?? ''} onChange={(e) => patchParty('buyerAddress', e.target.value)} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
          <div className="form-group"><label className="form-label">Buyer 국가</label><CountrySelect className="form-input" value={profile.buyerCountry ?? ''} onChange={(value) => patchParty('buyerCountry', value)} /></div>
          <div className="form-group" data-field="partnerName"><label className="form-label">Consignee 회사명 <Req /></label><input className="form-input" value={profile.partnerName ?? ''} onChange={(e) => patchParty('partnerName', e.target.value)} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Consignee 영문 주소 <Req /></label><input className="form-input" value={profile.partnerAddress ?? ''} onChange={(e) => patchParty('partnerAddress', e.target.value)} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
          <div className="form-group"><label className="form-label">Consignee 국가</label><CountrySelect className="form-input" value={profile.partnerCountry ?? ''} onChange={(value) => patchParty('partnerCountry', value)} /></div>
          <div className="form-group"><label className="form-label">Notify Party 회사명</label><input className="form-input" value={profile.notifyPartyName ?? ''} onChange={(e) => patchParty('notifyPartyName', e.target.value)} placeholder="Global Import LLC" /></div>
          <div className="form-group"><label className="form-label">Notify Party 주소</label><input className="form-input" value={profile.notifyPartyAddress ?? ''} onChange={(e) => patchParty('notifyPartyAddress', e.target.value)} placeholder="250 Market Street, Los Angeles, CA, United States" /></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">3. 품목 정보</summary>
        <div className="shipper-item-list">
          {items.map((item, index) => (
            <div className="shipper-item-card" key={item.id}>
              <div className="shipper-item-heading"><strong>품목 {index + 1}</strong><button type="button" className="btn btn-secondary btn-sm" disabled={items.length === 1} onClick={() => removeItem(item.id)}><Trash2 size={14} /> 삭제</button></div>
              <div className="form-grid">
                <div className="form-group" data-field="itemName">
                  <label className="form-label">영문 품명 Goods Description <Req /></label>
                  <input
                    className="form-input"
                    value={item.itemName}
                    onChange={(event) => updateItem(item.id, 'itemName', event.target.value)}
                    placeholder="Women's 100% Cotton T-shirts, Black"
                    required
                    aria-invalid={!item.itemName.trim() || /[가-힣]/.test(item.itemName)}
                  />
                  {/[가-힣]/.test(item.itemName) && (
                    <small className="form-help form-help-error" role="alert">
                      {NON_ENGLISH_GOODS_DESCRIPTION_MESSAGE}
                    </small>
                  )}
                  {showItemValidation && !item.itemName.trim() && (
                    <small className="form-help form-help-error" role="alert">
                      {EMPTY_GOODS_DESCRIPTION_MESSAGE}
                    </small>
                  )}
                </div>
                <div className="form-group" data-field="hsCode"><label className="form-label">HS Code <Req /></label><input className="form-input" value={item.hsCode} onChange={(e) => {
                  hsCodeSuggestions.markHSCodeManuallyEdited(item.id);
                  updateItem(item.id, 'hsCode', e.target.value);
                }} placeholder={index === 0 ? 'e.g. 6109.10' : ''} /></div>
                {(() => {
                  const state = hsCodeSuggestions.getState(item.id);
                  const applied =
                    state.appliedSuggestionCode !== null &&
                    state.appliedSuggestionCode === item.hsCode.replace(/[\s.-]/g, '');
                  const hasPanel =
                    state.loading ||
                    state.error !== null ||
                    state.suggestions.length > 0 ||
                    state.additionalInformationRequired ||
                    applied;

                  if (!hasPanel) return null;

                  return (
                    <div className="shipper-hs-suggestion-panel" aria-live="polite">
                      {state.loading && (
                        <div className="shipper-hs-loading">관세청 후보와 품목 정보를 비교하고 있습니다.</div>
                      )}

                      {state.error && (
                        <div className="shipper-hs-error">
                          <span>{state.error}</span>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => hsCodeSuggestions.retry(item.id)}>재시도</button>
                        </div>
                      )}

                      {state.suggestions.length > 0 && (
                        <>
                          <div className="shipper-hs-suggestion-heading">
                            <strong>AI 추천 - 관세청 기반</strong>
                            <small>관세청 공식 HS 품목분류 사전 12,469건과 대조해 검증한 추천입니다.</small>
                          </div>
                          <div className="shipper-hs-suggestion-list">
                            {state.suggestions.map((suggestion) => (
                              <article className="shipper-hs-suggestion" key={suggestion.code}>
                                <header className="shipper-hs-suggestion__head">
                                  <div className="shipper-hs-suggestion__code">
                                    <strong>{suggestion.formattedCode}</strong>
                                    <span className={`shipper-hs-confidence${suggestion.confidenceLabel === '보통' ? ' is-medium' : ''}`}>
                                      {suggestion.confidenceLabel === '높음'
                                        ? '높은 일치 가능성'
                                        : '추가 확인 필요'}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                      updateItem(item.id, 'hsCode', suggestion.code);
                                      hsCodeSuggestions.markSuggestionApplied(item.id, suggestion.code);
                                    }}
                                  >
                                    {item.hsCode && item.hsCode.replace(/[\s.-]/g, '') !== suggestion.code
                                      ? '이 코드로 변경'
                                      : '적용'}
                                  </button>
                                </header>
                                <div className="shipper-hs-suggestion__body">
                                  <p>{suggestion.koreanName}{suggestion.classificationName ? ` ${suggestion.classificationName}` : ''}</p>
                                  <small>{suggestion.reasoning}</small>
                                  {(suggestion.distinguishingFactors?.length ?? 0) > 0 && (
                                    <small>구분 조건: {suggestion.distinguishingFactors?.join(', ')}</small>
                                  )}
                                  {(suggestion.missingInformation?.length ?? 0) > 0 && (
                                    <small>후보 확인사항: {suggestion.missingInformation?.join(', ')}</small>
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>
                        </>
                      )}

                      {state.additionalInformationRequired && !state.loading && !state.error && (
                        <div className="shipper-hs-additional-info">
                          <strong>추가 확인사항</strong>
                          {state.suggestions.length === 0 && (
                            <p>현재 입력과 충분히 관련된 관세청 HS Code 후보를 찾지 못했습니다. 품목명, 재질, 용도 또는 제품 형태를 더 구체적으로 입력해주세요.</p>
                          )}
                          {state.requiredAdditionalInfo.length > 0 && (
                            <ul>
                              {state.requiredAdditionalInfo.map((info) => (
                                <li key={info}>{info}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {applied && (
                        <div className="shipper-hs-applied">추천 HS Code가 적용되었습니다.</div>
                      )}
                    </div>
                  );
                })()}
                <div className="form-group" data-field="quantity"><label className="form-label">수량 <Req /></label><input type="number" min="0" className="form-input" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', numericValue(e.target.value))} /></div>
                <div className="form-group"><label className="form-label">단위 <Req /></label><select className="form-input" value={SHIPPER_ITEM_UNIT_OPTIONS.some((option) => option.value === item.unit) ? item.unit : OTHER_ITEM_UNIT_VALUE} onChange={(e) => updateItem(item.id, 'unit', e.target.value === OTHER_ITEM_UNIT_VALUE ? '' : e.target.value)}>{SHIPPER_ITEM_UNIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value={OTHER_ITEM_UNIT_VALUE}>기타</option></select>{!SHIPPER_ITEM_UNIT_OPTIONS.some((option) => option.value === item.unit) && <input className="form-input shipper-custom-unit-input" aria-label="기타 단위 직접 입력" value={item.unit} maxLength={12} onChange={(e) => updateItem(item.id, 'unit', e.target.value.toUpperCase().replace(/[^A-Z0-9./-]/g, ''))} placeholder="영문 단위 직접 입력 (예: DOZ)" />}</div>
                <div className="form-group" data-field="unitPrice"><label className="form-label">단가 <Req /></label><input type="number" min="0" step="any" className="form-input" value={item.unitPrice} onChange={(e) => updateItem(item.id, 'unitPrice', numericValue(e.target.value))} /></div>
                <div className="form-group"><label className="form-label">통화 <Req /></label><select className="form-input" value={item.currency} onChange={(e) => updateItem(item.id, 'currency', e.target.value as ShipperItem['currency'])}>{SHIPPER_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></div>
                <div className="form-group" data-field="totalAmount"><span className="form-label">금액</span><div className="form-input shipper-readonly-value">{item.currency} {calculateShipperItemAmount(item).toLocaleString()}</div></div>
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
          <div className="form-group" data-field="incoterms"><label className="form-label">Incoterms <Req /></label><select className="form-input" value={profile.incoterms} onChange={(e) => onProfilePatch({ incoterms: e.target.value as Incoterms })}><option value="">선택하세요</option>{INCOTERMS_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="form-group"><label className="form-label">결제조건</label><select className="form-input" value={profile.paymentTerms ?? ''} onChange={(e) => onProfilePatch({ paymentTerms: e.target.value })}><option value="">선택하세요</option>{PAYMENT_TERM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="form-group shipper-incoterms-place"><label className="form-label">Incoterms 지정 장소 또는 항만</label><input className="form-input" value={supplemental.incotermsPlace} readOnly={incotermsPlaceSource !== null} onChange={(e) => onSupplementalChange({ ...supplemental, incotermsPlace: e.target.value })} placeholder="Busan Port" /><div className="shipper-inline-options"><label className="shipper-inline-checkbox"><input type="checkbox" checked={incotermsPlaceSource === 'loadPort'} onChange={(e) => toggleIncotermsPlaceSource('loadPort', e.target.checked)} /> 선적항과 동일</label><label className="shipper-inline-checkbox"><input type="checkbox" checked={incotermsPlaceSource === 'dischargePort'} onChange={(e) => toggleIncotermsPlaceSource('dischargePort', e.target.checked)} /> 도착항과 동일</label></div></div>
          {profile.paymentTerms === 'L/C' && <>
            <div className="form-group"><label className="form-label">L/C No.</label><input className="form-input" value={profile.lcNo ?? ''} onChange={(e) => onProfilePatch({ lcNo: e.target.value })} /></div>
            <div className="form-group"><label className="form-label">L/C Date</label><input type="date" className="form-input" value={profile.lcDate ?? ''} onChange={(e) => onProfilePatch({ lcDate: e.target.value })} /></div>
          </>}
          <div className="form-group"><label className="form-label">기타 참조번호 Other References <span className="optional-label">(선택)</span></label><input className="form-input" value={profile.otherReferences ?? ''} onChange={(e) => onProfilePatch({ otherReferences: e.target.value })} placeholder="P/O No., Contract No. 등" /></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">5. 포장 정보</summary>
        <div className="form-grid">
          <div className="form-group"><label className="form-label">포장 수량 (박스 수)</label><input type="number" min="0" className="form-input" value={profile.packageCount ?? ''} onChange={(e) => onProfilePatch({ packageCount: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">박스당 수량 <span className="optional-label">(선택)</span></label><input type="number" min="0" className="form-input" value={profile.eaPerBox ?? ''} onChange={(e) => onProfilePatch({ eaPerBox: numericValue(e.target.value) })} placeholder="예: 20" /></div>
          <div className="form-group"><label className="form-label">포장 종류</label><select className="form-input" value={packageTypeSelection} onChange={(e) => { if (e.target.value === OTHER_PACKAGE_TYPE_VALUE) setForceCustomPackageType(true); else { setForceCustomPackageType(false); onProfilePatch({ packageType: e.target.value }); } }}><option value="">선택하세요</option>{SHIPPER_PACKAGE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}<option value={OTHER_PACKAGE_TYPE_VALUE}>기타</option></select>{packageTypeSelection === OTHER_PACKAGE_TYPE_VALUE && <input className="form-input shipper-custom-package-input" aria-label="기타 포장종류 직접 입력" value={profile.packageType ?? ''} maxLength={24} onChange={(e) => onProfilePatch({ packageType: e.target.value.toUpperCase().replace(/[^A-Z0-9 ./-]/g, '') })} placeholder="영문 포장종류 직접 입력 (예: SACK)" />}</div>
          <div className="form-group" data-field="weight"><label className="form-label">총중량 G.W. (kg)</label><input type="number" min="0" step="any" className="form-input" value={profile.grossWeight ?? ''} onChange={(e) => onProfilePatch({ grossWeight: numericValue(e.target.value), weight: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">순중량 N.W. (kg)</label><input type="number" min="0" step="any" className="form-input" value={profile.netWeight ?? ''} onChange={(e) => onProfilePatch({ netWeight: numericValue(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">CBM</label><input className="form-input" value={profile.measurement ?? ''} onChange={(e) => onProfilePatch({ measurement: e.target.value })} /></div>
          <div className="form-group">
            <label className="form-label">Shipping Marks <span className="optional-label">(선택)</span></label>
            <textarea className="form-input" rows={3} value={profile.shippingMarks ?? ''} readOnly={supplemental.hasNoShippingMarks} onChange={(e) => onProfilePatch({ shippingMarks: e.target.value })} />
            <label className="shipper-inline-checkbox"><input type="checkbox" checked={supplemental.hasNoShippingMarks} onChange={(event) => {
              const checked = event.target.checked;
              onSupplementalChange({
                ...supplemental,
                hasNoShippingMarks: checked,
                shippingMarksBeforeNoMarks: checked ? (profile.shippingMarks ?? '') : supplemental.shippingMarksBeforeNoMarks,
              });
              onProfilePatch({ shippingMarks: checked ? 'N/M' : supplemental.shippingMarksBeforeNoMarks });
            }} /> 화인 없음</label>
          </div>
        </div>
        {hasInvalidWeight && <div className="form-message error" role="alert">총중량 G.W.은 순중량 N.W.보다 작을 수 없습니다.</div>}
      </details>

      <details className="form-section">
        <summary className="form-section-summary">6. 항만 및 일정</summary>
        <div className="form-grid">
          <div className="form-group" data-field="loadPort"><label className="form-label">선적항 POL {profile.incoterms === 'FOB' && <Req />}</label><select className="form-input" value={loadPortSelection} onChange={(e) => { if (e.target.value === OTHER_DOMESTIC_PORT_VALUE) setForceCustomLoadPort(true); else { setForceCustomLoadPort(false); onProfilePatch({ loadPort: e.target.value }); } }}><option value="">선적항을 선택하세요</option>{EXPORT_POL_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_DOMESTIC_PORT_VALUE}>기타 국내항</option></select>{loadPortSelection === OTHER_DOMESTIC_PORT_VALUE && <input className="form-input shipper-custom-port-input" aria-label="기타 국내항 직접 입력" value={profile.loadPort} onChange={(e) => onProfilePatch({ loadPort: e.target.value })} placeholder="기타 국내항 직접 입력" />}</div>
          <div className="form-group" data-field="dischargePort"><label className="form-label">도착항 POD {(profile.incoterms === 'CIF' || profile.incoterms === 'CFR') && <Req />}</label><select className="form-input" value={dischargePortSelection} onChange={(e) => { if (e.target.value === OTHER_FOREIGN_PORT_VALUE) setForceCustomDischargePort(true); else { setForceCustomDischargePort(false); onProfilePatch({ dischargePort: e.target.value }); } }}><option value="">도착항을 선택하세요</option>{EXPORT_POD_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}<option value={OTHER_FOREIGN_PORT_VALUE}>기타 해외항</option></select>{dischargePortSelection === OTHER_FOREIGN_PORT_VALUE && <input className="form-input shipper-custom-port-input" aria-label="기타 해외항 직접 입력" value={profile.dischargePort} onChange={(e) => onProfilePatch({ dischargePort: e.target.value })} placeholder="기타 해외항 직접 입력" />}</div>
          <div className="form-group" data-field="departureDate"><label className="form-label">희망 출항일</label><input type="date" className="form-input" value={profile.departureDate} onChange={(e) => onProfilePatch({ departureDate: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">운송방식</label><select className="form-input" value={profile.loadingMode ?? ''} onChange={(e) => onProfilePatch({ loadingMode: e.target.value === '' ? undefined : e.target.value as TradeProfile['loadingMode'] })}><option value="">미정</option><option value="FCL">FCL</option><option value="LCL">LCL</option></select></div>
        </div>
      </details>

      <details className="form-section">
        <summary className="form-section-summary">7. 원산지 및 요건서류</summary>
        <div className="form-grid">
          <div className="form-group" data-field="countryOfOrigin"><label className="form-label">원산지 국가 <Req /></label><CountrySelect className="form-input" value={profile.countryOfOrigin ?? ''} onChange={(value) => onProfilePatch({ countryOfOrigin: value })} /></div>
          <div className="form-group"><label className="form-label">원산지 결정기준</label><select className="form-input" value={supplemental.originCriterion} onChange={(e) => onSupplementalChange({ ...supplemental, originCriterion: e.target.value as ShipperSupplementalState['originCriterion'] })}><option value="">선택하세요</option><option value="세번변경기준">세번변경기준</option><option value="부가가치기준">부가가치기준</option><option value="완전생산기준">완전생산기준</option></select></div>
          <div className="form-group"><span className="form-label">BOM 또는 원료명세서</span><input className="form-input" value="추후 첨부 지원 예정" disabled /></div>
          <div className="form-group"><span className="form-label">수출요건 확인서류</span><input className="form-input" value="추후 첨부 지원 예정" disabled /></div>
        </div>
      </details>

      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={handleResetClick}><RotateCcw size={16} /> 초기화</button>
        <button type="button" className="btn btn-primary" onClick={handleGenerateClick} disabled={isProcessing}><FileText size={16} />{isProcessing ? '생성 중...' : '필요 서류 자동 생성'}</button>
      </div>
    </div>
  );
}
