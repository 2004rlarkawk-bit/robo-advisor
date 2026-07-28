import { useEffect, useState, type ReactNode } from 'react';
import {
  INCOTERM_OPTIONS,
  type ServiceRole,
  type UserProfile,
  type UserProfileUpdate,
} from '../services/profileService';
import { normalizeCountryValue } from '../constants/countries';
import { DISCHARGE_PORT_OPTIONS, LOAD_PORT_OPTIONS, normalizePortValue } from '../constants/ports';
import CountrySelect from './CountrySelect';

interface Props { profile: UserProfile; submitLabel: string; isSaving: boolean; onSubmit: (values: UserProfileUpdate) => Promise<void>; requireExplicitServiceRole?: boolean; secondaryAction?: ReactNode; }

// 2026-07-23 편의성 업그레이드: 온보딩 및 프로필 서비스 이용 목적 선택
const SERVICE_ROLE_OPTIONS: { value: ServiceRole; label: string; description: string }[] = [
  {
    value: 'shipper',
    label: '화주',
    description: '수출입 거래정보와 품목, 거래처 및 포장정보를 입력하여 필요한 무역서류를 생성합니다.',
  },
  {
    value: 'forwarder',
    label: '포워더',
    description: '화주에게 전달받은 서류를 바탕으로 선복예약, 부킹, 컨테이너 및 B/L 정보를 관리합니다.',
  },
  {
    value: 'integrated',
    label: '화주·포워더 통합',
    description: '화주용 작업과 포워더용 작업을 모두 사용할 수 있습니다.',
  },
];

const formValues = (p: UserProfile, requireExplicitServiceRole: boolean): UserProfileUpdate => ({
  company_name: p.company_name ?? '', company_address: p.company_address ?? '', business_number: p.business_number ?? '', customs_clearance_code: p.customs_clearance_code ?? '', contact_name: p.contact_name ?? '',
  phone: p.phone ?? '', country: normalizeCountryValue(p.country),
  default_load_port: normalizePortValue(p.default_load_port), default_discharge_port: normalizePortValue(p.default_discharge_port), default_incoterm: p.default_incoterm ?? '',
  service_role: requireExplicitServiceRole ? undefined : p.service_role,
});

export default function ProfileForm({ profile, submitLabel, isSaving, onSubmit, requireExplicitServiceRole = false, secondaryAction }: Props) {
  const [values, setValues] = useState<UserProfileUpdate>(() => formValues(profile, requireExplicitServiceRole));
  const [message, setMessage] = useState('');
  useEffect(() => setValues(formValues(profile, requireExplicitServiceRole)), [profile, requireExplicitServiceRole]);
  const set = (field: keyof UserProfileUpdate, value: string) => setValues((v) => ({ ...v, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    if (!values.service_role) {
      setMessage('서비스 이용 목적을 선택해 주세요.'); return;
    }
    if (!values.company_name?.trim()) {
      setMessage('공식 영문 회사명은 필수 정보입니다.'); return;
    }
    if (requireExplicitServiceRole && (!values.contact_name?.trim() || !values.phone?.trim() || !values.country?.trim())) {
      setMessage('담당자명, 회사 연락처, 국가는 필수 정보입니다.'); return;
    }
    try { await onSubmit(values); } catch (e) { setMessage(e instanceof Error ? e.message : '프로필을 저장하지 못했습니다.'); }
  };
  return (
    <form className={'profile-form'} onSubmit={submit}>
      <section className={'profile-form-section'}>
        <div className={'profile-section-heading'}><h2>기본 정보</h2><p>영문 무역서류에 그대로 사용할 공식 영문 정보를 입력해 주세요. 회사명은 AI 번역명이 아닌 등록된 공식 명칭을 사용해야 합니다.</p></div>
        <div className={'profile-form-grid'}>
          <label className={'login-input-group'}><span className={'login-label'}>회사명 <b>*</b></span><input className={'login-input'} value={values.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} placeholder={'ABC Logistics Co., Ltd.'} required /><small className="auth-helper-message">공식 영문 회사명을 입력하세요.</small></label>
          <label className={'login-input-group'}><span className={'login-label'}>회사 주소</span><input className={'login-input'} value={values.company_address ?? ''} onChange={(e) => set('company_address', e.target.value)} placeholder={'123 Teheran-ro, Gangnam-gu, Seoul, South Korea'} /></label>
          <label className={'login-input-group'}><span className={'login-label'}>담당자명 {requireExplicitServiceRole && <b>*</b>}</span><input className={'login-input'} value={values.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} placeholder={'Gildong Hong'} required={requireExplicitServiceRole} /></label>
          <label className={'login-input-group'}><span className={'login-label'}>회사 연락처 {requireExplicitServiceRole && <b>*</b>}</span><input className={'login-input'} type={'tel'} value={values.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder={'+82-2-1234-5678'} required={requireExplicitServiceRole} /></label>
          <div className={'login-input-group'}><span className={'login-label'}>국가 {requireExplicitServiceRole && <b>*</b>}</span><CountrySelect className="login-input" value={values.country ?? ''} onChange={(value) => set('country', value)} required={requireExplicitServiceRole} /></div>
          <label className={'login-input-group profile-grid-wide'}><span className={'login-label'}>사업자등록번호</span><input className={'login-input'} value={values.business_number ?? ''} onChange={(e) => set('business_number', e.target.value)} placeholder={'123-45-67890'} /></label>
          <label className={'login-input-group profile-grid-wide'}><span className={'login-label'}>통관고유부호</span><input className={'login-input'} value={values.customs_clearance_code ?? ''} onChange={(e) => set('customs_clearance_code', e.target.value)} placeholder={'P123456789012'} /><small className="auth-helper-message">선택 입력 항목입니다.</small></label>
        </div>
      </section>
      <section className={'profile-form-section'}>
        <div className={'profile-section-heading'}><h2>서비스 이용 목적 {requireExplicitServiceRole && <b>*</b>}</h2></div>
        <div className={'ob-pill-group service-role-options'} role={'radiogroup'} aria-label={'서비스 이용 목적'} aria-required={'true'}>
          {SERVICE_ROLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type={'button'}
              role={'radio'}
              aria-checked={values.service_role === option.value}
              className={`ob-pill service-role-option ${values.service_role === option.value ? 'selected' : ''}`}
              onClick={() => set('service_role', option.value)}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className={'profile-form-section'}>
        <div className={'profile-section-heading'}><h2>기본 거래 정보</h2><p>새 거래를 시작할 때 자동 입력되며 거래별로 바꿀 수 있습니다.</p></div>
        <div className={'profile-form-grid profile-trade-grid'}>
          <label className={'login-input-group'}><span className={'login-label'}>기본 선적항</span><select className={'login-input'} value={values.default_load_port ?? ''} onChange={(e) => set('default_load_port', e.target.value)}><option value={''}>선적항을 선택하세요</option>{LOAD_PORT_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}</select></label>
          <label className={'login-input-group'}><span className={'login-label'}>기본 도착항</span><select className={'login-input'} value={values.default_discharge_port ?? ''} onChange={(e) => set('default_discharge_port', e.target.value)}><option value={''}>도착항을 선택하세요</option>{DISCHARGE_PORT_OPTIONS.map((port) => <option key={port.value} value={port.value}>{port.label}</option>)}</select></label>
          <label className={'login-input-group'}><span className={'login-label'}>기본 Incoterms</span><select className={'login-input'} value={values.default_incoterm ?? ''} onChange={(e) => set('default_incoterm', e.target.value)}><option value={''}>선택 안 함</option>{INCOTERM_OPTIONS.map((incoterm) => <option key={incoterm} value={incoterm}>{incoterm}</option>)}</select></label>
        </div>
      </section>
      {message && <div className={'form-message error'} role={'alert'}>{message}</div>}
      <div className={'profile-actions'}>
        <button type={'submit'} className={'login-btn-primary profile-submit'} disabled={isSaving}>{isSaving ? '저장 중...' : submitLabel}</button>
        {secondaryAction}
      </div>
    </form>
  );
}
