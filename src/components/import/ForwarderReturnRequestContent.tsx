const GREETING = '안녕하세요.\n수입 서류 검토 중 아래 항목의 보완을 요청드립니다.';
const CLOSING = '확인 후 수정한 서류와 함께 회신 부탁드립니다.\n감사합니다.';

/** Save the signature at sending time so another viewer's profile cannot replace it. */
export function buildReturnRequestLetter(body: string, company: string, contact: string) {
  const sender = [company.trim(), '포워더', contact.trim()].filter(Boolean).join(' ');
  return `${GREETING}\n\n${body}\n\n${CLOSING}\n\n${sender} 드림`;
}

export function readReturnRequestLetter(reason: string) {
  const boundary = `\n\n${CLOSING}\n\n`;
  const closingIndex = reason.lastIndexOf(boundary);
  if (!reason.startsWith(`${GREETING}\n\n`) || closingIndex < GREETING.length || !reason.endsWith(' 드림')) return { body: reason };
  return { greeting: GREETING, body: reason.slice(GREETING.length + 2, closingIndex), closing: CLOSING, signature: reason.slice(closingIndex + boundary.length) };
}

/** Display existing request text in sections without modifying the saved message. */
export function splitReturnRequest(reason: string) {
  const groups: { kind: 'required' | 'recommended' | 'note'; title: string; lines: string[] }[] = [];
  let group: typeof groups[number] = { kind: 'note', title: '요청 내용', lines: [] };
  const flush = () => { if (group.lines.join('\n').trim()) groups.push(group); };
  for (const line of reason.split(/\r?\n/)) {
    if (line.trim() === '[반드시 수정]' || line.trim() === '[함께 확인 요청]') {
      flush();
      const required = line.trim() === '[반드시 수정]';
      group = { kind: required ? 'required' : 'recommended', title: required ? '필수 수정' : '추가 확인', lines: [] };
    } else if (line.startsWith('(추가 안내)')) {
      flush();
      group = { kind: 'note', title: '전달 메모', lines: [line.slice('(추가 안내)'.length).trimStart()] };
    } else {
      group.lines.push(line);
    }
  }
  flush();
  return groups;
}

export default function ForwarderReturnRequestContent({ reason }: { reason: string }) {
  const letter = readReturnRequestLetter(reason);
  const groups = splitReturnRequest(letter.body);
  return <div className="fwd-return-sections">
    {letter.greeting && <p className="fwd-return-letter-text">{letter.greeting}</p>}
    {groups.map((group, index) => <div className={`fwd-return-section is-${group.kind}`} key={index}>
      <h3>{group.title}</h3>
      <p>{group.lines.join('\n').trim()}</p>
    </div>)}
    {letter.closing && <div className="fwd-return-letter-ending"><p className="fwd-return-letter-text">{letter.closing}</p><p className="fwd-return-letter-signature">{letter.signature}</p></div>}
  </div>;
}
