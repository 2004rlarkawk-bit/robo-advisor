import { describe, expect, it } from 'vitest';
import { portaiFileName } from './documentFileName';

describe('서류 파일 이름 규칙 PortAI_문서명_월.일', () => {
  const date = new Date(2026, 8, 5);

  it('문서 종류별 영문 이름과 날짜(월.일)를 붙인다', () => {
    expect(portaiFileName('invoice', 'docx', date)).toBe('PortAI_commercial.invoice_09.05.docx');
    expect(portaiFileName('packing_list', '.pdf', date)).toBe('PortAI_packing.list_09.05.pdf');
    expect(portaiFileName('import_declaration_request', 'docx', date)).toBe('PortAI_import.declaration.request_09.05.docx');
  });

  it('확장자가 없으면 이름만, 모르는 종류는 밑줄을 점으로 바꿔 쓴다', () => {
    expect(portaiFileName('bl', '', date)).toBe('PortAI_bill.of.lading_09.05');
    expect(portaiFileName('some_new_doc', 'docx', date)).toBe('PortAI_some.new.doc_09.05.docx');
  });
});
