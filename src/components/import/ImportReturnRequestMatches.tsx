import type { ImportAnalysisResult, ImportComparisonRow } from '../../types/importTrade';
import type { ForwarderReturnRequest } from '../../types/forwarderCase';
import { returnRequestDocumentLabel } from '../../utils/returnRequestDocuments';

const FIELD_LABELS: Record<string, string> = {
  productDescription: '품명', quantity: '수량', packageCount: '포장 수량',
  grossWeight: '총중량', netWeight: '순중량', originCountry: '원산지',
  loadPort: '선적항', dischargePort: '도착항', consignee: '수하인',
  incoterms: '인코텀즈', currency: '통화', totalAmount: '송장 금액',
  '품명': '품명', '수량': '수량', '총중량(G/W)': '총중량', '순중량(N/W)': '순중량',
  '총중량': '총중량', '순중량': '순중량',
  '포장수': '포장 수량', '총액': '송장 금액', '통화': '통화', '인코텀즈': '인코텀즈',
};

export function importReturnFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function importReturnInputKey(field: string, analysis: ImportAnalysisResult): string | null {
  const canonical = ({
    '품명': 'productDescription', '수량': 'quantity', '총중량(G/W)': 'grossWeight',
    '순중량(N/W)': 'netWeight', '총중량': 'grossWeight', '순중량': 'netWeight',
    '포장수': 'packageCount', '총액': 'totalAmount',
    '통화': 'currency', '인코텀즈': 'incoterms',
  } as Record<string, string>)[field] ?? field;
  field = canonical;
  // 품목이 여러 개면 대사 행만으로 어느 품목인지 특정할 수 없다.
  if (field === 'quantity') return analysis.extracted.items.length === 1 ? `${analysis.extracted.items[0].id}.quantity` : null;
  if (field === 'productDescription') return analysis.extracted.items.length === 1 ? `${analysis.extracted.items[0].id}.description` : null;
  if (field === 'originCountry') return analysis.extracted.certificateOfOriginAvailable && analysis.extracted.items.length === 1
    ? `${analysis.extracted.items[0].id}.originCountry` : null;
  if (field === 'packageCount') return 'totalPackageCount';
  if (field === 'consignee') return 'consigneeDetails.name';
  return new Set(['grossWeight', 'netWeight', 'loadPort', 'dischargePort', 'incoterms', 'currency', 'totalAmount']).has(field)
    ? field : null;
}

function rowValues(row: ImportComparisonRow) {
  return [
    { source: '상업송장 C/I', value: row.invoice },
    { source: '포장명세서 P/L', value: row.packingList },
    { source: '선하증권 B/L', value: row.billOfLading },
    { source: '원산지증명서 C/O', value: row.certificateOfOrigin ?? '' },
  ].filter((entry) => entry.value?.trim() && entry.value.trim() !== '-');
}

export default function ImportReturnRequestMatches({
  request,
  analysis,
  onFocusField,
  onUpload,
  onRemoveField,
  onRemoveDocument,
}: {
  request: Pick<ForwarderReturnRequest, 'comparisonFields' | 'documentTypes'>;
  analysis: ImportAnalysisResult | null;
  onFocusField?: (field: string) => void;
  onUpload?: () => void;
  onRemoveField?: (field: string) => void;
  onRemoveDocument?: (type: string) => void;
}) {
  const rows = analysis?.comparison.filter((row) => request.comparisonFields?.includes(row.field)) ?? [];
  const docs = request.documentTypes ?? [];
  if (rows.length === 0 && docs.length === 0) return null;
  return <div className="rr-matches" aria-label="서류 보완 항목">
    <p className="rr-matches-intro">요청 내용과 연결된 서류 정보</p>
    {rows.map((row) => {
      const values = rowValues(row);
      const inputKey = analysis ? importReturnInputKey(row.field, analysis) : null;
      return <div className="rr-match" key={row.field}>
        <div className="rr-match-head"><strong>{importReturnFieldLabel(row.field)} 확인</strong>{onRemoveField && <button type="button" onClick={() => onRemoveField(row.field)}>연결 제외</button>}</div>
        <div className="rr-match-values">
          {values.map((entry) => <span key={entry.source}><small>{entry.source}</small><b>{entry.value}</b></span>)}
        </div>
        {((onFocusField && inputKey) || onUpload) && <div className="rr-match-actions">
          {onFocusField && inputKey && <button type="button" className="btn btn-secondary" onClick={() => onFocusField(inputKey)}>추출값 확인·수정</button>}
          {onUpload && <button type="button" className="btn btn-secondary" onClick={onUpload}>원본 수정본 올리기</button>}
        </div>}
      </div>;
    })}
    {docs.map((type) => <div className="rr-match rr-match-document" key={type}>
      <div className="rr-match-head"><strong>{returnRequestDocumentLabel(type)} 수정본 확인</strong>{onRemoveDocument && <button type="button" onClick={() => onRemoveDocument(type)}>연결 제외</button>}</div>
      <p>발행처에서 받은 수정본을 다시 올려 주세요.</p>
      {onUpload && <button type="button" className="btn btn-secondary" onClick={onUpload}>서류 다시 올리기</button>}
    </div>)}
    {rows.length > 0 && <p className="rr-matches-note">추출값을 고쳐도 첨부된 원본 서류는 바뀌지 않습니다. 원본의 기재가 틀렸다면 발행처에 수정본을 요청해 다시 올려 주세요.</p>}
  </div>;
}
