/**
 * 수입신고서(별지 제1호의3서식) 값 위치 — 서식 원본 이미지(2480x3505px, A4 300dpi) 기준 픽셀.
 *
 * 한 곳에서만 관리한다.
 * - docx 템플릿: scripts/generate-import-declaration-template.ts 가 이 좌표로 프레임을 만든다.
 * - 화면 미리보기: ImportDeclarationFormPreview 가 같은 좌표로 글자를 얹는다.
 * 칸 위치가 어긋나면 이 파일의 좌표만 고치고 템플릿을 다시 뽑으면 둘 다 맞는다.
 */
export interface ImportDeclarationFieldBox {
  /** 템플릿 {{placeholder}} 이름 */
  name: string;
  x: number;
  y: number;
  /** 칸 너비(px). 넘치면 글자가 줄어든다. */
  w: number;
}

/** 서식 원본 이미지 크기 */
export const IMPORT_DECLARATION_PAGE_PX = { width: 2480, height: 3505 } as const;

export const IMPORT_DECLARATION_FIELDS: ImportDeclarationFieldBox[] = [
  // ①~⑨ 신고 기본
  { name: 'decl_no', x: 300, y: 545, w: 600 },
  { name: 'decl_date', x: 700, y: 545, w: 420 },
  { name: 'customs_office', x: 1010, y: 545, w: 420 },
  { name: 'arrival_date', x: 1420, y: 545, w: 420 },
  { name: 'bl_no', x: 600, y: 640, w: 520 },
  { name: 'cargo_control_no', x: 930, y: 640, w: 420 },
  { name: 'warehouse_in_date', x: 1290, y: 640, w: 420 },
  { name: 'collect_type', x: 1780, y: 640, w: 420 },
  // ⑩~⑭ 당사자
  { name: 'declarant', x: 400, y: 740, w: 800 },
  { name: 'importer', x: 400, y: 840, w: 800 },
  { name: 'taxpayer_address', x: 640, y: 950, w: 700 },
  { name: 'taxpayer_company', x: 640, y: 1008, w: 700 },
  { name: 'taxpayer_tel', x: 760, y: 1063, w: 580 },
  { name: 'taxpayer_email', x: 790, y: 1118, w: 550 },
  { name: 'taxpayer_name', x: 640, y: 1172, w: 700 },
  { name: 'forwarder', x: 450, y: 1285, w: 900 },
  { name: 'overseas_partner', x: 500, y: 1375, w: 800 },
  { name: 'master_bl', x: 1500, y: 1375, w: 560 },
  { name: 'carrier_code', x: 2080, y: 1375, w: 380 },
  { name: 'inspect_place', x: 560, y: 1462, w: 900 },
  // ⑮~㉖ 통관·운송
  { name: 'clearance_plan', x: 1310, y: 740, w: 300 },
  { name: 'co_yn', x: 1640, y: 740, w: 340 },
  { name: 'total_weight', x: 2010, y: 740, w: 440 },
  { name: 'decl_kind', x: 1310, y: 840, w: 300 },
  { name: 'price_decl_yn', x: 1640, y: 840, w: 340 },
  { name: 'total_packages', x: 2010, y: 840, w: 440 },
  { name: 'trade_kind', x: 1310, y: 930, w: 300 },
  { name: 'arrival_port', x: 1700, y: 930, w: 400 },
  { name: 'transport_type', x: 2120, y: 930, w: 340 },
  { name: 'goods_kind', x: 1230, y: 1085, w: 380 },
  { name: 'shipping_country', x: 1620, y: 1035, w: 700 },
  { name: 'vessel_name', x: 1620, y: 1150, w: 800 },
  // ㉚~㊺ 품목(갑지 1란)
  { name: 'first_goods_name', x: 450, y: 1650, w: 1000 },
  { name: 'first_brand', x: 1540, y: 1650, w: 800 },
  { name: 'first_trade_goods_name', x: 450, y: 1715, w: 1000 },
  { name: 'first_model_spec', x: 300, y: 1830, w: 320 },
  { name: 'first_composition', x: 640, y: 1830, w: 380 },
  { name: 'first_spec_qty', x: 1060, y: 1830, w: 360 },
  { name: 'first_unit_price', x: 1450, y: 1830, w: 380 },
  { name: 'first_amount', x: 1870, y: 1830, w: 500 },
  { name: 'first_hs_code', x: 620, y: 1928, w: 500 },
  { name: 'first_net_weight', x: 1250, y: 1935, w: 300 },
  { name: 'first_post_check_org', x: 1900, y: 1960, w: 480 },
  { name: 'first_customs_value_usd', x: 600, y: 2035, w: 460 },
  { name: 'first_qty', x: 1120, y: 2035, w: 380 },
  { name: 'first_customs_value_krw', x: 600, y: 2120, w: 460 },
  { name: 'first_refund_qty', x: 1140, y: 2120, w: 340 },
  { name: 'first_origin', x: 1520, y: 2120, w: 320 },
  { name: 'first_special_tax_basis', x: 1900, y: 2120, w: 460 },
  { name: 'first_tax_type', x: 260, y: 2395, w: 260 },
  { name: 'first_tax_rate', x: 560, y: 2395, w: 240 },
  { name: 'first_reduction_rate', x: 820, y: 2395, w: 220 },
  { name: 'first_tax_amount', x: 1060, y: 2395, w: 360 },
  // (52)~(62) 금액
  { name: 'payment_amount', x: 1150, y: 2498, w: 700 },
  { name: 'exchange_rate', x: 1900, y: 2512, w: 460 },
  { name: 'total_customs_value_usd', x: 610, y: 2590, w: 300 },
  { name: 'freight', x: 950, y: 2585, w: 300 },
  { name: 'addition_amount', x: 1460, y: 2585, w: 340 },
  { name: 'total_customs_value_krw', x: 610, y: 2645, w: 300 },
  { name: 'insurance', x: 1000, y: 2640, w: 260 },
  { name: 'deduction_amount', x: 1460, y: 2640, w: 340 },
  { name: 'total_vat_base', x: 1800, y: 2645, w: 560 },
  // (59)(61) 세액
  { name: 'tax_customs', x: 540, y: 2760, w: 300 },
  { name: 'tax_excise', x: 540, y: 2815, w: 300 },
  { name: 'tax_traffic', x: 540, y: 2868, w: 300 },
  { name: 'tax_liquor', x: 540, y: 2922, w: 300 },
  { name: 'tax_education', x: 540, y: 2975, w: 300 },
  { name: 'tax_rural', x: 540, y: 3028, w: 300 },
  { name: 'tax_vat', x: 540, y: 3081, w: 300 },
  { name: 'tax_late_penalty', x: 540, y: 3134, w: 300 },
  { name: 'tax_no_decl_penalty', x: 540, y: 3188, w: 300 },
  { name: 'total_tax', x: 540, y: 3243, w: 300 },
];
