# UI/DB 필드 흐름 분석

이 문서는 2026-07-23 UI 개편 후의 현재 코드 연결을 기준으로 작성했다. `화면 전용`은 현재 `TradeProfile` 또는 보조 React 상태에만 존재하며 Supabase 저장 서비스에는 아직 연결되지 않았다는 뜻이다.

## 전체 필드 연결표

| 화면 항목 | 실제 코드 필드명 | TypeScript 타입 | 저장 위치 | DB 컬럼 또는 JSON key | 조회 여부 | 문서 생성 사용 여부 | 필요 여부 |
|---|---|---|---|---|---|---|---|
| 프로필 이메일 | `email` | `string` | 회원 프로필 | `user_profiles.email` | 예 | 아니요 | 필수 |
| 회사명 | `company_name` / `companyName` | `string \| null` / `string` | 프로필, 거래 JSON | `user_profiles.company_name`, `profile.companyName` | 예 | 예, Seller/Exporter | 필수 |
| 회사 주소 | `company_address` / `companyAddress` | `string \| null` / `string?` | 프로필, 거래 JSON | `user_profiles.company_address`, `profile.companyAddress` | 예 | 예, Seller/Exporter | 신규 필요 |
| 담당자명 | `contact_name` / `contactName` | `string \| null` / `string?` | 프로필, 거래 JSON | `user_profiles.contact_name`, `profile.contactName` | 예 | 서명자 기본값에 사용 | 유지 |
| 연락처 | `phone` / `contact` | `string \| null` / `string` | 프로필, 거래 JSON | `user_profiles.phone`, `profile.contact` | 예 | 예 | 유지 |
| 사업자등록번호 | `business_number` / `businessRegistrationNo` | `string \| null` / `string?` | 프로필, 거래 JSON | `user_profiles.business_number`, `profile.businessRegistrationNo` | 예 | 예 | 유지 |
| 통관고유부호 | `customs_clearance_code` | `string \| null` | 회원 프로필 | `user_profiles.customs_clearance_code` | 예 | 아니요 | 신규 필요 |
| 회사 국가 | `country` / `companyCountry` | `string \| null` / `string?` | 프로필, 거래 JSON | `user_profiles.country`, `profile.companyCountry` | 예 | 예 | 유지 |
| 회원 서비스 역할 | `service_role` | `ServiceRole` | 회원 프로필 | `user_profiles.service_role` | 예 | 아니요, 화면 분기 사용 | 신규 필요 |
| 보안 역할 | `role` | `string` | 회원 프로필 | `user_profiles.role` | 예 | 아니요 | 유지 |
| 기본 선적항 | `default_load_port` / `loadPort` | `string \| null` / `string` | 프로필, 거래 JSON | `user_profiles.default_load_port`, `profile.loadPort` | 예 | 예 | 유지 |
| 기본 도착항 | `default_discharge_port` / `dischargePort` | `string \| null` / `string` | 프로필, 거래 JSON | `user_profiles.default_discharge_port`, `profile.dischargePort` | 예 | 예 | 유지 |
| 기본 Incoterms | `default_incoterm` / `incoterms` | `string \| null` / `Incoterms` | 프로필, 거래 JSON | `user_profiles.default_incoterm`, `profile.incoterms` | 예 | 예 | 유지 |
| Buyer 회사명 | `buyerName` | `string?` | 거래/초안 JSON | `profile.buyerName` | 예 | 예, Invoice | 유지 |
| Buyer 주소 | `buyerAddress` | `string?` | 거래/초안 JSON | `profile.buyerAddress` | 예 | 예, Invoice | 유지 |
| Buyer 국가 | `buyerCountry` | `string?` | 거래/초안 JSON | `profile.buyerCountry` | 예 | 예 | 유지 |
| Consignee 회사명/주소/국가 | `partnerName/partnerAddress/partnerCountry` | `string?` | 거래/초안 JSON | 같은 이름의 `profile` key | 예 | 예 | 유지 |
| Notify Party | `notifyPartyName/notifyPartyAddress` | `string?` | 거래/초안 JSON | 같은 이름의 `profile` key | 예 | B/L 관련 데이터에 사용 | 유지 |
| 품명 | `itemName` | `string` | 거래/초안 JSON | `profile.itemName` | 예 | 예, Invoice/Packing List/CO | 필수 |
| HS Code | `hsCode` | `string` | 거래/초안 JSON | `profile.hsCode` | 예 | 예 | 유지 |
| 대표 품목 수량/단위/단가/통화 | `quantity/unit/unitPrice/currency` | `NumericInput/string` | 거래/초안 JSON | 같은 이름의 `profile` key | 예 | 예 | 유지 |
| 추가 품목 | `additionalShipperItems` | `ShipperItem[]` | React state | 없음 | 아니요 | 현재 대표 품목만 사용 | 신규 필요 |
| 결제조건 | `paymentTerms` | `string?` | 거래/초안 JSON | `profile.paymentTerms` | 예 | 예, Invoice | 유지 |
| Incoterms 지정 장소 | `incotermsPlace` | `string` | React 보조 상태 | 없음 | 아니요 | 아니요 | 신규 필요 |
| 포장/중량/CBM | `packageCount/packageType/grossWeight/netWeight/measurement` | `NumericInput/string?` | 거래/초안 JSON | 같은 이름의 `profile` key | 예 | 예, Packing List | 유지 |
| Shipping Marks | `shippingMarks` | `string?` | 거래/초안 JSON | `profile.shippingMarks` | 예 | 예, Packing List | 유지 |
| 원산지 | `countryOfOrigin` | `string?` | 거래/초안 JSON | `profile.countryOfOrigin` | 예 | 예, CO | 유지 |
| 원산지 결정기준 | `originCriterion` | `string` | React 보조 상태 | 없음 | 아니요 | 아니요 | 신규 필요 |
| 포워더 입력 전체 | `ForwarderFormState` | 별도 interface | React state | 없음 | 아니요 | 아니요 | 신규 필요 |
| 거래 입력 스냅샷 | `profile` | `TradeProfile` | 거래/초안 | `trades.profile`, `trade_drafts.profile` | 예 | 예 | 필수 |
| 문서 진행 상태 | `documents` | `DocumentStatus[]` | 거래 | `trades.documents` | 예 | 상태 표시용 | 유지 |
| 생성 문서 데이터 | `generatedDocs` | `GeneratedDocuments` | 거래 | `trades.generated_docs` | 예 | 생성 결과 자체 | 유지 |
| 검증 이슈 | `issues` | `ValidationIssue[]` | 거래 | `trades.issues` | 예 | 검증/보완에 사용 | 유지 |
| 거래 상태 | `status` | `TradeStatus` | 거래 | `trades.status` | 예 | 아니요 | 유지 |

## 회원 프로필

| 화면 항목 | UI/TypeScript 필드 | 현재 DB 컬럼 | 저장/복원 경로 | 판정 |
|---|---|---|---|---|
| 이메일 | `email` | `user_profiles.email` | Auth 회원가입 → 가입 트리거 → 프로필 조회 | 유지 |
| 회사명 | `company_name` | `user_profiles.company_name` | 회원가입/온보딩/프로필 설정 → `updateUserProfile` → 거래 기본값 `companyName` | 유지 |
| 회사 주소 | `company_address` | `user_profiles.company_address` | 온보딩/프로필 설정 → 프로필 조회 → 거래 기본값 `companyAddress` | 신규 추가, 마이그레이션 적용 여부 확인 필요 |
| 담당자명 | `contact_name` | `user_profiles.contact_name` | 회원가입/프로필 설정 → 거래 기본값 `contactName`, `signedBy` | 유지 |
| 연락처 | `phone` | `user_profiles.phone` | 프로필 설정 → 거래 기본값 `contact` | 유지 |
| 사업자등록번호 | `business_number` | `user_profiles.business_number` | 프로필 설정 → 거래 기본값 `businessRegistrationNo`, `taxNo` | 유지 |
| 통관고유부호 | `customs_clearance_code` | `user_profiles.customs_clearance_code` | 프로필 설정 조회·수정 | 신규 추가, 선택 입력 |
| 국가 | `country` | `user_profiles.country` | 공통 영문 국가 선택 → 프로필 저장 → 거래 기본값 `companyCountry` | 유지, 기존 한글 값 정규화 필요 |
| 서비스 이용 목적 | `service_role` | `user_profiles.service_role` | 온보딩/프로필 설정 → 프로필 상태 갱신 → 통관 작업 역할 분기 | 신규 추가, 필수 유지 |
| 기본 선적항 | `default_load_port` | `user_profiles.default_load_port` | 프로필 설정 → 거래 기본값 `loadPort` | 유지, 영문 value 사용 |
| 기본 도착항 | `default_discharge_port` | `user_profiles.default_discharge_port` | 프로필 설정 → 거래 기본값 `dischargePort` | 유지, 영문 value 사용 |
| 기본 Incoterms | `default_incoterm` | `user_profiles.default_incoterm` | 프로필 설정 → 거래 기본값 `incoterms` | 유지 |
| 보안 역할 | `role` | `user_profiles.role` | 가입 트리거/관리자 권한 판정 | `service_role`과 의미가 다르므로 유지 |

## 화주 통관 입력

| 화면 항목 | 현재 상태 필드 | 최종 거래 저장 위치 | 판정 |
|---|---|---|---|
| 화주 회사명/주소/연락처/사업자번호 | `TradeProfile.companyName/companyAddress/contact/businessRegistrationNo` | `trades.profile`, `trade_drafts.profile` | 프로필 기본값에서 복사, 유지 |
| 통관고유부호 | `user_profiles.customs_clearance_code` | 프로필에서만 조회·수정 | 화주 입력폼에서는 표시하지 않음 |
| Buyer 회사명/주소/국가 | `buyerName/buyerAddress/buyerCountry` | JSON `profile` | 국가 공통 select 및 Other 직접 입력 적용 |
| Consignee 회사명/주소/국가 | `partnerName/partnerAddress/partnerCountry` | JSON `profile` | Buyer 동일 체크 시 동기화 |
| Notify Party | `notifyPartyName/notifyPartyAddress` | JSON `profile` | Consignee 동일 체크 시 동기화 |
| 대표 품목 | `itemName/hsCode/quantity/unit/unitPrice/currency` | JSON `profile` | 기존 문서 생성 및 HS 추천 연결 유지 |
| 추가 품목 배열 | `ShipperItem[]` | 현재 없음 | 화면 전용; 저장 서비스 개편 전까지 저장 안 됨 |
| 품목 금액/Invoice 총액 | 품목 값에서 계산 | 현재 없음 | 파생값; 다중 통화는 합산하지 않음 |
| Incoterms/결제조건/지정 장소 | `incoterms/paymentTerms`, 보조 상태 `incotermsPlace` | 앞 두 필드는 JSON, 지정 장소는 화면 전용 | 일부 화면 전용 |
| 포장 수량/종류/중량/CBM | `packageCount/packageType/grossWeight/netWeight/measurement` | JSON `profile` | 유지 |
| POL/POD/출항일 | `loadPort/dischargePort/departureDate` | JSON `profile` | 공통 영문 항만 value 사용 |
| 원산지 국가 | `countryOfOrigin` | JSON `profile` | 공통 영문 국가 선택 적용 |
| 원산지 결정기준 | 보조 상태 `originCriterion` | 현재 없음 | 화면 전용 |
| BOM/요건서류 첨부 | 보조 UI 상태 없음 | 없음 | Storage 미연결, 비활성 안내만 표시 |

## 포워더 통관 입력

| 화면 항목군 | 현재 상태 필드 | 최종 거래 저장 위치 | 판정 |
|---|---|---|---|
| 원천서류 업로드 | 없음 | 없음 | Storage 미연결, 준비 중 안내만 표시 |
| S/R Shipper/Consignee/신고필증번호 | `ForwarderFormState` | 없음 | 화면 전용 |
| Carrier/Vessel/Voyage/POL/POD/ETD/ETA | `ForwarderFormState` | 없음 | 화면 전용; 항만은 공통 영문 value |
| Booking No./상태 | `ForwarderFormState.bookingNo/bookingStatus` | 없음 | 화면 전용; `trades.status`와 별도 |
| B/L Notify/적재방식/컨테이너/Seal | `ForwarderFormState` | 없음 | 화면 전용; FCL 조건부 입력 |
| 화물명세 | `ForwarderFormState` | 없음 | 화면 전용 |

## 거래 저장 및 복원

| 코드 개념 | DB 컬럼 | 쓰기/읽기 흐름 | 판정 |
|---|---|---|---|
| 거래 입력 스냅샷 | `trades.profile jsonb` | 문서 생성 시 `createGeneratedTrade`, 재생성 시 `updateGeneratedTrade`, 조회 시 `mapTradeRow` | 유지 |
| 작성 중 초안 | `trade_drafts.profile jsonb` | 자동 저장 `upsert`, 로그인 복원 시 localStorage와 최신 시각 비교 | 유지 |
| 문서 진행 상태 | `trades.documents jsonb` | `DocumentStatus[]` 저장/조회 | 유지 |
| 생성 문서 본문 | `trades.generated_docs jsonb` | Invoice/Packing List/CO/보험 및 HTML 템플릿 저장 | 유지 |
| 검증 결과 | `trades.issues jsonb` | 생성/재생성/최종 제출 시 저장 | 유지 |
| 거래 상태 | `trades.status` | `generated` → `submitted` | 유지 |
| 생성/제출 시각 | `generated_at/submitted_at` | 서비스에서 명시적으로 기록 | 유지 |

`documents`와 `generated_docs`는 이름은 비슷하지만 각각 상태 목록과 생성 결과 본문이므로 통합하거나 삭제하면 안 된다.

## 후속 데이터 마이그레이션 필요 항목

- 기존 `user_profiles.country`의 한글 국가명은 공통 영문 value로 일괄 변환해야 한다.
- `default_load_port`, `default_discharge_port` 및 저장된 JSON의 항만 한글 값도 같은 영문 value로 변환해야 한다.
- `company_address`, `service_role`의 실제 원격 적용 여부를 확인하고 미적용이면 기존 비파괴 마이그레이션을 실행해야 한다.
- 화면 전용인 화주 추가 품목과 포워더 입력 상태를 영속화하려면 `TradeProfile` JSON 계약과 저장/복원 서비스를 함께 버전 관리해야 한다.
