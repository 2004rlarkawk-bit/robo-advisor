import { Agent, OrchestratorResult, AgentLog, createLog } from "./types";
import { TradeProfile } from "../types";
import { HSCodeAgent } from "./HSCodeAgent";
import { DocumentAgent } from "./DocumentAgent";
import { ComplianceAgent } from "./ComplianceAgent";
import { FeedbackAgent } from "./FeedbackAgent";

interface OrchestratorAgentConfig {
  timeout?: number;
  validateInput?: boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

export class OrchestratorAgent implements Agent<{ profile: TradeProfile; useLLM?: boolean }, OrchestratorResult> {
  readonly name = "Orchestrator Agent";
  private readonly config: OrchestratorAgentConfig;

  private hsCodeAgent: Agent;
  private documentAgent: Agent;
  private complianceAgent: Agent;
  private feedbackAgent: Agent;

  constructor(
    config: OrchestratorAgentConfig = {},
    hsCodeAgent?: Agent,
    documentAgent?: Agent,
    complianceAgent?: Agent,
    feedbackAgent?: Agent
  ) {
    this.config = {
      timeout: 30000,
      validateInput: true,
      ...config
    };

    this.hsCodeAgent = hsCodeAgent || new HSCodeAgent();
    this.documentAgent = documentAgent || new DocumentAgent();
    this.complianceAgent = complianceAgent || new ComplianceAgent();
    this.feedbackAgent = feedbackAgent || new FeedbackAgent();
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private validateInput(profile: TradeProfile): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!profile) {
      errors.push({ field: "profile", message: "Profile이 필수입니다." });
      return errors;
    }

    if (!profile.itemName || profile.itemName.trim() === "") {
      errors.push({ field: "itemName", message: "상품명이 필수입니다." });
    } else if (profile.itemName.length > 500) {
      errors.push({ field: "itemName", message: "상품명은 500자 이하여야 합니다." });
    }

    // hsCode 형식 오류는 치명 오류로 다루지 않는다 — HSCodeAgent가 invalid/needs_review
    // 상태로 판정하고 ComplianceAgent가 보완 이슈로 변환해 사용자 수정 흐름으로 이어진다.

    return errors;
  }

  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`작업 타임아웃 (${timeoutMs}ms)`)), timeoutMs)
      )
    ]);
  }

  async run(input: { profile: TradeProfile; useLLM?: boolean }): Promise<OrchestratorResult> {
    const startTime = Date.now();
    // 동시 실행 시에도 각 run() 호출이 고유 ID를 갖도록 실행마다 새로 생성
    const executionId = this.generateExecutionId();
    const { profile, useLLM = false } = input;
    const logs: AgentLog[] = [];

    logs.push(
      createLog(this.name, `[${executionId}] 오케스트레이터 파이프라인 가동 시작...`, "info")
    );

    try {
      if (this.config.validateInput) {
        const validationErrors = this.validateInput(profile);
        if (validationErrors.length > 0) {
          const errorMsg = validationErrors.map(e => `${e.field}: ${e.message}`).join(", ");
          logs.push(createLog(this.name, `입력값 검증 실패: ${errorMsg}`, "error"));
          throw new Error(`입력값 검증 오류: ${errorMsg}`);
        }

        if (profile?.hsCode) {
          const digitsOnly = profile.hsCode.replace(/[.\-\s]/g, "");
          if (!/^\d{6,10}$/.test(digitsOnly)) {
            logs.push(
              createLog(
                this.name,
                `HS Code 형식이 비표준입니다("${profile.hsCode}") — HSCodeAgent 검증으로 위임합니다.`,
                "warning"
              )
            );
          }
        }
      }

      let hsResult;
      try {
        hsResult = await this.runWithTimeout(
          this.hsCodeAgent.run({ itemName: profile.itemName, hsCode: profile.hsCode, useLLM, logs }),
          this.config.timeout!
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
        logs.push(createLog(this.name, `HSCodeAgent 실행 실패: ${errorMsg}`, "error"));
        throw new Error(`HS Code 검증 실패: ${errorMsg}`);
      }

      if (!hsResult || typeof hsResult.topCode !== "string") {
        logs.push(createLog(this.name, "HS Code 검증 결과가 없습니다.", "error"));
        throw new Error("HS Code 검증 결과 없음");
      }
      if (!hsResult.topCode) {
        // 후보 없음은 호출 실패가 아니다. ComplianceAgent가 hscode-missing 오류로 내려
        // 사용자가 직접 수정/override할 수 있게 하고 나머지 문서 조립은 계속한다.
        logs.push(createLog(this.name, "HS Code 후보가 없어 공란으로 문서 검증을 계속합니다.", "warning"));
      }

      const updatedProfile: TradeProfile = {
        ...profile,
        hsCode: profile.hsCode || hsResult.topCode
      };

      if (!profile.hsCode && hsResult.topCode) {
        logs.push(
          createLog(
            this.name,
            `프로필에 HS Code가 누락되어 추천 상위 코드 "${hsResult.topCode}"을(를) 자동 보완했습니다.`,
            "info"
          )
        );
      }

      let docResult;
      try {
        docResult = await this.runWithTimeout(
          this.documentAgent.run({ profile: updatedProfile, hsResult, useLLM, logs }),
          this.config.timeout!
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
        logs.push(createLog(this.name, `DocumentAgent 실행 실패: ${errorMsg}`, "error"));
        throw new Error(`문서 생성 실패: ${errorMsg}`);
      }

      let compResult;
      try {
        compResult = await this.runWithTimeout(
          this.complianceAgent.run({
            profile: updatedProfile,
            documents: docResult.documents,
            hsResult,
            generatedDocs: docResult.generatedDocs,
            logs
          }),
          this.config.timeout!
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
        logs.push(createLog(this.name, `ComplianceAgent 실행 실패: ${errorMsg}`, "error"));
        throw new Error(`규정 검증 실패: ${errorMsg}`);
      }

      let feedResult;
      try {
        feedResult = await this.runWithTimeout(
          this.feedbackAgent.run({
            profile: updatedProfile,
            issues: compResult.issues,
            useLLM,
            logs
          }),
          this.config.timeout!
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
        logs.push(createLog(this.name, `FeedbackAgent 실행 실패: ${errorMsg}`, "error"));
        throw new Error(`피드백 생성 실패: ${errorMsg}`);
      }

      const executionTime = Date.now() - startTime;
      logs.push(
        createLog(
          this.name,
          `[${executionId}] 오케스트레이터 전체 에이전트 협업 루프 완료. (소요시간: ${executionTime}ms)`,
          "success"
        )
      );

      return {
        hs: hsResult,
        documents: docResult,
        issues: compResult,
        feedback: feedResult,
        logs,
        executionId: executionId,
        executionTime
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류";
      const errorStack = error instanceof Error ? error.stack : "";

      logs.push(
        createLog(
          this.name,
          `[${executionId}] 오케스트레이터 전체 파이프라인 실패: ${errorMsg}`,
          "error"
        )
      );

      return {
        hs: null as any,
        documents: null as any,
        issues: null as any,
        feedback: null as any,
        logs,
        executionId: executionId,
        executionTime,
        error: {
          message: errorMsg,
          stack: errorStack,
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}
