import { Agent, HSCodeResult, AgentLog, createLog } from './types';
import { suggestHSCode } from '../services/claudeService';
import {
  findHSCodesByItemName,
  classifyFishHS
} from './hsCodeDict';
import {
  searchHSByKeyword,
  lookupHSByCode,
  loadHSData
} from '../services/hsDataService';

/** 검색 점수를 신뢰도 라벨로 변환 */
function scoreToConfidence(score: number): string {
  if (score >= 7) return '높음';
  if (score >= 4) return '보통';
  return '낮음';
}

/** HS Code에서 공백, 점, 하이픈 제거 */
export function cleanHSCode(code: string): string {
  return code.replace(/[\s.-]/g, '');
}

/** HS Code를 화면 표시 형식으로 변환 */
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

type HSCodeAgentInput = {
  itemName: string;
  hsCode?: string;
  useLLM?: boolean;
  logs: AgentLog[];
};

export class HSCodeAgent
  implements Agent<HSCodeAgentInput, HSCodeResult>
{
  readonly name = 'HSCode Agent';

  async run(input: HSCodeAgentInput): Promise<HSCodeResult> {
    const {
      itemName,
      hsCode,
      useLLM = false,
      logs
    } = input;

    logs.push(
      createLog(
        this.name,
        '품목명 기반 HS Code 분류 및 추천 작업 시작...',
        'info'
      )
    );

    /*
     * 1. 품목명 기반 후보 추천
     *
     * 후보 검색 순서:
     * 1) 어종 전용 분류
     * 2) OpenAI Edge Function
     * 3) 관세청 HS 로컬 사전
     * 4) 내장 HS Code 사전
     */
    let candidates: HSCodeResult['candidates'] = [];
    // 어류 등 보존·가공 상태가 불명확하면 코드 대신 선택 안내를 담는다(설정 시 폴백 검색 건너뜀).
    let disambiguation: HSCodeResult['disambiguation'];

    if (itemName && itemName.trim() !== '') {
      const trimmedItemName = itemName.trim();

      logs.push(
        createLog(
          this.name,
          `추천 분석할 품목명: "${trimmedItemName}" (AI 활용 여부: ${
            useLLM ? '예' : '아니오'
          })`,
          'info'
        )
      );

      try {
        /*
         * 1-1. 어종 우선 분류
         *
         * 생선 및 수산물은 보존 상태에 따라 HS Code가 크게 달라지므로
         * 일반 검색보다 먼저 분류합니다.
         *
         * 예:
         * - 신선·냉장: 0302
         * - 냉동: 0303
         * - 건조·염장: 0305
         */
        const fishClass = classifyFishHS(trimmedItemName);

        if (fishClass) {
          if (fishClass.resolved && fishClass.resolved.length > 0) {
            // 품목명에 보존상태가 있어 바로 실제 HS 후보로 확정
            candidates = fishClass.resolved.map(candidate => ({
              code: formatHSCode(candidate.code),
              description: candidate.description,
              confidence: candidate.confidence,
              reasoning: candidate.reasoning
            }));
            logs.push(
              createLog(
                this.name,
                `${fishClass.species} 보존상태 인식 — HS 후보 ${candidates.length}건 생성`,
                'success'
              )
            );
          } else if (fishClass.disambiguation) {
            // 보존상태 불명 — 코드 대신 선택 안내(상태별 실제 후보를 옵션에 담아 전달)
            disambiguation = {
              question: fishClass.disambiguation.question,
              note: fishClass.disambiguation.note,
              options: fishClass.disambiguation.options.map(o => ({
                key: o.key,
                label: o.label,
                candidates: o.candidates.map(candidate => ({
                  code: formatHSCode(candidate.code),
                  description: candidate.description,
                  confidence: candidate.confidence,
                  reasoning: candidate.reasoning
                }))
              }))
            };
            logs.push(
              createLog(
                this.name,
                `${fishClass.species} — 보존·가공 상태 확인 필요(선택지 ${disambiguation.options.length}건 안내)`,
                'info'
              )
            );
          }
        }

        /*
         * 1-2. OpenAI 추천
         *
         * useLLM이 true이고 어종 전용 후보가 없을 때만 호출합니다.
         *
         * OpenAI 호출에 실패하더라도 전체 추천 작업을 중단하지 않고
         * 관세청 HS 사전 검색으로 넘어갑니다.
         */
        if (candidates.length === 0 && !disambiguation && useLLM) {
          try {
            const suggestions = await suggestHSCode(trimmedItemName);

            candidates = suggestions.map(candidate => ({
              code: formatHSCode(candidate.code),
              description: candidate.description,
              confidence: candidate.confidence,
              reasoning: candidate.reasoning
            }));

            logs.push(
              createLog(
                this.name,
                `OpenAI 기반 후보 ${candidates.length}건 수신`,
                'success'
              )
            );
          } catch (llmError) {
            const message =
              llmError instanceof Error
                ? llmError.message
                : String(llmError);

            logs.push(
              createLog(
                this.name,
                `OpenAI 추천 실패(${message}) — 관세청 HS 사전 검색으로 대체합니다.`,
                'warning'
              )
            );
          }
        }

        /*
         * 1-3. 관세청 HS부호 로컬 사전 검색
         */
        if (candidates.length === 0 && !disambiguation) {
          const dbResults = await searchHSByKeyword(trimmedItemName);

          if (dbResults.length > 0) {
            candidates = dbResults.map(result => ({
              code: result.formattedCode,
              description: result.category
                ? `${result.ko} ${result.category}`
                : result.ko,
              confidence: scoreToConfidence(result.score),
              reasoning:
                `관세청 HS부호 사전 기준 · ` +
                `영문명: ${result.en || '-'} · ` +
                `단위: ${result.wtUnit || result.qtyUnit || '-'}`
            }));

            logs.push(
              createLog(
                this.name,
                `관세청 HS 사전에서 ${candidates.length}건 매칭`,
                'success'
              )
            );
          }
        }

        /*
         * 1-4. 최종 폴백: 프로젝트 내장 HS Code 사전
         *
         * 관세청 사전 로딩 실패 또는 검색 결과가 없는 경우 사용합니다.
         */
        if (candidates.length === 0 && !disambiguation) {
          const localSuggestions =
            findHSCodesByItemName(trimmedItemName);

          candidates = localSuggestions.map(candidate => ({
            code: formatHSCode(candidate.code),
            description: candidate.description,
            confidence: candidate.confidence,
            reasoning: candidate.reasoning
          }));

          if (candidates.length > 0) {
            logs.push(
              createLog(
                this.name,
                `내장 HS 사전에서 후보 ${candidates.length}건 매칭`,
                'success'
              )
            );
          }
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        logs.push(
          createLog(
            this.name,
            `추천 중 오류 발생: ${message}`,
            'error'
          )
        );
      }
    }

    /*
     * 2. 사용자가 HS Code를 직접 입력한 경우
     *
     * 입력된 코드를 검증하는 모드입니다.
     */
    if (hsCode && hsCode.trim() !== '') {
      logs.push(
        createLog(
          this.name,
          `입력된 HS Code 검증 진행: "${hsCode}"`,
          'info'
        )
      );

      const cleaned = cleanHSCode(hsCode);
      const isNumeric = /^\d+$/.test(cleaned);

      /*
       * 2-1. 숫자 형식 검증
       */
      if (!isNumeric) {
        const message =
          'HS CODE는 숫자만 포함해야 합니다.';

        logs.push(
          createLog(
            this.name,
            `검증 실패: ${message}`,
            'error'
          )
        );

        return {
          topCode: hsCode,
          candidates,
          status: 'invalid',
          formattedCode: hsCode,
          validationMessage: message
        };
      }

      /*
       * 2-2. 길이 검증
       *
       * - 6자리: 국제 공통 HS Code
       * - 10자리: 대한민국 HSK
       */
      if (
        cleaned.length !== 6 &&
        cleaned.length !== 10
      ) {
        const message =
          'HS CODE는 6자리(국제 기준) 또는 10자리(한국 HSK 기준)여야 합니다.';

        logs.push(
          createLog(
            this.name,
            `검증 실패: ${message}`,
            'error'
          )
        );

        return {
          topCode: hsCode,
          candidates,
          status: 'invalid',
          formattedCode: hsCode,
          validationMessage: message
        };
      }

      /*
       * 2-3. Chapter 범위 검증
       */
      const chapter = parseInt(
        cleaned.slice(0, 2),
        10
      );

      const formatted = formatHSCode(cleaned);

      if (chapter < 1 || chapter > 97) {
        const message =
          'Chapter 코드(앞 2자리)가 특수 범위(00, 98-99)에 속해 있어 검토가 필요합니다.';

        logs.push(
          createLog(
            this.name,
            `검토 필요: ${message}`,
            'warning'
          )
        );

        return {
          topCode: formatted,
          candidates,
          status: 'needs_review',
          formattedCode: formatted,
          validationMessage: message
        };
      }

      /*
       * 2-4. 관세청 HS 사전에서 실제 코드 조회
       */
      try {
        const dbEntry =
          await lookupHSByCode(cleaned);

        if (dbEntry) {
          const label = dbEntry.category
            ? `${dbEntry.ko} ${dbEntry.category}`
            : dbEntry.ko;

          logs.push(
            createLog(
              this.name,
              `HS Code 검증 통과: ${formatted} (${label})`,
              'success'
            )
          );

          return {
            topCode: formatted,
            candidates,
            status: 'valid',
            formattedCode: formatted,
            validationMessage:
              `유효한 HS CODE입니다. ` +
              `관세청 사전 품목: ${label} ` +
              `(${dbEntry.en || '-'})`
          };
        }

        /*
         * 관세청 사전이 정상적으로 로드된 경우에만
         * 10자리 코드의 미등록 여부를 판단합니다.
         *
         * 오프라인 또는 데이터 로드 실패 상황에서는
         * 사전에 없다는 이유만으로 invalid 처리하지 않습니다.
         */
        const loadedHSData = await loadHSData();
        const dbLoaded = loadedHSData.length > 0;

        if (dbLoaded && cleaned.length === 10) {
          logs.push(
            createLog(
              this.name,
              `HS Code 형식 유효하나 사전 미등록: ${formatted}`,
              'warning'
            )
          );

          return {
            topCode: formatted,
            candidates,
            status: 'needs_review',
            formattedCode: formatted,
            validationMessage:
              '형식은 유효하나 관세청 HS부호 사전에 없는 코드입니다. 코드를 재확인하세요.'
          };
        }
      } catch (lookupError) {
        const message =
          lookupError instanceof Error
            ? lookupError.message
            : String(lookupError);

        logs.push(
          createLog(
            this.name,
            `관세청 HS 사전 검증 실패(${message}) — 형식 검증 결과를 사용합니다.`,
            'warning'
          )
        );
      }

      /*
       * 사전 조회 결과가 없거나 사전 로드가 불가능한 경우
       * 숫자 및 자리수 형식 검증 결과를 기준으로 통과시킵니다.
       */
      logs.push(
        createLog(
          this.name,
          `HS Code 형식 검증 통과: ${formatted}`,
          'success'
        )
      );

      return {
        topCode: formatted,
        candidates,
        status: 'valid',
        formattedCode: formatted,
        validationMessage:
          '유효한 HS CODE 형식입니다.'
      };
    }

    /*
     * 3. HS Code가 입력되지 않은 경우
     *
     * 품목명을 이용해 추천한 후보를 반환합니다.
     */
    // 3-0. 보존·가공 상태 확인이 필요하면 코드 대신 선택 안내를 반환한다.
    if (disambiguation) {
      logs.push(
        createLog(
          this.name,
          '보존·가공 상태 선택 안내를 반환합니다(코드 미확정).',
          'info'
        )
      );
      return {
        topCode: '',
        candidates: [],
        status: 'needs_review',
        formattedCode: '',
        validationMessage: disambiguation.question,
        disambiguation
      };
    }

    if (candidates.length > 0) {
      const topCandidate = candidates[0];
      const topCode = topCandidate.code;

      logs.push(
        createLog(
          this.name,
          `HS Code 추천 완료. 최적 코드: ${topCode} (${topCandidate.description})`,
          'success'
        )
      );

      return {
        topCode,
        candidates,
        status: 'suggested',
        formattedCode: topCode,
        validationMessage:
          '추천된 HS CODE입니다.'
      };
    }

    logs.push(
      createLog(
        this.name,
        '추천 후보를 찾지 못했습니다.',
        'warning'
      )
    );

    return {
      topCode: '',
      candidates: [],
      status: 'invalid',
      formattedCode: '',
      validationMessage:
        '수출입 신고를 위한 HS CODE 정보가 누락되었습니다.'
    };
  }
}