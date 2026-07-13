import { useEffect, useState } from 'react';
import { INCOTERM_OPTIONS, INDUSTRY_OPTIONS, TRADE_PURPOSE_OPTIONS, type UserProfile, type UserProfileUpdate } from '../services/profileService';
import { DISCHARGE_PORT_OPTIONS, LOAD_PORT_OPTIONS } from '../constants/portOptions';

interface Props { profile: UserProfile; submitLabel: string; isSaving: boolean; onSubmit: (values: UserProfileUpdate) => Promise<void>; }
const formValues = (p: UserProfile): UserProfileUpdate => ({
  company_name: p.company_name ?? '', business_number: p.business_number ?? '', contact_name: p.contact_name ?? '',
  phone: p.phone ?? '', country: p.country ?? '', industry: p.industry ?? '', trade_purpose: p.trade_purpose ?? '',
  default_load_port: p.default_load_port ?? '', default_discharge_port: p.default_discharge_port ?? '', default_incoterm: p.default_incoterm ?? '',
});

export default function ProfileForm({ profile, submitLabel, isSaving, onSubmit }: Props) {
  const [values, setValues] = useState<UserProfileUpdate>(() => formValues(profile));
  const [message, setMessage] = useState('');
  useEffect(() => setValues(formValues(profile)), [profile]);
  const set = (field: keyof UserProfileUpdate, value: string) => setValues((v) => ({ ...v, [field]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    if (!values.company_name?.trim() || !values.trade_purpose?.trim() || !values.industry?.trim()) {
      setMessage('회사명, 주요 사용 목적, 업종은 필수 정보입니다.'); return;
    }
    try { await onSubmit(values); } catch (e) { setMessage(e instanceof Error ? e.message : '프로필을 저장하지 못했습니다.'); }
  };
  return (
    <form className={'profile-form'} onSubmit={submit}>
      <section className={'profile-form-section'}>
        <div className={'profile-section-heading'}><h2>기본 정보</h2><p>문서와 거래 정보에 기본으로 사용됩니다.</p></div>
        <div className={'profile-form-grid'}>
          <label className={'login-input-group'}><span className={'login-label'}>회사명 <b>*</b></span><input className={'login-input'} value={values.company_name ?? ''} onChange={(e) => set('company_name', e.target.value)} placeholder={'예: 인천테크'} required /></label>
          <label className={'login-input-group'}><span className={'login-label'}>담당자명</span><input className={'login-input'} value={values.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} placeholder={'예: 김지민'} /></label>
          <label className={'login-input-group'}><span className={'login-label'}>연락처</span><input className={'login-input'} type={'tel'} value={values.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder={'예: 010-1234-5678'} /></label>
          <label className={'login-input-group'}><span className={'login-label'}>국가</span><input className={'login-input'} value={values.country ?? ''} onChange={(e) => set('country', e.target.value)} placeholder={'예: 대한민국'} /></label>
          <label className={'login-input-group profile-grid-wide'}><span className={'login-label'}>사업자등록번호</span><input className={'login-input'} value={values.business_number ?? ''} onChange={(e) => set('business_number', e.target.value)} placeholder={'예: 123-45-67890'} /></label>
        </div>
      </section>
      <section className={'profile-form-section'}>
        <div className={'profile-section-heading'}><h2>업무 설정</h2><p>주요 업무에 맞춰 거래 유형의 기본값을 설정합니다.</p></div>
        <div className={'login-input-group'}>
          <span className={'login-label'}>주요 사용 목적 <b>*</b></span>
          <div className={'ob-pill-group'}>{TRADE_PURPOSE_OPTIONS.map((option) => <button key={option.value} type={'button'} className={`ob-pill ${values.trade_purpose === option.value ? 'selected' : ''}`} onClick={() => set('trade_purpose', option.value)}>{option.label}</button>)}</div>
        </div>
        <label className={'login-input-group'}><span className={'login-label'}>업종 <b>*</b></span><select className={'login-input'} value={values.industry ?? ''} onChange={(e) => set('industry', e.target.value)} required><option value={''}>업종을 선택해 주세요</option>{INDUSTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
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
      <button type={'submit'} className={'login-btn-primary profile-submit'} disabled={isSaving}>{isSaving ? '저장 중...' : submitLabel}</button>
    </form>
  );
}
