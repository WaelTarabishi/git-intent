import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { createProgram } from "../src/cli.js";

describe("CLI options", () => {
  it("rejects --json and --show-diff when used together", async () => {
    const program = createProgram()
      .exitOverride()
      .configureOutput({
        writeErr: () => undefined,
        writeOut: () => undefined,
      });
    program.commands.forEach((command) => {
      command.exitOverride();
      command.configureOutput({
        writeErr: () => undefined,
        writeOut: () => undefined,
      });
    });

    await expect(
      program.parseAsync([
        "node",
        "smart-commit",
        "inspect",
        "--json",
        "--show-diff",
      ]),
    ).rejects.toMatchObject<Partial<CommanderError>>({
      code: "commander.conflictingOption",
    });
  });
});
