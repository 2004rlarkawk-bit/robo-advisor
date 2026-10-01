import type { RefObject } from 'react';
import { Terminal } from 'lucide-react';
import type { AgentLog } from '../agents/types';

interface Props {
  logs: AgentLog[];
  isProcessing: boolean;
  endRef: RefObject<HTMLDivElement>;
  onClose: () => void;
}

/** Agent 파이프라인 실행 로그를 보여주는 콘솔 창. */
export default function AgentConsoleOverlay({ logs, isProcessing, endRef, onClose }: Props) {
  return (
    <div className="console-overlay">
      <div className="console-modal">
        <div className="console-header">
          <div className="console-title-group">
            <Terminal size={16} />
            <span>PortAI Agent Pipeline Runner</span>
          </div>
          <div className="console-dots">
            <span className="console-dot red"></span>
            <span className="console-dot yellow"></span>
            <span className="console-dot green"></span>
          </div>
        </div>

        <div className="console-body">
          {logs.map((log, index) => (
            <div className="log-row" key={index}>
              <span className="log-time">[{log.timestamp}]</span>
              <span className="log-agent">{log.agentName}:</span>
              <span className={`log-text-content ${log.level}`}>
                {log.message}
              </span>
            </div>
          ))}
          {isProcessing && (
            <div className="log-row">
              <span className="log-time">⏳</span>
              <span className="log-agent" style={{ color: '#fb7185' }}>Pipeline:</span>
              <span className="log-text-content" style={{ color: '#fb7185', fontStyle: 'italic' }}>
                에이전트 연계 연산 처리 중...
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="console-footer">
          <button
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={isProcessing}
            style={{ opacity: isProcessing ? 0.6 : 1, cursor: isProcessing ? 'not-allowed' : 'pointer' }}
          >
            콘솔 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
