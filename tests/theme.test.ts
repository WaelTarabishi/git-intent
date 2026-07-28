import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createTheme, themeNames } from "../src/ui/theme.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("terminal themes", () => {
  it.each(themeNames)("renders the %s palette with ANSI styling", (name) => {
    const theme = createTheme(name, { color: true });
    const output = [
      theme.brand("Git Intent"),
      theme.heading("Summary"),
      theme.success("Success"),
      theme.warning("Warning"),
      theme.danger("Error"),
    ].join(" ");

    expect(output).toContain("\u001B[");
    expect(stripVTControlCharacters(output)).toBe(
      "Git Intent Summary Success Warning Error",
    );
  });

  it("can disable every ANSI style explicitly", () => {
    const theme = createTheme("aurora", { color: false });

    expect(theme.brand("Git Intent")).toBe("Git Intent");
    expect(theme.success("Success")).toBe("Success");
    expect(theme.danger("Error")).toBe("Error");
  });

  it("respects NO_COLOR without requiring terminal detection", () => {
    vi.stubEnv("NO_COLOR", "1");
    const theme = createTheme("aurora");

    expect(theme.brand("Git Intent")).toBe("Git Intent");
    expect(theme.success("Success")).toBe("Success");
  });

  it("uses semantic confidence colors", () => {
    const theme = createTheme("aurora", { color: true });

    expect(theme.confidence(0.9, "90%")).toBe(theme.success("90%"));
    expect(theme.confidence(0.7, "70%")).toBe(theme.warning("70%"));
    expect(theme.confidence(0.4, "40%")).toBe(theme.danger("40%"));
  });
});
