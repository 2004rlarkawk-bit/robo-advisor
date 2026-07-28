import { Agent, DocumentResult, HSCodeResult, AgentLog, createLog } from './types';
import { TradeProfile, GeneratedDocuments, InvoiceData, PackingListData, CertificateOfOriginData, InsuranceData } from '../types';
import { determineRequiredDocuments } from '../harness/rulesEngine';
import { autoFillDocumentFields } from '../services/claudeService';
import { isLcPayment } from './paymentTerms';
import { renderCertificateOfOriginHTML } from './templates/co';
import { renderInsuranceHTML } from './templates/insurance';

export class DocumentAgent implements Agent<{ profile: TradeProfile; hsResult: HSCodeResult; useLLM?: boolean; logs: AgentLog[] }, DocumentResult> {
  readonly name = 'Document Agent';

  async run(input: { profile: TradeProfile; hsResult: HSCodeResult; useLLM?: boolean; logs: AgentLog[] }): Promise<DocumentResult> {
    const { profile, hsResult, useLLM = false, logs } = input;
    const generatedDocs: GeneratedDocuments = {};

    logs.push(createLog(this.name, '거래 정보 및 HS Code 분석을 기반으로 문서 판별 및 데이터 조립 시작...', 'info'));
    logs.push(createLog(this.name, `수출입 유형: ${profile.tradeType === 'export' ? '수출' : '수입'}`, 'info'));
    logs.push(createLog(this.name, `거래조건: ${profile.incoterms || '미지정'} | 경로: ${profile.loadPort || '미지정'} → ${profile.dischargePort || '미지정'}`, 'info'));

    // 1. 필요 서류 판별 (rulesEngine 위임)
    const requiredDocs = determineRequiredDocuments(profile);
    logs.push(createLog(this.name, `필요 서류 ${requiredDocs.length}건 식별 완료`, 'success'));

    // 건(shipment) 단위 안정 식별자 — profile.documentNo(App에서 생성·영속, 재생성 시 재사용)에서 파생한다.
    // 모든 서류번호(INV/PL/CO/INS)를 이 하나의 시퀀스로 만들어 4개 서류가 같은 건을 참조하고,
    // 재생성해도 번호가 유지되게 한다. documentNo 없을 때(테스트/직접 호출)만 실행당 1회 Date.now() 폴백.
    const shipMatch = (profile.documentNo || '').match(/(\d{4})(\d{2})(\d{2})-(\d{6})/);
    const shipYear = shipMatch ? shipMatch[1] : String(new Date().getFullYear());
    const shipSeq = shipMatch ? shipMatch[4] : String(Date.now()).slice(-6);
    const docNo = (prefix: string) => `${prefix}-${shipYear}-${shipSeq}`;

    // 2. LLM으로 품목 설명 자동 생성 (옵션)
    // 기본값은 지어내지 않는다 — 품목 설명은 사용자 입력(itemName) 그대로, 통화는 UI 셀렉터 기본(KRW)과 일치.
    let itemDescription = profile.itemName;
    let paymentTerms = profile.paymentTerms || '';
    let currency = 'USD';

    if (useLLM && profile.itemName) {
      logs.push(createLog(this.name, 'Claude AI에 품목 설명 및 거래 조건 자동 생성 요청 중...', 'info'));
      try {
        const autoFill = await autoFillDocumentFields({
          itemName: profile.itemName,
          companyName: profile.companyName,
          tradeType: profile.tradeType
        });
        itemDescription = autoFill.itemDescription;
        paymentTerms = autoFill.paymentTerms;
        currency = autoFill.currency;
        logs.push(createLog(this.name, `AI 자동 생성 완료 — 품목: "${itemDescription}"`, 'success'));
      } catch (e) {
        logs.push(createLog(this.name, `AI 호출 실패, 기본값 사용: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, 'warning'));
      }
    }

    // L/C 필드 파생 — 결제조건이 신용장(L/C)이 아니면 강제 공란 처리한다.
    // (근본 원인: L/C 정보를 결제방식과 무관하게 그대로 흘려보내면 T/T 거래에 lc_no/은행이 남는다.
    //  파생 단계에서 결제조건을 기준으로 차단해, 두 문서(인보이스·패킹리스트)가 항상 일관되게 한다.)
    const isLc = isLcPayment(paymentTerms);
    const lcNo = isLc ? (profile.lcNo || '').trim() : '';
    const lcDate = isLc ? (profile.lcDate || '').trim() : '';
    const lcBank = isLc ? (profile.lcBank || '').trim() : '';

    // 3. Invoice 데이터 조립
    const invoiceDoc = requiredDocs.find(d => d.id === 'invoice');
    if (invoiceDoc && invoiceDoc.status !== 'not_needed') {
      logs.push(createLog(this.name, '상업송장(Invoice) 데이터 조립 중...', 'info'));
      
      const quantity = Number(profile.quantity) || 0;
      // 단가·총액은 사용자 입력만 사용한다 — 가격을 지어내지 않는다(단가 추정 제거).
      // 미입력이면 0으로 두고, 누락은 validatorEngine이 막는다.
      // 총액만 단가×수량으로 파생(사용자가 총액을 안 넣었을 때) — 실입력 단가 기반이라 정합성 유지.
      const unitPrice = Number(profile.unitPrice) || 0;
      const totalAmount = Number(profile.totalAmount) || Math.round(unitPrice * quantity * 100) / 100;

      const invoiceDate = profile.invoiceDate || new Date().toISOString().split('T')[0];
      // 당사자 정보는 프로필 실입력값만 사용한다 — 미입력이면 빈 문자열(양식에서 빈 칸으로 렌더).
      // 가짜 상호/주소("Overseas Supplier", "Seoul..." 등)를 지어내지 않는다. 누락은 validatorEngine이 막는다.
      const exporterParty = {
        name: profile.tradeType === 'export' ? (profile.companyName || '') : (profile.partnerName || ''),
        address: profile.tradeType === 'export' ? (profile.companyAddress || '') : (profile.partnerAddress || ''),
        contact: profile.tradeType === 'export' ? (profile.contact || '') : (profile.partnerContact || '')
      };
      const importerParty = {
        name: profile.tradeType === 'import' ? (profile.companyName || '') : (profile.partnerName || ''),
        address: profile.tradeType === 'import' ? (profile.companyAddress || '') : (profile.partnerAddress || ''),
        contact: profile.tradeType === 'import' ? (profile.contact || '') : (profile.partnerContact || '')
      };
      const invGrossWeight = Number(profile.grossWeight || profile.weight) || 0;
      // 순중량은 실측 신고값 — 추정 금지(총중량×0.9 제거). 미입력이면 0(공란 렌더).
      const invNetWeight = Number(profile.netWeight) || 0;

      const invoice: InvoiceData = {
        invoiceNo: profile.invoiceNo || docNo('INV'),
        invoiceDate,
        date: invoiceDate, // 템플릿 호환용 별칭
        seller: exporterParty,
        consignee: importerParty,
        exporter: exporterParty, // 템플릿 호환용 별칭
        importer: importerParty, // 템플릿 호환용 별칭
        departureDate: profile.departureDate,
        arrivalDate: profile.arrivalDate,
        items: [{
          no: 1,
          description: itemDescription,
          hsCode: profile.hsCode || hsResult.topCode || '',
          countryOfOrigin: profile.countryOfOrigin || '',
          quantity: quantity,
          unit: profile.unit || '',
          unitPrice: unitPrice,
          amount: totalAmount,
          netWeight: invNetWeight,
          grossWeight: invGrossWeight,
          dimensions: profile.measurement || ''
        }],
        totalAmount: totalAmount,
        currency: profile.currency || currency,
        incoterms: profile.incoterms,
        loadPort: profile.loadPort,
        dischargePort: profile.dischargePort,
        paymentTerms,
        lcNo, // 비신용장 결제면 위에서 이미 ''로 강제됨
        // 서명란은 사용자가 지정한 서명자만 표기 — 상호를 서명으로 흉내내지 않는다(공란 허용).
        signedBy: profile.signedBy || profile.signerName || '',
        // 무역협회 표준 서식 ①~⑱ 추가 필드
        sellerTaxNo: profile.tradeType === 'export' ? (profile.businessRegistrationNo || profile.taxNo || '') : '',
        buyer: profile.buyerName ? { name: profile.buyerName, address: profile.buyerAddress || '', contact: '' } : undefined,
        vessel: profile.vesselOrFlight || '',
        shippingMarks: profile.shippingMarks || '',
        packageCount: Number(profile.packageCount) || 0,
        packageType: profile.packageType || 'CARTONS',
        countryOfOrigin: profile.countryOfOrigin || ''
      };

      generatedDocs.invoice = invoice;
      logs.push(createLog(this.name, `상업송장 조립 완료 (총액: ${currency} ${totalAmount.toFixed(2)})`, 'success'));
    }

    // 4. Packing List 데이터 조립
    const packingDoc = requiredDocs.find(d => d.id === 'packing_list');
    if (packingDoc && packingDoc.status !== 'not_needed' && packingDoc.status !== 'not_started') {
      logs.push(createLog(this.name, '패킹리스트(Packing List) 데이터 조립 중...', 'info'));
      
      const qty = Number(profile.quantity) || 0;
      // 인보이스(invGrossWeight/invNetWeight)와 동일 규칙 — 두 문서의 중량이 어긋나면 안 된다.
      // grossWeight의 빈 문자열('')은 ??로는 걸러지지 않으므로 ||로 weight까지 폴백한다.
      const grossWeight = Number(profile.grossWeight || profile.weight) || 0;
      // 순중량은 실측 신고값 — 추정 금지(총중량×0.9 제거). 미입력이면 0(템플릿에서 공란).
      const netWeight = Number(profile.netWeight) || 0;

      const plSeller = generatedDocs.invoice?.seller || { name: profile.companyName || '', address: '', contact: '' };
      const plConsignee = generatedDocs.invoice?.consignee || { name: '', address: '', contact: '' };

      const packingList: PackingListData = {
        plNo: docNo('PL'),
        date: new Date().toISOString().split('T')[0],
        invoiceNo: generatedDocs.invoice?.invoiceNo || '',
        invoiceRef: generatedDocs.invoice?.invoiceNo || '', // 템플릿 호환용 별칭
        seller: plSeller,
        consignee: plConsignee,
        exporter: plSeller, // 템플릿 호환용 별칭
        importer: plConsignee, // 템플릿 호환용 별칭
        // 상업송장과 공유하는 거래 데이터 — 패킹리스트 xlsx가 재입력 없이 여기서 가져온다.
        invoiceDate: generatedDocs.invoice?.invoiceDate || profile.invoiceDate || '',
        incoterms: profile.incoterms || '',
        paymentTerms,
        // L/C 필드는 파생 단계에서 결제조건 기준으로 이미 공란 처리됨(비신용장이면 '').
        lcNo,
        lcDate,
        lcBank,
        carrier: profile.carrier || profile.vesselOrFlight || '',
        notifyPartyName: profile.notifyPartyName || '',
        // 화인(shipping marks) 미입력이면 빈 값 — 템플릿이 'N/M'(No Marks) 표기를 담당한다.
        shippingMarks: profile.shippingMarks || '',
        signedBy: profile.signedBy || profile.signerName || '',
        packageCount: Number(profile.packageCount) || qty,
        packageType: profile.packageType || '',
        netWeight,
        grossWeight,
        measurement: profile.measurement || '',
        items: [{
          no: 1,
          description: itemDescription,
          hsCode: profile.hsCode || hsResult.topCode || '',
          quantity: qty,
          unit: profile.unit || '',
          unitPrice: generatedDocs.invoice?.items?.[0]?.unitPrice ?? 0,
          amount: generatedDocs.invoice?.items?.[0]?.amount ?? 0,
          netWeight,
          grossWeight,
          // 치수는 실측 입력값만 사용 — 수량으로 상자 크기를 지어내지 않는다.
          dimensions: profile.measurement || ''
        }],
        totalPackages: Number(profile.packageCount) || qty,
        totalNetWeight: netWeight,
        totalGrossWeight: grossWeight,
        // 무역협회 표준 서식 ①~⑯ 추가 필드
        sellerTaxNo: profile.tradeType === 'export' ? (profile.businessRegistrationNo || profile.taxNo || '') : '',
        buyer: profile.buyerName ? { name: profile.buyerName, address: profile.buyerAddress || '', contact: '' } : undefined,
        departureDate: profile.departureDate || '',
        vessel: profile.vesselOrFlight || '',
        loadPort: profile.loadPort || '',
        dischargePort: profile.dischargePort || '',
        countryOfOrigin: profile.countryOfOrigin || ''
      };

      generatedDocs.packingList = packingList;
      logs.push(createLog(this.name, `패킹리스트 조립 완료 (총중량: ${grossWeight}kg)`, 'success'));
    }

    // 5. Certificate of Origin 데이터 조립
    const coDoc = requiredDocs.find(d => d.id === 'co');
    if (coDoc && coDoc.status !== 'not_needed' && profile.tradeType === 'export') {
      logs.push(createLog(this.name, '원산지증명서(C/O) 데이터 조립 중...', 'info'));
      
      const coIssueDate = new Date().toISOString().split('T')[0];
      const coExporter = generatedDocs.invoice?.seller || { name: profile.companyName || '', address: '', contact: '' };
      const coConsignee = generatedDocs.invoice?.consignee || { name: '', address: '', contact: '' };

      const co: CertificateOfOriginData = {
        coNo: docNo('CO'),
        issueDate: coIssueDate,
        date: coIssueDate, // 템플릿 호환용 별칭
        exporter: coExporter,
        consignee: coConsignee,
        importer: coConsignee, // 템플릿 호환용 별칭
        itemDescription,
        hsCode: profile.hsCode || hsResult.topCode || '',
        quantity: profile.quantity ? `${profile.quantity}${profile.unit ? ' ' + profile.unit : ''}` : '',
        // 원산지증명서는 수출 전용 — 미입력 시 대한민국이 원산지(문서 정의상 기본값, 지어낸 값 아님). 실입력이 있으면 그것을 우선.
        countryOfOrigin: profile.countryOfOrigin || 'Republic of Korea',
        originCountry: profile.countryOfOrigin || 'Republic of Korea', // 템플릿 호환용 별칭
        destinationCountry: profile.partnerCountry || profile.dischargePort || '',
        items: generatedDocs.invoice?.items || [],
        signedBy: profile.signedBy || profile.signerName || '',
        invoiceNo: generatedDocs.invoice?.invoiceNo || '',
        invoiceRef: generatedDocs.invoice?.invoiceNo || '', // 템플릿 호환용 별칭
        // RCEP 표준 서식(FORM RCEP, Box 1~14) 추가 필드
        certNo: docNo('CO'),
        agreement: 'RCEP',
        departureDate: profile.departureDate || '',
        vessel: profile.vesselOrFlight || '',
        dischargePort: profile.dischargePort || '',
        grossWeight: Number(profile.grossWeight || profile.weight) || 0,
        originCriterion: 'PSR',
        shippingMarks: profile.shippingMarks || '',
        packages: Number(profile.packageCount) ? `${profile.packageCount} ${profile.packageType || 'CARTONS'}` : ''
      };

      generatedDocs.certificateOfOrigin = co;
      logs.push(createLog(this.name, '원산지증명서 초안 조립 완료 (원산지: 대한민국)', 'success'));
    }

    // 6. 적하보험증권 (Insurance) 데이터 조립 — CIF 등 부보 의무 조건일 때만
    const insuranceDoc = requiredDocs.find(d => d.id === 'insurance');
    if (insuranceDoc && generatedDocs.invoice) {
      logs.push(createLog(this.name, '적하보험증권(Cargo Insurance) 초안 조립 중...', 'info'));

      const inv = generatedDocs.invoice;
      // 부보금액은 통상 송장금액(CIF)의 110%로 산정한다.
      const insuredAmount = Math.round((inv.totalAmount || 0) * 1.1 * 100) / 100;

      const insurance: InsuranceData = {
        certNo: docNo('INS'),
        assured: inv.seller,
        invoiceNo: inv.invoiceNo,
        amountInsured: insuredAmount,
        insuredRate: `${inv.currency} ${(inv.totalAmount || 0).toLocaleString()} × 110%`,
        currency: inv.currency,
        conditions: 'INSTITUTE CARGO CLAUSE (A)',
        vesselName: profile.vesselOrFlight || '',
        fromPort: profile.loadPort || '',
        toPort: profile.dischargePort || '',
        sailingOn: profile.departureDate || '',
        goods: itemDescription,
        placeAndDateSigned: `${profile.loadPort ? profile.loadPort + ' ' : ''}${new Date().toISOString().split('T')[0]}`,
        noOfCertificates: 'TWO',
        signedBy: profile.signedBy || profile.signerName || ''
      };

      generatedDocs.insurance = insurance;
      logs.push(createLog(this.name, `적하보험증권 초안 조립 완료 (부보금액: ${inv.currency} ${insuredAmount.toLocaleString()})`, 'success'));
    }

    // HTML 템플릿 렌더링 적용
    // 상업송장은 고정 docx 템플릿(invoiceDocxService)에서 생성·미리보기하므로 HTML을 만들지 않는다.
    // (미리보기 = 다운로드 docx 단일 소스. generatedDocs.invoice 구조 데이터만 넘긴다.)
    // 패킹리스트도 고정 xlsx 템플릿(packingListXlsxService)에서 생성·미리보기하므로 HTML을 만들지 않는다.
    // (미리보기 = 다운로드 xlsx 단일 소스. generatedDocs.packingList 구조 데이터만 넘긴다.)
    const htmlTemplates: Record<string, string> = {};
    if (generatedDocs.certificateOfOrigin) {
      htmlTemplates.co = renderCertificateOfOriginHTML(generatedDocs.certificateOfOrigin);
    }
    if (generatedDocs.insurance) {
      htmlTemplates.insurance = renderInsuranceHTML(generatedDocs.insurance);
    }

    logs.push(createLog(this.name, '문서 생성 에이전트 작업 완료.', 'success'));

    return {
      documents: requiredDocs,
      generatedDocs,
      htmlTemplates
    };
  }
}
