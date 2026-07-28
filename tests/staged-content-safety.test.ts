import { describe, expect, it } from "vitest";

import { detectSensitiveStagedFiles } from "../src/safety/staged-content-safety.js";

describe("detectSensitiveStagedFiles", () => {
  it("identifies representative sensitive staged filenames", () => {
    const matches = detectSensitiveStagedFiles({
      files: [
        { path: ".env", status: "added", binary: false },
        { path: "certs/server.key", status: "added", binary: false },
        {
          path: "config/credentials.json",
          status: "modified",
          binary: false,
        },
        {
          path: "terraform/production.tfstate",
          status: "modified",
          binary: false,
        },
        {
          path: "deploy/secret.yaml",
          status: "added",
          binary: false,
        },
      ],
    });

    expect(matches.map((match) => match.category)).toEqual([
      "environment file",
      "private key",
      "credential file",
      "Terraform state",
      "secret manifest",
    ]);
  });

  it("does not flag ordinary source and documentation paths", () => {
    expect(
      detectSensitiveStagedFiles({
        files: [
          { path: "src/cli.ts", status: "modified", binary: false },
          { path: "README.md", status: "modified", binary: false },
        ],
      }),
    ).toEqual([]);
  });
});
