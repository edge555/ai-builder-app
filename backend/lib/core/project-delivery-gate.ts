import type {
  QualityIssue,
  QualityReport,
  RepairLevelReached,
} from '@ai-app-builder/shared';
import { createLogger } from '../logger';
import type {
  AcceptanceGate,
  AcceptanceIssue,
} from './acceptance-gate';
import { createAcceptanceGate } from './acceptance-gate';
import type { BuildError } from './build-validator';
import type {
  RuntimeSmokeIssue,
  RuntimeSmokeResult,
} from './runtime-smoke';
import { runRuntimeSmokeTest } from './runtime-smoke';

const logger = createLogger('ProjectDeliveryGate');

export interface DeliveryEvaluation {
  approved: boolean;
  deliveryStage: QualityReport['deliveryStage'];
  issues: QualityIssue[];
  acceptanceIssues: AcceptanceIssue[];
  buildErrors: BuildError[];
  runtimeSmoke: RuntimeSmokeResult;
}

export interface DeliveryRepairRequest {
  files: Record<string, string>;
  prompt: string;
  requestId?: string;
  changedFiles?: string[];
  evaluation: DeliveryEvaluation;
}

export interface DeliveryRepairResult<TMeta = undefined> {
  files: Record<string, string>;
  repairAttempts: number;
  repairLevelReached: RepairLevelReached;
  /** Final evaluation after repair — if provided, skips redundant re-evaluation in deliver(). */
  finalEvaluation?: DeliveryEvaluation;
  meta?: TMeta;
}

export interface ProjectDeliveryRequest<TMeta = undefined> {
  files: Record<string, string>;
  prompt: string;
  requestId?: string;
  changedFiles?: string[];
  repair?: (request: DeliveryRepairRequest) => Promise<DeliveryRepairResult<TMeta>>;
}

export type ProjectDeliveryResult<TMeta = undefined> =
  | {
      approved: true;
      files: Record<string, string>;
      qualityReport: QualityReport;
      meta?: TMeta;
    }
  | {
      approved: false;
      qualityReport: QualityReport;
      meta?: TMeta;
    };

export class ProjectDeliveryGate {
  constructor(
    private readonly acceptanceGate: AcceptanceGate = createAcceptanceGate(),
  ) {}

  async deliver<TMeta = undefined>(
    request: ProjectDeliveryRequest<TMeta>,
  ): Promise<ProjectDeliveryResult<TMeta>> {
    const contextLogger = request.requestId ? logger.withRequestId(request.requestId) : logger;
    const initialEvaluation = evaluateProjectDelivery({
      files: request.files,
      acceptanceGate: this.acceptanceGate,
      changedFiles: request.changedFiles,
    });

    if (initialEvaluation.approved) {
      return {
        approved: true,
        files: request.files,
        qualityReport: createQualityReport('approved', [], 0, 'none'),
      };
    }

    if (!request.repair) {
      return {
        approved: false,
        qualityReport: createQualityReport(
          initialEvaluation.deliveryStage,
          initialEvaluation.issues,
          0,
          'none',
        ),
      };
    }

    try {
      const repairResult = await request.repair({
        files: request.files,
        prompt: request.prompt,
        requestId: request.requestId,
        changedFiles: request.changedFiles,
        evaluation: initialEvaluation,
      });

      const finalEvaluation = repairResult.finalEvaluation ?? evaluateProjectDelivery({
        files: repairResult.files,
        acceptanceGate: this.acceptanceGate,
        changedFiles: request.changedFiles,
      });

      if (finalEvaluation.approved) {
        return {
          approved: true,
          files: repairResult.files,
          meta: repairResult.meta,
          qualityReport: createQualityReport(
            'approved',
            [],
            repairResult.repairAttempts,
            repairResult.repairLevelReached,
          ),
        };
      }

      return {
        approved: false,
        meta: repairResult.meta,
        qualityReport: createQualityReport(
          finalEvaluation.deliveryStage,
          finalEvaluation.issues,
          repairResult.repairAttempts,
          repairResult.repairLevelReached,
        ),
      };
    } catch (error) {
      contextLogger.error('Delivery repair exception', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        approved: false,
        qualityReport: createQualityReport(
          'repair',
          [{
            source: 'repair',
            type: 'repair_exception',
            message: 'Delivery repair failed',
          }],
          0,
          'none',
        ),
      };
    }
  }
}

export function createProjectDeliveryGate(): ProjectDeliveryGate {
  return new ProjectDeliveryGate();
}

export function evaluateProjectDelivery(args: {
  files: Record<string, string>;
  acceptanceGate?: AcceptanceGate;
  changedFiles?: string[];
}): DeliveryEvaluation {
  const acceptanceGate = args.acceptanceGate ?? createAcceptanceGate();
  const acceptance = acceptanceGate.validate(args.files, {
    changedFiles: args.changedFiles,
  });

  if (!acceptance.valid) {
    return {
      approved: false,
      deliveryStage: 'acceptance',
      issues: acceptance.issues.map(mapAcceptanceIssue),
      acceptanceIssues: acceptance.issues,
      buildErrors: acceptance.buildErrors,
      runtimeSmoke: {
        passed: false,
        framework: 'unknown',
        issues: [],
        interactionSignals: [],
      },
    };
  }

  const runtimeSmoke = runRuntimeSmokeTest(args.files);
  if (!runtimeSmoke.passed) {
    return {
      approved: false,
      deliveryStage: 'runtime_smoke',
      issues: runtimeSmoke.issues.map(mapRuntimeSmokeIssue),
      acceptanceIssues: [],
      buildErrors: [],
      runtimeSmoke,
    };
  }

  return {
    approved: true,
    deliveryStage: 'approved',
    issues: [],
    acceptanceIssues: [],
    buildErrors: [],
    runtimeSmoke,
  };
}

export function createQualityReport(
  deliveryStage: QualityReport['deliveryStage'],
  issues: QualityIssue[],
  repairAttempts: number,
  repairLevelReached: RepairLevelReached,
): QualityReport {
  return {
    deliveryStage,
    issues,
    repairAttempts,
    repairLevelReached,
  };
}

function mapAcceptanceIssue(issue: AcceptanceIssue): QualityIssue {
  return {
    source: 'acceptance',
    type: issue.type,
    message: issue.message,
    ...(issue.file ? { file: issue.file } : {}),
  };
}

function mapRuntimeSmokeIssue(issue: RuntimeSmokeIssue): QualityIssue {
  return {
    source: 'runtime_smoke',
    type: issue.type,
    message: issue.message,
    ...(issue.file ? { file: issue.file } : {}),
  };
}
