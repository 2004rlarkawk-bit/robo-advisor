import { Agent, DocumentResult, HSCodeResult, AgentLog, createLog } from './types';
import { GeneratedDocuments, InvoiceData, PackingListData, CertificateOfOriginData, CustomsDeclarationData, Shipment, TransportRequestData } from '../types';
import { tradeItemAmount } from '../utils/shipment';
import { determineRequiredDocuments } from '../harness/rulesEngine';
import { autoFillDocumentFields } from '../services/claudeService';
import { getCustomsExchangeRate } from '../services/customsApiService';
import { isLcPayment } from './paymentTerms';
import { renderCertificateOfOriginHTML } from './templates/co';
import { renderTransportRequestHTML } from './templates/transportRequest';
export class DocumentAgent implements Agent<{ shipment: Shipment; hsResult: HSCodeResult; useLLM?: boolean; logs: AgentLog[] }, DocumentResult> {
  readonly name = 'Document Agent';

  async run(input: { shipment: Shipment; hsResult: HSCodeResult; useLLM?: boolean; logs: AgentLog[] }): Promise<DocumentResult> {
    const { shipment, hsResult, useLLM = false, logs } = input;
    const { profile } = shipment;
    // 품목 데이터 우선순위:
    // 1) Orchestrator가 전달한 canonical shipment.items
    // 2) 수출 화주 폼의 profile.shipperItems
    // 3) 레거시 단일 품목 profile 필드
    //
    // 병합 과정에서 2번 경로가 빠지면 화주 폼에 입력한 영문 품명과 다품목이
    // profile.itemName 하나로 덮어써지므로 반드시 유지한다.
    const items = shipment.items.length > 0
      ? shipment.items
      : profile.shipperItems?.length
        ? profile.shipperItems.map((item, index) => ({
            description: item.itemName || '',
            hsCode: item.hsCode || '',
            quantity: Number(item.quantity) || 0,
            unit: item.unit || '',
            unitPrice: Number(item.unitPrice) || 0,
            extractedAmount: undefined,
            // 현재 화주 폼의 중량·포장 정보는 문서 단위 입력이므로 첫 품목에만 연결한다.
            netWeight: index === 0 ? Number(profile.netWeight) || 0 : 0,
            grossWeight: index === 0
              ? Number(profile.grossWeight || profile.weight) || 0
              : 0,
            measurement: index === 0 ? profile.measurement || '' : '',
            packageCount: index === 0 ? Number(profile.packageCount) || 0 : 0,
            eaPerBox: index === 0 ? Number(profile.eaPerBox) || 0 : 0,
            packageUnit: index === 0 ? profile.packageType || '' : '',
            shippingMarks: index === 0 ? profile.shippingMarks || undefined : undefined,
          }))
        : [{
            description: profile.itemName || '',
            hsCode: profile.hsCode || '',
            quantity: Number(profile.quantity) || 0,
            unit: profile.unit || '',
            unitPrice: Number(profile.unitPrice) || 0,
            extractedAmount:
              profile.totalAmount !== '' && profile.totalAmount !== undefined
                ? Number(profile.totalAmount)
                : undefined,
            netWeight: Number(profile.netWeight) || 0,
            grossWeight: Number(profile.grossWeight || profile.weight) || 0,
            measurement: profile.measurement || '',
            packageCount: Number(profile.packageCount) || 0,
            eaPerBox: Number(profile.eaPerBox) || 0,
            packageUnit: profile.packageType || '',
            shippingMarks: profile.shippingMarks || undefined,
          }];
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
    let itemDescription = items[0]?.description || profile.itemName; // 대표 품명(C/O·보험 goods 용)

    let paymentTerms = profile.paymentTerms || '';
    let currency = 'USD';

    if (useLLM && profile.itemName && !profile.shipperItems?.length) {
      logs.push(createLog(this.name, 'OpenAI에 품목 설명 및 거래 조건 자동 생성 요청 중...', 'info'));
      try {
        const autoFill = await autoFillDocumentFields({
          itemName: profile.itemName,
          companyName: profile.companyName,
          tradeType: profile.tradeType
        });
        paymentTerms = autoFill.paymentTerms;
        currency = autoFill.currency;
        logs.push(createLog(this.name, 'AI 거래 조건 자동 생성 완료', 'success'));
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

    const generatedAt = new Date();
    const generatedDate = [
      generatedAt.getFullYear(),
      String(generatedAt.getMonth() + 1).padStart(2, '0'),
      String(generatedAt.getDate()).padStart(2, '0'),
    ].join('-');
    // 수출 C/I는 폼 진입일이나 레거시 입력값이 아니라 실제 생성 시점의 날짜를 사용한다.
    // 생성 결과 자체에 날짜가 저장되므로 이미 생성된 문서를 조회할 때는 다시 계산되지 않는다.
    const invoiceDate = profile.tradeType === 'export'
      ? generatedDate
      : profile.invoiceDate || generatedDate;

    // 3. Invoice 데이터 조립
    const invoiceDoc = requiredDocs.find(d => d.id === 'invoice');
    if (invoiceDoc && invoiceDoc.status !== 'not_needed') {
      logs.push(createLog(this.name, '상업송장(Invoice) 데이터 조립 중...', 'info'));
      
      // 다품목: 각 품목 금액을 계산(extractedAmount ?? 수량×단가)해 합산한다. amount는 저장 않고 계산.
      const invoiceItems = items.map((it, i) => ({
        no: i + 1,
        description: it.description,
        hsCode: it.hsCode || hsResult.topCode || '',
        countryOfOrigin: profile.countryOfOrigin || '',
        quantity: it.quantity,
        unit: it.unit || '',
        unitPrice: it.unitPrice,
        amount: tradeItemAmount(it),
        netWeight: it.netWeight,
        grossWeight: it.grossWeight,
        dimensions: it.measurement || '',
      }));
      const totalAmount = invoiceItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);

      // 당사자 정보는 프로필 실입력값만 사용한다 — 미입력이면 빈 문자열(양식에서 빈 칸으로 렌더).
      // 가짜 상호/주소("Overseas Supplier", "Seoul..." 등)를 지어내지 않는다. 누락은 validatorEngine이 막는다.
      const exporterParty = {
        name: profile.tradeType === 'export' ? (profile.companyName || '') : (profile.partnerName || ''),
        address: profile.tradeType === 'export' ? (profile.companyAddress || '') : (profile.partnerAddress || ''),
        contact: profile.tradeType === 'export' ? (profile.contact || '') : (profile.partnerContact || ''),
        country: profile.tradeType === 'export' ? (profile.companyCountry || '') : (profile.partnerCountry || ''),
      };
      const importerParty = {
        name: profile.tradeType === 'import' ? (profile.companyName || '') : (profile.partnerName || ''),
        address: profile.tradeType === 'import' ? (profile.companyAddress || '') : (profile.partnerAddress || ''),
        contact: profile.tradeType === 'import' ? (profile.contact || '') : (profile.partnerContact || ''),
        country: profile.tradeType === 'import' ? (profile.companyCountry || '') : (profile.partnerCountry || ''),
      };

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
        items: invoiceItems,
        totalAmount: totalAmount,
        currency: profile.currency || currency,

        incoterms: profile.incoterms,
        loadPort: profile.loadPort,
        dischargePort: profile.dischargePort,
        paymentTerms,
        lcNo, // 비신용장 결제면 위에서 이미 ''로 강제됨
        lcDate,
        otherReferences: profile.otherReferences || '',
        incotermsPlace: profile.shipperSupplemental?.incotermsPlace || '',
        // 서명란은 사용자가 지정한 서명자만 표기 — 상호를 서명으로 흉내내지 않는다(공란 허용).
        signedBy: '', // 서명란은 실제 서명자가 직접 기재 — 자동 채움 안 함
        // 무역협회 표준 서식 ①~⑱ 추가 필드
        sellerTaxNo: profile.tradeType === 'export' ? (profile.businessRegistrationNo || profile.taxNo || '') : '',
        buyer: profile.buyerName ? {
          name: profile.buyerName,
          address: profile.buyerAddress || '',
          contact: '',
          country: profile.buyerCountry || '',
        } : undefined,
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
      
      // 다품목 패킹 — 각 품목의 물류필드(순/총중량·용적·포장)를 그대로 쓴다.
      // 입력 경로 전까지 공란이면 공란 유지(첫 품목·문서레벨 값으로 채우지 않는다). 미입력은 검증이 잡는다.
      const packingItems = items.map((it, i) => ({
        no: i + 1,
        description: it.description,
        hsCode: it.hsCode || hsResult.topCode || '',
        quantity: it.quantity,
        unit: it.unit || '',
        unitPrice: it.unitPrice,
        amount: tradeItemAmount(it),
        netWeight: it.netWeight,
        grossWeight: it.grossWeight,
        dimensions: it.measurement || '',
        packageCount: it.packageCount,
        // 0은 "미입력"과 같은 취급(R10이 boxes>0 && ea>0만 대조 대상으로 삼음) → 공란(undefined)으로 유지.
        eaPerBox: it.eaPerBox ? it.eaPerBox : undefined,
        packageType: it.packageUnit || '',
        marks: it.shippingMarks,
      }));
      const sumNet = packingItems.reduce((s, it) => s + (Number(it.netWeight) || 0), 0);
      const sumGross = packingItems.reduce((s, it) => s + (Number(it.grossWeight) || 0), 0);
      const sumPackages = packingItems.reduce((s, it) => s + (Number(it.packageCount) || 0), 0);

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
        // Vessel 미입력은 TBA로 추정하지 않고 문서에 공란으로 유지한다.
        carrier: profile.vesselOrFlight || profile.carrier || '',
        notifyPartyName: profile.notifyPartyName || '',
        // 화인(shipping marks) 미입력이면 빈 값 — 템플릿이 'N/M'(No Marks) 표기를 담당한다.
        shippingMarks: profile.shippingMarks || '',
        signedBy: '', // 서명란은 실제 서명자가 직접 기재 — 자동 채움 안 함
        packageCount: sumPackages,
        packageType: items[0]?.packageUnit || profile.packageType || '',
        netWeight: sumNet,
        grossWeight: sumGross,
        measurement: '', // 용적은 품목별(measurement) — 문서레벨 총합은 두지 않는다.
        items: packingItems,
        totalPackages: sumPackages,
        totalNetWeight: sumNet,
        totalGrossWeight: sumGross,

        // 무역협회 표준 서식 ①~⑯ 추가 필드
        sellerTaxNo: profile.tradeType === 'export' ? (profile.businessRegistrationNo || profile.taxNo || '') : '',
        buyer: profile.buyerName ? { name: profile.buyerName, address: profile.buyerAddress || '', contact: '' } : undefined,
        departureDate: profile.departureDate || '',
        vessel: profile.vesselOrFlight || '',
        loadPort: profile.loadPort || '',
        dischargePort: profile.dischargePort || '',
        countryOfOrigin: profile.countryOfOrigin || '',
        otherReferences: profile.otherReferences || '',
      };

      generatedDocs.packingList = packingList;
      logs.push(createLog(this.name, `패킹리스트 조립 완료 (품목 ${packingItems.length}건, 총중량: ${sumGross}kg)`, 'success'));
    }

    // 수출 화주 운송의뢰서: 화주 입력값만 재사용하며 Booking/B/L/선박·마감 확정 정보는 포함하지 않는다.
    const transportRequestDoc = requiredDocs.find(d => d.id === 'transport_request');
    if (transportRequestDoc && profile.tradeType === 'export') {
      const notifyParty = profile.notifyPartyName || profile.notifyPartyAddress || profile.notifyPartyContact
        ? { name: profile.notifyPartyName || '', address: profile.notifyPartyAddress || '', contact: profile.notifyPartyContact || '' }
        : undefined;
      const transportRequest: TransportRequestData = {
        requestNo: docNo('TR'),
        requestDate: generatedDate,
        exporter: generatedDocs.invoice?.seller || { name: profile.companyName || '', address: profile.companyAddress || '', contact: profile.contact || '' },
        requesterName: profile.contactName || profile.signerName || '',
        businessRegistrationNo: profile.businessRegistrationNo || profile.taxNo || '',
        consignee: generatedDocs.invoice?.consignee || { name: profile.partnerName || '', address: profile.partnerAddress || '', contact: profile.partnerContact || '' },
        notifyParty,
        items: items.map(item => ({
          description: item.description,
          hsCode: item.hsCode || hsResult.topCode || '',
          quantity: item.quantity,
          unit: item.unit || '',
          packageCount: item.packageCount,
          packageType: item.packageUnit || '',
          netWeight: item.netWeight,
          grossWeight: item.grossWeight,
          measurement: item.measurement || '',
        })),
        incoterms: profile.incoterms || '',
        incotermsPlace: profile.shipperSupplemental?.incotermsPlace || '',
        paymentTerms,
        invoiceNo: generatedDocs.invoice?.invoiceNo || profile.invoiceNo || '',
        loadPort: profile.loadPort || '',
        dischargePort: profile.dischargePort || '',
        requestedDepartureDate: profile.departureDate || '',
        loadingMode: profile.loadingMode || '',
      };
      generatedDocs.transportRequest = transportRequest;
      logs.push(createLog(this.name, `수출 운송의뢰서 초안 조립 완료 (품목 ${items.length}건)`, 'success'));
    }

    // 5. Certificate of Origin 데이터 조립
    // C/O는 상공회의소/세관이 발급(external_pending) — 화주가 여기서 생성하지 않는다.
    // 화주 서류는 C/I·P/L만. external_pending이면 초안·HTML·로그를 만들지 않는다.
    // (향후 인증수출자 자율발급 경로가 생겨 status가 external_pending이 아니게 되면 그때 조립된다.)
    const coDoc = requiredDocs.find(d => d.id === 'co');
    if (coDoc && coDoc.status !== 'not_needed' && coDoc.status !== 'external_pending' && profile.tradeType === 'export') {
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
        signedBy: '', // 서명란은 실제 서명자가 직접 기재 — 자동 채움 안 함
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

    // 6. 적하보험증권 (Insurance)
    // 증권은 보험사가 발급(external_pending) — 화주가 여기서 생성하지 않는다(B/L·C/O와 동일 원칙).
    // 초안·HTML을 만들지 않아 서류 현황에는 상태 뱃지만 노출된다.
    // 7. 통관신고 관련 서류 데이터 조립
    const customsDoc = requiredDocs.find(d => d.id === 'customs_dec');
    if (customsDoc && customsDoc.status !== 'not_needed' && customsDoc.status !== 'external_pending') {
      logs.push(createLog(this.name, '통관신고 관련 서류 데이터 조립 중...', 'info'));

      const customsExporter = generatedDocs.invoice?.seller || { name: profile.companyName || '', address: profile.companyAddress || '', contact: profile.contact || '' };
      const customsImporter = generatedDocs.invoice?.consignee || { name: profile.partnerName || '', address: profile.partnerAddress || '', contact: profile.partnerContact || '' };
      const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
      const totalWeight = items.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
      const totalPackages = items.reduce((sum, it) => sum + (Number(it.packageCount) || 0), 0);
      const invoiceAmount = generatedDocs.invoice?.totalAmount || Number(profile.invoiceAmount || profile.totalAmount) || 0;
      const customsCurrency = profile.currency || currency;

      // 신고가격(FOB) 원화 환산용 관세청 수출환율 — 외화 거래일 때만 조회. 실패 시 null(→ 서비스가 FOB 공란).
      let fobRate: number | null = null;
      if (customsCurrency !== 'KRW') {
        try {
          const fx = await getCustomsExchangeRate(customsCurrency, 'export');
          fobRate = fx.rate;
          logs.push(createLog(this.name, `수출신고서 FOB 환율 확보: 1 ${customsCurrency} = ${fx.rate.toLocaleString()}원 (${fx.source === 'api' ? '관세청' : '시뮬레이션'})`, 'info'));
        } catch {
          logs.push(createLog(this.name, '수출신고서 FOB 환율 미확보 — 신고가격(원화) 공란 처리', 'warning'));
        }
      }

      const customsDeclaration: CustomsDeclarationData = {
        declarationNo: docNo('CD'),
        declarationDate: new Date().toISOString().split('T')[0],
        tradeType: profile.tradeType,
        exporter: customsExporter,
        importer: customsImporter,
        itemName: itemDescription || profile.itemName || '',
        hsCode: profile.hsCode || hsResult.topCode || '',
        quantity: totalQuantity || Number(profile.quantity) || 0,
        unit: profile.unit || items[0]?.unit || '',
        weight: totalWeight || Number(profile.grossWeight || profile.weight) || 0,
        currency: customsCurrency,
        invoiceAmount,
        incoterms: profile.incoterms || '',
        loadPort: profile.loadPort || '',
        dischargePort: profile.dischargePort || '',
        countryOfOrigin: profile.countryOfOrigin || '',
        customsValue: invoiceAmount,
        dutyRate: '',
        dutyAmount: 0,
        signedBy: '', // 서명란은 실제 서명자가 직접 기재 — 자동 채움 안 함
        // ── 수출신고서(초안) docx 전환용 확장 ──
        items,                                   // 갑지=items[0], 을지=items.slice(1)
        fobRate,
        ownerAddress: customsExporter.address,
        ownerBizNo: profile.businessRegistrationNo || profile.taxNo || '',
        makerName: profile.companyName || '',    // 제조자 별도 소스 없음 — 수출자 상호로 기본
        buyerName: profile.buyerName || profile.partnerName || '',
        buyerCountry: profile.buyerCountry || '',
        destCountry: profile.partnerCountry || profile.dischargePort || '',
        carrier: profile.carrier || '',
        vessel: profile.vesselOrFlight || '',
        departureDate: profile.departureDate || '',
        transportType: profile.loadingMode || '', // 수출 화주 운송방식(FCL/LCL), 미정은 공란
        lcNo,                                     // 비신용장이면 위에서 ''로 강제됨
        totalWeight,
        totalPackages,
        paymentAmount: invoiceAmount,
        containerNo: profile.containerNo || '',
        invoiceNo: generatedDocs.invoice?.invoiceNo || profile.invoiceNo || '',
        invoiceDate
      };

      generatedDocs.customsDeclaration = customsDeclaration;
      logs.push(createLog(this.name, `수출신고서(초안) 데이터 조립 완료 (품목 ${items.length}건${items.length > 1 ? ', 을지 ' + (items.length - 1) + '란' : ''})`, 'success'));
    }
    // HTML 템플릿 렌더링 적용
    // 상업송장은 고정 docx 템플릿(invoiceDocxService)에서 생성·미리보기하므로 HTML을 만들지 않는다.
    // (미리보기 = 다운로드 docx 단일 소스. generatedDocs.invoice 구조 데이터만 넘긴다.)
    // 패킹리스트도 고정 xlsx 템플릿(packingListXlsxService)에서 생성·미리보기하므로 HTML을 만들지 않는다.
    // (미리보기 = 다운로드 xlsx 단일 소스. generatedDocs.packingList 구조 데이터만 넘긴다.)
    // 적하보험증권은 보험사 발급이라 초안·HTML을 만들지 않는다 (상태 뱃지만).
    const htmlTemplates: Record<string, string> = {};
    if (generatedDocs.certificateOfOrigin) {
      htmlTemplates.co = renderCertificateOfOriginHTML(generatedDocs.certificateOfOrigin);
    }
    if (generatedDocs.transportRequest) {
      htmlTemplates.transport_request = renderTransportRequestHTML(generatedDocs.transportRequest);
    }
    // 수출신고서(초안)는 고정 docx 템플릿(exportDeclarationDocxService)에서 생성·미리보기한다.
    // (미리보기 = 다운로드 docx 단일 소스. HTML은 만들지 않는다. customsDeclaration.ts는 @deprecated.)
    logs.push(createLog(this.name, '문서 생성 에이전트 작업 완료.', 'success'));

    return {
      documents: requiredDocs,
      generatedDocs,
      htmlTemplates
    };
  }
}
