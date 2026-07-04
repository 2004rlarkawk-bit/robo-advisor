/**
 * 에이전트 공통 인터페이스 및 공유 타입
 */

// 모든 에이전트의 공통 인터페이스
export interface Agent<I = any, O = any> {
  readonly name: string;
  run(input: I): Promise<O>;
}

// 에이전트 실행 로그
export interface AgentLog {
  timestamp: string;
  agentName: string;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

// 에러 정보
export interface ExecutionError {
  message: string;
  stack?: string;
  timestamp: string;
}

// HSCodeAgent 출력
export interface HSCodeResult {
  topCode: string;
  candidates: {
    code: string;
    description: string;
    confidence: string;
    reasoning: string;
  }[];
  status?: 'valid' | 'needs_review' | 'invalid' | 'suggested';
  formattedCode?: string;
  validationMessage?: string;
}

// DocumentAgent 출력
export interface DocumentResult {
  documents: import('../types').DocumentStatus[];
  generatedDocs: import('../types').GeneratedDocuments;
  htmlTemplates?: Record<string, string>;
}

// ComplianceAgent 출력
export interface ComplianceResult {
  issues: import('../types').ValidationIssue[];
}

// FeedbackAgent 출력
export interface FeedbackResult {
  message: string;
}

// OrchestratorAgent 통합 출력
export interface OrchestratorResult {
  hs: HSCodeResult | null;
  documents: DocumentResult | null;
  issues: ComplianceResult | null;
  feedback: FeedbackResult | null;
  logs: AgentLog[];
  executionId: string;
  executionTime: number;
  error?: ExecutionError;
}

// 로그 헬퍼
export function createLog(
  agentName: string,
  message: string,
  level: AgentLog['level'] = 'info'
): AgentLog {
  return {
    timestamp: new Date().toLocaleTimeString('ko-KR'),
    agentName,
    message,
    level,
  };
}
