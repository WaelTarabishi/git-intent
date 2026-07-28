import type { CommitAnalysis } from "../analysis/commit-analysis-schema.js";
import type { ValidatedStagedChangeAnalysis } from "../analysis/analysis-schema.js";

export interface CommitAnalysisRequest {
  stagedChanges: ValidatedStagedChangeAnalysis;
}

export interface CommitAnalysisProvider {
  readonly id: string;
  readonly progressMessage?: string;
  analyze(request: CommitAnalysisRequest): Promise<CommitAnalysis>;
}
