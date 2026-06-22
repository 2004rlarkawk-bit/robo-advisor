import { Agent, HSCodeResult, AgentLog, createLog } from './types';
import { suggestHSCode } from '../services/claudeService';
import { findHSCodesByItemName } from './hsCodeDict';

export function cleanHSCode(code: string): string {
  return code.replace(/[\s.-]/g, '');
}

export function formatHSCode(code: string): string {
  const cleaned = cleanHSCode(code);
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 4)}.${cleaned.slice(4, 6)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)}.${cleaned.slice(4, 6)}-${cleaned.slice(6, 10)}`;
  }
  return code;
}

export class HSCodeAgent implements Agent<{ itemName: string; hsCode?: string; useLLM?: boolean; logs: AgentLog[] }, HSCodeResult> {
  readonly name = 'HSCode Agent';

  async run(input: { itemName: string; hsCode?: string; useLLM?: boolean; logs: AgentLog[] }): Promise<HSCodeResult> {
    const { itemName, hsCode, useLLM = false, logs } = input;

    logs.push(createLog(this.name, '품목명 기반 HS Code 분류 및 추천 작업 시작...', 'info'));

    // 1. 후보군 추천 진행 (itemName이 있을 경우 항상 진행하여 UI/검증에서 활용 가능하도록 함)
    let candidates: HSCodeResult['candidates'] = [];
    if (itemName) {
      logs.push(createLog(this.name, `추천 분석할 품목명: "${itemName}" (AI 활용 여부: ${useLLM ? '예' : '아니오'})`, 'info'));
      try {
        if (useLLM) {
          const suggestions = await suggestHSCode(itemName);
          candidates = suggestions.map(c => ({
            code: formatHSCode(c.code),
            description: c.description,
            confidence: c.confidence,
            reasoning: c.reasoning
          }));
        } else {
          const localSuggestions = findHSCodesByItemName(itemName);
          candidates = localSuggestions.map(c => ({
            code: c.code, // hsCodeDict.ts에 이미 포맷팅되어 있음
            description: c.description,
            confidence: c.confidence,
            reasoning: c.reasoning
          }));
        }
      } catch (error) {
        logs.push(createLog(this.name, `추천 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`, 'error'));
      }
    }

    // 2. 검증 또는 추천 모드에 따라 최종 리턴 오브젝트 구성
    if (hsCode && hsCode.trim() !== '') {
      // 검증 모드
      logs.push(createLog(this.name, `입력된 HS Code 검증 진행: "${hsCode}"`, 'info'));
      const cleaned = cleanHSCode(hsCode);
      const isNumeric = /^\d+$/.test(cleaned);

      if (!isNumeric) {
        const msg = 'HS CODE는 숫자만 포함해야 합니다.';
        logs.push(createLog(this.name, `검증 실패: ${msg}`, 'error'));
        return {
          topCode: hsCode,
          candidates,
          status: 'invalid',
          formattedCode: hsCode,
          validationMessage: msg
        };
      }

      if (cleaned.length !== 6 && cleaned.length !== 10) {
        const msg = 'HS CODE는 6자리(국제 기준) 또는 10자리(한국 HSK 기준)여야 합니다.';
        logs.push(createLog(this.name, `검증 실패: ${msg}`, 'error'));
        return {
          topCode: hsCode,
          candidates,
          status: 'invalid',
          formattedCode: hsCode,
          validationMessage: msg
        };
      }

      const chapter = parseInt(cleaned.slice(0, 2), 10);
      const formatted = formatHSCode(cleaned);

      if (chapter < 1 || chapter > 97) {
        const msg = 'Chapter 코드(앞 2자리)가 특수 범위(00, 98-99)에 속해 있어 검토가 필요합니다.';
        logs.push(createLog(this.name, `검토 필요: ${msg}`, 'warning'));
        return {
          topCode: formatted,
          candidates,
          status: 'needs_review',
          formattedCode: formatted,
          validationMessage: msg
        };
      }

      logs.push(createLog(this.name, `HS Code 검증 통과: ${formatted}`, 'success'));
      return {
        topCode: formatted,
        candidates,
        status: 'valid',
        formattedCode: formatted,
        validationMessage: '유효한 HS CODE 형식입니다.'
      };
    } else {
      // 추천 모드 (hsCode가 비어 있음)
      if (candidates.length > 0) {
        const topCode = candidates[0].code;
        logs.push(createLog(this.name, `HS Code 추천 완료. 최적 코드: ${topCode} (${candidates[0].description})`, 'success'));
        return {
          topCode,
          candidates,
          status: 'suggested',
          formattedCode: topCode,
          validationMessage: '추천된 HS CODE입니다.'
        };
      } else {
        logs.push(createLog(this.name, '추천 후보를 찾지 못했습니다.', 'warning'));
        return {
          topCode: '',
          candidates: [],
          status: 'invalid',
          formattedCode: '',
          validationMessage: '수출입 신고를 위한 HS CODE 정보가 누락되었습니다.'
        };
      }
    }
  }
}
