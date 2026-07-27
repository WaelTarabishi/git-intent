import { describe, expect, it } from "vitest";

import { formatConventionalCommitMessage } from "../src/ui/suggestion-view.js";

describe("formatConventionalCommitMessage", () => {
  it("formats a Conventional Commit message without a scope", () => {
    expect(
      formatConventionalCommitMessage({
        type: "docs",
        description: "update the architecture guide",
      }),
    ).toBe("docs: update the architecture guide");
  });

  it("formats a Conventional Commit message with a scope", () => {
    expect(
      formatConventionalCommitMessage({
        type: "feat",
        scope: "cli",
        description: "add mock suggestions",
      }),
    ).toBe("feat(cli): add mock suggestions");
  });
});
