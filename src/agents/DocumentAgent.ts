import { Agent, DocumentResult, HSCodeResult, AgentLog, createLog } from './types';
import { TradeProfile, GeneratedDocuments, InvoiceData, PackingListData, CertificateOfOriginData } from '../types';
import { determineRequiredDocuments } from '../harness/rulesEngine';
import { autoFillDocumentFields } from '../services/claudeService';
import { renderInvoiceHTML } from './templates/invoice';
import { renderPackingListHTML } from './templates/packingList';
import { renderCertificateOfOriginHTML } from './templates/co';

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

    // 2. LLM으로 품목 설명 자동 생성 (옵션)
    let itemDescription = `${profile.itemName} (commercial goods)`;
    let paymentTerms = 'T/T in advance';
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

    // 3. Invoice 데이터 조립
    const invoiceDoc = requiredDocs.find(d => d.id === 'invoice');
    if (invoiceDoc && invoiceDoc.status !== 'not_needed') {
      logs.push(createLog(this.name, '상업송장(Invoice) 데이터 조립 중...', 'info'));
      
      const quantity = Number(profile.quantity) || 1;
      // 단가·총액은 사용자 입력을 우선하고, 미입력 시에만 추정치를 쓴다.
      // 총액을 단가와 별개로 추정하면 "단가 × 수량 ≠ 금액"인 송장이 생긴다.
      const estimatedUnitPrice = profile.quantity && profile.weight
        ? Math.round((Number(profile.weight) * 2.5) / Number(profile.quantity) * 100) / 100
        : 10.00;
      const unitPrice = Number(profile.unitPrice) || estimatedUnitPrice;
      const totalAmount = Number(profile.totalAmount) || Math.round(unitPrice * quantity * 100) / 100;

      const invoiceDate = profile.invoiceDate || new Date().toISOString().split('T')[0];
      const exporterParty = {
        name: profile.tradeType === 'export' ? (profile.companyName || 'Exporter Co., Ltd.') : (profile.partnerName || 'Overseas Supplier Co., Ltd.'),
        address: profile.tradeType === 'export'
          ? (profile.companyAddress || 'Seoul, Republic of Korea')
          : (profile.partnerAddress || 'Overseas Address'),
        contact: profile.tradeType === 'export'
          ? (profile.contact || 'N/A')
          : (profile.partnerContact || 'N/A')
      };
      const importerParty = {
        name: profile.tradeType === 'import' ? (profile.companyName || 'Importer Co., Ltd.') : (profile.partnerName || 'Overseas Buyer Co., Ltd.'),
        address: profile.tradeType === 'import'
          ? (profile.companyAddress || 'Seoul, Republic of Korea')
          : (profile.partnerAddress || 'Overseas Address'),
        contact: profile.tradeType === 'import'
          ? (profile.contact || 'N/A')
          : (profile.partnerContact || 'N/A')
      };
      const invGrossWeight = Number(profile.grossWeight || profile.weight) || 0;
      const invNetWeight = Number(profile.netWeight) || Math.round(invGrossWeight * 0.9 * 10) / 10;

      const invoice: InvoiceData = {
        invoiceNo: profile.invoiceNo || `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        invoiceDate,
        date: invoiceDate, // 템플릿 호환용 별칭
        seller: exporterParty,
        consignee: importerParty,
        exporter: exporterParty, // 템플릿 호환용 별칭
        importer: importerParty, // 템플릿 호환용 별칭
        departureDate: profile.departureDate || 'N/A',
        arrivalDate: profile.arrivalDate || 'N/A',
        items: [{
          no: 1,
          description: itemDescription,
          hsCode: profile.hsCode || hsResult.topCode || 'N/A',
          countryOfOrigin: profile.countryOfOrigin || 'N/A',
          quantity: quantity,
          unit: profile.unit || 'PCS',
          unitPrice: unitPrice,
          amount: totalAmount,
          netWeight: invNetWeight,
          grossWeight: invGrossWeight,
          dimensions: profile.measurement || 'N/A'
        }],
        totalAmount: totalAmount,
        currency: profile.currency || currency,
        incoterms: profile.incoterms || 'FOB',
        loadPort: profile.loadPort || 'N/A',
        dischargePort: profile.dischargePort || 'N/A',
        paymentTerms,
        signedBy: profile.signedBy || profile.signerName || profile.companyName || 'Authorized Signature'
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
      const netWeight = Number(profile.netWeight) || Math.round(grossWeight * 0.9 * 10) / 10;

      const plSeller = generatedDocs.invoice?.seller || { name: profile.companyName, address: '', contact: '' };
      const plConsignee = generatedDocs.invoice?.consignee || { name: 'N/A', address: '', contact: '' };

      const packingList: PackingListData = {
        plNo: `PL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        date: new Date().toISOString().split('T')[0],
        invoiceNo: generatedDocs.invoice?.invoiceNo || 'N/A',
        invoiceRef: generatedDocs.invoice?.invoiceNo || 'N/A', // 템플릿 호환용 별칭
        seller: plSeller,
        consignee: plConsignee,
        exporter: plSeller, // 템플릿 호환용 별칭
        importer: plConsignee, // 템플릿 호환용 별칭
        shippingMarks: profile.shippingMarks || 'N/M',
        signedBy: profile.signedBy || profile.signerName || profile.companyName || 'Authorized Signature',
        packageCount: Number(profile.packageCount) || qty,
        packageType: profile.packageType || 'CTN',
        netWeight,
        grossWeight,
        measurement: profile.measurement || 'N/A',
        items: [{
          no: 1,
          description: itemDescription,
          hsCode: profile.hsCode || hsResult.topCode || 'N/A',
          quantity: qty,
          unit: profile.unit || 'PCS',
          unitPrice: generatedDocs.invoice?.items?.[0]?.unitPrice ?? 0,
          amount: generatedDocs.invoice?.items?.[0]?.amount ?? 0,
          netWeight,
          grossWeight,
          dimensions: `${Math.ceil(Math.cbrt(qty) * 10)}x${Math.ceil(Math.cbrt(qty) * 10)}x${Math.ceil(Math.cbrt(qty) * 8)} cm`
        }],
        totalPackages: Number(profile.packageCount) || qty,
        totalNetWeight: netWeight,
        totalGrossWeight: grossWeight
      };

      generatedDocs.packingList = packingList;
      logs.push(createLog(this.name, `패킹리스트 조립 완료 (총중량: ${grossWeight}kg)`, 'success'));
    }

    // 5. Certificate of Origin 데이터 조립
    const coDoc = requiredDocs.find(d => d.id === 'co');
    if (coDoc && coDoc.status !== 'not_needed' && profile.tradeType === 'export') {
      logs.push(createLog(this.name, '원산지증명서(C/O) 데이터 조립 중...', 'info'));
      
      const coIssueDate = new Date().toISOString().split('T')[0];
      const coExporter = generatedDocs.invoice?.seller || { name: profile.companyName, address: 'Seoul, Korea', contact: '' };
      const coConsignee = generatedDocs.invoice?.consignee || { name: 'N/A', address: '', contact: '' };

      const co: CertificateOfOriginData = {
        coNo: `CO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
        issueDate: coIssueDate,
        date: coIssueDate, // 템플릿 호환용 별칭
        exporter: coExporter,
        consignee: coConsignee,
        importer: coConsignee, // 템플릿 호환용 별칭
        itemDescription,
        hsCode: profile.hsCode || hsResult.topCode || 'N/A',
        quantity: `${profile.quantity || 'N/A'} PCS`,
        countryOfOrigin: profile.countryOfOrigin || 'Republic of Korea',
        originCountry: profile.countryOfOrigin || 'Republic of Korea', // 템플릿 호환용 별칭
        destinationCountry: profile.partnerCountry || profile.dischargePort || 'N/A',
        items: generatedDocs.invoice?.items || [],
        signedBy: profile.signedBy || profile.signerName || profile.companyName || 'Authorized Signature',
        invoiceNo: generatedDocs.invoice?.invoiceNo || 'N/A',
        invoiceRef: generatedDocs.invoice?.invoiceNo || 'N/A' // 템플릿 호환용 별칭
      };

      generatedDocs.certificateOfOrigin = co;
      logs.push(createLog(this.name, '원산지증명서 초안 조립 완료 (원산지: 대한민국)', 'success'));
    }

    // HTML 템플릿 렌더링 적용
    const htmlTemplates: Record<string, string> = {};
    if (generatedDocs.invoice) {
      htmlTemplates.invoice = renderInvoiceHTML(generatedDocs.invoice);
    }
   if (generatedDocs.packingList) {
  htmlTemplates.packing_list = renderPackingListHTML(generatedDocs.packingList);
}
    if (generatedDocs.certificateOfOrigin) {
      htmlTemplates.co = renderCertificateOfOriginHTML(generatedDocs.certificateOfOrigin);
    }

    logs.push(createLog(this.name, '문서 생성 에이전트 작업 완료.', 'success'));

    return {
      documents: requiredDocs,
      generatedDocs,
      htmlTemplates
    };
  }
}
