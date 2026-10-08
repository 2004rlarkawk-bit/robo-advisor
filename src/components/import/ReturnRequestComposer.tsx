import { useRef, useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import type { ImportAnalysisResult, ImportComparisonRow } from '../../types/importTrade';
import { interpretImportReturnRequest, type InterpretedImportReturnRequest } from '../../services/importReturnRequestInterpretationService';
import { returnRequestDocumentLabel } from '../../utils/returnRequestDocuments';
import ForwarderReturnRequestContent, { buildReturnRequestLetter } from './ForwarderReturnRequestContent';
import ImportReturnRequestMatches, { importReturnFieldLabel } from './ImportReturnRequestMatches';
import '../../styles/returnRequest.css';

export interface ComposedReturnRequest {
  reason: string;
  documentTypes: string[];
  comparisonFields: string[];
  issueTitles: string[];
}

interface Props {
  comparisonRows: ImportComparisonRow[];
  analysis: ImportAnalysisResult;
  issuerName: string;
  senderContactName: string;
  saving: boolean;
  onCancel: () => void;
  onSend: (request: ComposedReturnRequest) => void;
}

/** 포워더는 문장만 작성한다. 연결된 서류 값은 시스템이 제안하되 전송 전에 포워더가 확인한다. */
export default function ReturnRequestComposer({
  comparisonRows, analysis, issuerName, senderContactName, saving, onCancel, onSend,
}: Props) {
  const [memo, setMemo] = useState('');
  const [interpretation, setInterpretation] = useState<InterpretedImportReturnRequest | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretationError, setInterpretationError] = useState('');
  const textVersion = useRef(0);
  const letter = memo.trim() ? buildReturnRequestLetter(memo.trim(), issuerName, senderContactName) : '';

  const preview = async () => {
    if (!memo.trim() || interpreting || saving) return;
    setInterpreting(true);
    setInterpretationError('');
    const version = textVersion.current;
    try {
      const result = await interpretImportReturnRequest(memo, comparisonRows);
      if (version === textVersion.current) setInterpretation(result);
    } catch (error) {
      if (version === textVersion.current) {
        setInterpretation(null);
        setInterpretationError(error instanceof Error ? error.message : '요청 내용을 해석하지 못했습니다.');
      }
    } finally {
      if (version === textVersion.current) setInterpreting(false);
    }
  };

  const send = (mapped: InterpretedImportReturnRequest) => {
    if (!letter || saving) return;
    const titles = [
      ...mapped.comparisonFields.map(importReturnFieldLabel),
      ...mapped.documentTypes.map(returnRequestDocumentLabel),
    ].slice(0, 5);
    onSend({
      reason: letter,
      comparisonFields: mapped.comparisonFields,
      documentTypes: mapped.documentTypes,
      issueTitles: titles.length ? titles : ['서술식 보완 요청'],
    });
  };

  return <section className="form-card import-card rr-composer" aria-label="서류 보완 요청 작성">
    <div className="import-card-heading"><div>
      <h2>서류 보완 요청</h2>
      <p>고쳐야 할 내용을 평소처럼 적어 주세요. 전송 전 서류 대사와 연결된 항목을 확인할 수 있습니다.</p>
    </div></div>
    <label className="form-group rr-memo">
      <span className="form-label">화주에게 보낼 내용</span>
      <textarea
        className="form-input"
        rows={4}
        maxLength={2000}
        value={memo}
        onChange={(event) => { textVersion.current += 1; setMemo(event.target.value); setInterpretation(null); setInterpreting(false); setInterpretationError(''); }}
        placeholder="예: P/L 수량은 160개인데 C/I에는 150개로 적혀 있습니다. 실제 수량을 확인하고 수정본을 보내 주세요."
      />
    </label>
    {letter && <details className="fwd-return-letter-preview"><summary>화주에게 보낼 원문 보기</summary><ForwarderReturnRequestContent reason={letter} /></details>}
    {interpretation && <div className="rr-interpretation" role="status">
      {interpretation.comparisonFields.length || interpretation.documentTypes.length
        ? <ImportReturnRequestMatches
            request={interpretation}
            analysis={analysis}
            onRemoveField={(field) => setInterpretation((current) => current ? { ...current, comparisonFields: current.comparisonFields.filter((value) => value !== field) } : current)}
            onRemoveDocument={(type) => setInterpretation((current) => current ? { ...current, documentTypes: current.documentTypes.filter((value) => value !== type) } : current)}
          />
        : <p>자동으로 연결된 항목이 없습니다. 아래 원문은 그대로 전달됩니다.</p>}
      <p className="rr-matches-note">연결 결과를 확인해 주세요. 시스템은 어느 서류의 값이 맞는지 결정하거나 원본을 수정하지 않습니다.</p>
    </div>}
    {interpretationError && <p className="form-message warning" role="alert">자동 연결에 실패했습니다. 원문만 보내거나 다시 시도할 수 있습니다. ({interpretationError})</p>}
    <div className="rr-actions">
      <button type="button" className="btn btn-secondary" disabled={saving || interpreting} onClick={onCancel}>취소</button>
      {!interpretation && <button type="button" className="btn btn-secondary" disabled={!memo.trim() || saving || interpreting} onClick={() => void preview()}>{interpreting ? '확인 중…' : '연결 항목 확인'}</button>}
      {interpretationError && <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => send({ comparisonFields: [], documentTypes: [] })}>원문만 보내기</button>}
      {interpretation && <button type="button" className="btn btn-primary" disabled={saving} onClick={() => send(interpretation)}><CornerUpLeft size={15} /> {saving ? '보내는 중…' : '보완 요청 보내기'}</button>}
    </div>
  </section>;
}
