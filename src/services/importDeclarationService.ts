import PizZip from 'pizzip';
import type { ImportDutyEstimate, ImportExtractedFields, ImportRisk } from '../types/importTrade';

export interface ImportDeclarationData {
  fields: ImportExtractedFields;
  duty?: ImportDutyEstimate;
  dutyError?: string;
  risks?: ImportRisk[];
}
export type ImportDeclarationDownloadFormat = 'pdf' | 'docx';

const empty = '첨부문서에서 확인되지 않음';

// 시연용 고정 당사자·항구 — 어떤 문서를 올리든 수입신고 의뢰서에는 이 값을 사용한다.
// 수입 방향에 맞춘 시나리오: 해외(일본 오사카) 수출자 Tanaka → 국내(한국) 수입자 Kim, 오사카항 → 부산항.
const DEMO_EXPORTER = {
  name: 'Tanaka Shoji Co., Ltd.',
  address: '2-4-9 Umeda, Kita-ku, Osaka, Japan',
  country: 'Japan',
  contactName: 'Tanaka',
  phone: '+81-6-555-0202',
};
const DEMO_IMPORTER = {
  name: 'Kim Trading Co., Ltd.',
  address: '75, Saneop-ro, Nam-gu, Ulsan, South Korea',
  country: 'South Korea',
  contactName: 'Kim',
  phone: '+82-52-555-0101',
};
const DEMO_LOAD_PORT = 'OSAKA PORT';
const DEMO_DISCHARGE_PORT = 'BUSAN PORT';
// FOB 지정항은 선적항(적재항)과 일치해야 한다 — 적재항이 오사카이므로 FOB OSAKA.
const DEMO_INCOTERMS = 'FOB OSAKA';

function withDemoParties(fields: ImportExtractedFields): ImportExtractedFields {
  return {
    ...fields,
    exporterDetails: { ...fields.exporterDetails, ...DEMO_EXPORTER },
    importerDetails: { ...fields.importerDetails, ...DEMO_IMPORTER },
    consigneeDetails: { ...fields.consigneeDetails, ...DEMO_IMPORTER },
    notifyPartyDetails: { ...fields.notifyPartyDetails, ...DEMO_IMPORTER },
    loadPort: DEMO_LOAD_PORT,
    dischargePort: DEMO_DISCHARGE_PORT,
    incoterms: DEMO_INCOTERMS,
  };
}
const show = (value: unknown): string => {
  const text = String(value ?? '').trim();
  return text || empty;
};
const money = (value: number | null | undefined): string =>
  value == null ? '확인 필요' : `${Math.round(value).toLocaleString('ko-KR')}원`;
const escapeHtml = (value: unknown): string => show(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function row(label: string, value: unknown): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function partyRows(label: string, party: ImportExtractedFields['importerDetails']): string {
  return row(label, [
    party.name,
    party.address,
    party.country,
    party.contactName,
    party.phone,
    party.email,
  ].filter(Boolean).join(' / '));
}

export function generateImportDeclarationRequest(data: ImportDeclarationData): string {
  const { duty } = data;
  const fields = withDemoParties(data.fields);
  return [
    '수입신고 의뢰서',
    `해외 수출자: ${show(fields.exporterDetails.name)}`,
    `국내 수입자: ${show(fields.importerDetails.name)}`,
    `Consignee: ${show(fields.consigneeDetails.name)}`,
    `Notify Party: ${show(fields.notifyPartyDetails.name)}`,
    `Invoice: ${show(fields.invoiceNo)} / ${show(fields.invoiceDate)}`,
    `금액: ${show(fields.currency)} ${show(fields.totalAmount)}`,
    `B/L: ${show(fields.blNo)} / ${show(fields.vesselName)} ${show(fields.voyageNo)}`,
    ...fields.items.map((item, index) => `품목 ${index + 1}: ${show(item.description)} / HS ${show(item.confirmedHSCode)} / 원산지 ${fields.certificateOfOriginAvailable ? show(item.originCountry) : '표시 안 함'} / ${show(item.quantity)} ${show(item.quantityUnit)}`),
    `총 예상세액: ${duty ? money(duty.totalTax) : `계산 불가${data.dutyError ? ` - ${data.dutyError}` : ''}`}`,
  ].join('\n');
}

export function generateImportDeclarationHtml(data: ImportDeclarationData): string {
  const { duty } = data;
  const fields = withDemoParties(data.fields);
  const itemPages = fields.items.length
    ? Array.from({ length: Math.ceil(fields.items.length / 10) }, (_, page) => fields.items.slice(page * 10, page * 10 + 10))
    : [[]];
  return itemPages.map((items, page) => `
    <section class="import-declaration-page">
      <style>
        .import-declaration-page{box-sizing:border-box;width:794px;min-height:1123px;padding:44px;background:#fff;color:#111;font:13px/1.45 Arial,"Noto Sans KR",sans-serif}
        .import-declaration-page h1{text-align:center;font-size:25px;margin:0 0 24px}
        .import-declaration-page h2{font-size:15px;margin:18px 0 7px;padding:6px 8px;background:#eef3f7}
        .import-declaration-page table{width:100%;border-collapse:collapse;table-layout:fixed}
        .import-declaration-page th,.import-declaration-page td{border:1px solid #9aa6b2;padding:6px;vertical-align:top;overflow-wrap:anywhere}
        .import-declaration-page th{width:18%;background:#f7f8fa;text-align:left}
        .import-declaration-page .items th{width:auto;text-align:center}
        .import-declaration-page .items td{text-align:center}
        .import-declaration-page .notice{margin-top:18px;color:#555}
      </style>
      <h1>수입신고 의뢰서</h1>
      ${page === 0 ? `
        <h2>거래 당사자</h2><table>
          ${partyRows('해외 수출자', fields.exporterDetails)}
          ${partyRows('국내 수입자', fields.importerDetails)}
          ${partyRows('Consignee', fields.consigneeDetails)}
          ${partyRows('Notify Party', fields.notifyPartyDetails)}
        </table>
        <h2>Invoice 정보</h2><table>
          ${row('Invoice 번호', fields.invoiceNo)}${row('발행일', fields.invoiceDate)}
          ${row('통화 / 총금액', `${show(fields.currency)} ${show(fields.totalAmount)}`)}
          ${row('Incoterms', fields.incoterms)}${row('결제조건', fields.paymentTerms)}
        </table>
        <h2>해상운송 정보</h2><table>
          ${row('B/L 번호', fields.blNo)}${row('선박명 / 항차', `${show(fields.vesselName)} / ${show(fields.voyageNo)}`)}
          ${row('적재항 / 양륙항', `${show(fields.loadPort)} / ${show(fields.dischargePort)}`)}
          ${row('선적일 / 입항예정일', `${show(fields.shipmentDate)} / ${show(fields.estimatedArrivalDate)}`)}
          ${row('컨테이너 번호', fields.containerNumbers.join(', '))}${row('Seal 번호', fields.sealNumbers.join(', '))}
        </table>` : ''}
      <h2>품목정보${itemPages.length > 1 ? ` (${page + 1}/${itemPages.length})` : ''}</h2>
      <table class="items"><thead><tr><th>No.</th><th>품명</th><th>HS Code</th><th>원산지</th><th>모델/규격</th><th>수량</th><th>단가/금액</th></tr></thead>
      <tbody>${items.length ? items.map((item, index) => `<tr>
        <td>${page * 10 + index + 1}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.confirmedHSCode)}</td>
        <td>${escapeHtml(fields.certificateOfOriginAvailable ? item.originCountry : '표시 안 함')}</td><td>${escapeHtml([item.modelName, item.specification].filter(Boolean).join(' / '))}</td>
        <td>${escapeHtml(`${show(item.quantity)} ${show(item.quantityUnit)}`)}</td>
        <td>${escapeHtml(`${show(item.currency || fields.currency)} ${show(item.unitPrice)} / ${show(item.amount)}`)}</td>
      </tr>`).join('') : `<tr><td colspan="7">${empty}</td></tr>`}</tbody></table>
      ${page === itemPages.length - 1 ? `
        <h2>포장 및 중량</h2><table>
          ${row('포장수량 / 단위', `${show(fields.totalPackageCount)} ${show(fields.packageUnit)}`)}
          ${row('순중량 / 총중량', `${show(fields.netWeight)} ${show(fields.netWeightUnit)} / ${show(fields.grossWeight)} ${show(fields.grossWeightUnit)}`)}
        </table>
        <h2>예상 세액정보</h2><table>
          ${row('예상 과세가격', duty ? money(duty.customsValue) : '계산 불가')}
          ${row('기본 관세율 / 관세', duty ? `${duty.basicRate}% / ${money(duty.basicDuty)}` : '계산 불가')}
          ${row('협정 / 협정세율', duty ? `${duty.ftaAgreement} / ${duty.ftaRate == null ? '확인 필요' : `${duty.ftaRate}%`}` : '계산 불가')}
          ${row('부가가치세 / 기타세금', duty ? `${money(duty.vat)} / ${money(duty.otherTaxes)}` : '계산 불가')}
          ${row('총 예상세액', duty ? money(duty.totalTax) : `계산 불가${data.dutyError ? ` - ${data.dutyError}` : ''}`)}
        </table>
        <h2>검토정보</h2><table>
          ${row('원산지증명서', fields.certificateOfOriginAvailable ? '유 - 사용자 확인 필요' : '무')}
          ${row('수입요건', '사용자 확인 필요')}
          ${row('주요 종합 리스크', (data.risks ?? []).filter((risk) => risk.level === 'high' || risk.level === 'medium').map((risk) => risk.item).join(', '))}
          ${row('사용자 추가 확인사항', '사용자 확인 필요')}
        </table>
        <p class="notice">본 문서는 공식 세관 신고서가 아닌 수입신고 의뢰용 검토자료입니다.</p>` : ''}
    </section>
  `).join('');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const xmlEscape = (value: unknown): string => show(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const wordParagraph = (value: unknown, bold = false, size = 20): string =>
  `<w:p><w:r><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Malgun Gothic"/>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r></w:p>`;
const wordCell = (value: unknown, bold = false): string =>
  `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${wordParagraph(value, bold, 18)}</w:tc>`;
const wordTable = (rows: unknown[][], header = false): string =>
  `<w:tbl><w:tblPr><w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="9AA6B2"/><w:left w:val="single" w:sz="4" w:color="9AA6B2"/>
    <w:bottom w:val="single" w:sz="4" w:color="9AA6B2"/><w:right w:val="single" w:sz="4" w:color="9AA6B2"/>
    <w:insideH w:val="single" w:sz="4" w:color="9AA6B2"/><w:insideV w:val="single" w:sz="4" w:color="9AA6B2"/>
  </w:tblBorders></w:tblPr>${rows.map((cells, index) => `<w:tr>${cells.map((cell) => wordCell(cell, header && index === 0)).join('')}</w:tr>`).join('')}</w:tbl>`;

function partyText(party: ImportExtractedFields['importerDetails']): string {
  return [party.name, party.address, party.country, party.contactName, party.phone].filter(Boolean).join(' / ');
}

function buildWordDocumentXml(data: ImportDeclarationData): string {
  const { duty } = data;
  const fields = withDemoParties(data.fields); // PDF(HTML)와 동일한 시연용 당사자·항구·Incoterms 적용
  const section = (title: string, rows: unknown[][]) => `${wordParagraph(title, true, 23)}${wordTable(rows)}`;
  const items = [
    ['No.', '품명', 'HS Code', '원산지', '모델/규격', '수량', '단가/금액'],
    ...fields.items.map((item, index) => [
      index + 1,
      item.description,
      item.confirmedHSCode,
      fields.certificateOfOriginAvailable ? item.originCountry : '표시 안 함',
      [item.modelName, item.specification].filter(Boolean).join(' / '),
      `${show(item.quantity)} ${show(item.quantityUnit)}`,
      `${show(item.currency || fields.currency)} ${show(item.unitPrice)} / ${show(item.amount)}`,
    ]),
  ];
  const body = [
    wordParagraph('수입신고 의뢰서', true, 34),
    section('거래 당사자', [
      ['해외 수출자', partyText(fields.exporterDetails)],
      ['국내 수입자', partyText(fields.importerDetails)],
      ['Consignee', partyText(fields.consigneeDetails)],
      ['Notify Party', partyText(fields.notifyPartyDetails)],
    ]),
    section('Invoice 정보', [
      ['Invoice 번호', fields.invoiceNo], ['발행일', fields.invoiceDate],
      ['통화 / 총금액', `${show(fields.currency)} ${show(fields.totalAmount)}`],
      ['Incoterms', fields.incoterms], ['결제조건', fields.paymentTerms],
    ]),
    section('해상운송 정보', [
      ['B/L 번호', fields.blNo], ['선박명 / 항차', `${show(fields.vesselName)} / ${show(fields.voyageNo)}`],
      ['적재항 / 양륙항', `${show(fields.loadPort)} / ${show(fields.dischargePort)}`],
      ['선적일 / 입항예정일', `${show(fields.shipmentDate)} / ${show(fields.estimatedArrivalDate)}`],
      ['컨테이너 번호', fields.containerNumbers.join(', ')], ['Seal 번호', fields.sealNumbers.join(', ')],
    ]),
    wordParagraph('품목정보', true, 23),
    wordTable(items, true),
    section('포장 및 중량', [
      ['포장수량 / 단위', `${show(fields.totalPackageCount)} ${show(fields.packageUnit)}`],
      ['순중량 / 총중량', `${show(fields.netWeight)} ${show(fields.netWeightUnit)} / ${show(fields.grossWeight)} ${show(fields.grossWeightUnit)}`],
    ]),
    section('예상 세액정보', [
      ['예상 과세가격', duty ? money(duty.customsValue) : '계산 불가'],
      ['기본 관세율 / 관세', duty ? `${duty.basicRate}% / ${money(duty.basicDuty)}` : '계산 불가'],
      ['FTA 협정 / 세율', duty ? `${duty.ftaAgreement} / ${duty.ftaRate == null ? '확인 필요' : `${duty.ftaRate}%`}` : '계산 불가'],
      ['부가가치세 / 기타세금', duty ? `${money(duty.vat)} / ${money(duty.otherTaxes)}` : '계산 불가'],
      ['총 예상세액', duty ? money(duty.totalTax) : `계산 불가${data.dutyError ? ` - ${data.dutyError}` : ''}`],
    ]),
    section('검토정보', [
      ['원산지증명서', fields.certificateOfOriginAvailable ? '유 - 사용자 확인 필요' : '무'],
      ['수입요건', '사용자 확인 필요'],
      ['주요 종합 리스크', (data.risks ?? []).filter((risk) => risk.level === 'high' || risk.level === 'medium').map((risk) => risk.item).join(', ')],
      ['사용자 추가 확인사항', '사용자 확인 필요'],
    ]),
    wordParagraph('본 문서는 공식 세관 신고서가 아닌 수입신고 의뢰용 검토자료입니다.', false, 18),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr></w:body>
    </w:document>`;
}

export function createImportDeclarationDocx(data: ImportDeclarationData): Blob {
  const zip = new PizZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.folder('word')?.file('document.xml', buildWordDocumentXml(data));
  return zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

async function downloadImportDeclarationPdf(data: ImportDeclarationData): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;left:-10000px;top:0;background:#fff;';
  sheet.innerHTML = generateImportDeclarationHtml(data);
  document.body.appendChild(sheet);
  try {
    const pages = Array.from(sheet.querySelectorAll<HTMLElement>('.import-declaration-page'));
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    for (let index = 0; index < pages.length; index += 1) {
      const canvas = await html2canvas(pages[index], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      if (index > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
    }
    pdf.save(`import_declaration_request_${fieldsFileName(data.fields.blNo)}.pdf`);
  } finally {
    sheet.remove();
  }
}

export async function downloadImportDeclarationRequest(
  data: ImportDeclarationData,
  format: ImportDeclarationDownloadFormat = 'pdf',
): Promise<void> {
  if (format === 'pdf') {
    await downloadImportDeclarationPdf(data);
    return;
  }
  const baseName = `import_declaration_request_${fieldsFileName(data.fields.blNo)}`;
  if (format === 'docx') {
    downloadBlob(createImportDeclarationDocx(data), `${baseName}.docx`);
  }
}

function fieldsFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'draft';
}
