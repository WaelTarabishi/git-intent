import { describe, expect, it } from "vitest";

import type { ValidatedStagedChangeAnalysis } from "../src/analysis/analysis-schema.js";
import { formatInspection } from "../src/ui/inspection-view.js";

describe("formatInspection", () => {
  it("formats staged files and aggregate change statistics", () => {
    const analysis: ValidatedStagedChangeAnalysis = {
      repositoryRoot: "C:/repo",
      files: [
        {
          path: "src/cli.ts",
          status: "modified",
          binary: false,
        },
        {
          path: "assets/logo.png",
          status: "added",
          binary: true,
        },
      ],
      statistics: {
        filesChanged: 2,
        insertions: 10,
        deletions: 1,
        binaryFiles: 1,
      },
      diff: "a staged diff",
    };

    expect(formatInspection(analysis)).toBe(
      [
        "Staged changes (2 files):",
        "  M src/cli.ts",
        "  A assets/logo.png (binary)",
        "",
        "Statistics: 2 files changed, 10 insertions(+), 1 deletion(-), 1 binary file",
      ].join("\n"),
    );
  });
});

