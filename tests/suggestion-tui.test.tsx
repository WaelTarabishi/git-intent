import { PassThrough } from "node:stream";

import { render, renderToString, type Key } from "ink";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommitAnalysis } from "../src/analysis/commit-analysis-schema.js";
import {
  formatElapsedTime,
  orderedSuggestionIndexes,
  parseTerminalMouseInput,
  resolveSuggestionInput,
  SuggestionScreen,
  SuggestionTuiController,
  waitForInteractiveResult,
} from "../src/ui/suggestion-tui.js";

const analysis: CommitAnalysis = {
  summary: "The staged changes introduce a richer interactive CLI.",
  splitRecommended: false,
  recommendedSuggestionIndex: 1,
  suggestions: [
    {
      type: "refactor",
      scope: "ui",
      description: "introduce reusable terminal views",
      details: ["Extract reusable terminal components."],
      tests: [],
      breakingChanges: [],
      explanation: "A structural alternative.",
      confidence: 0.81,
    },
    {
      type: "feat",
      scope: "cli",
      description: "add interactive terminal interface",
      details: [
        "Render progress and suggestions using reusable components.",
        "Preserve JSON output for automation.",
      ],
      tests: ["Cover keyboard selection and non-interactive fallback."],
      breakingChanges: [],
      explanation: "The best description of the user-facing change.",
      confidence: 0.96,
    },
    {
      type: "test",
      scope: "cli",
      description: "expand interactive workflow coverage",
      details: ["Exercise the interactive workflow."],
      tests: ["Render the terminal screen without ANSI styling."],
      breakingChanges: [],
      explanation: "A test-focused alternative.",
      confidence: 0.72,
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

function keyboardEvent(overrides: Partial<Key> = {}): Key {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    home: false,
    end: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
    super: false,
    hyper: false,
    capsLock: false,
    numLock: false,
    ...overrides,
  };
}

function terminalInput(): NodeJS.ReadStream {
  const stream = new PassThrough() as PassThrough & {
    isTTY: boolean;
    setRawMode: (enabled: boolean) => void;
    ref: () => void;
    unref: () => void;
  };
  stream.isTTY = true;
  stream.setRawMode = () => undefined;
  stream.ref = () => undefined;
  stream.unref = () => undefined;
  return stream as unknown as NodeJS.ReadStream;
}

function terminalOutput(): NodeJS.WriteStream {
  const stream = new PassThrough() as PassThrough & {
    columns: number;
    isTTY: boolean;
  };
  stream.columns = 80;
  stream.isTTY = true;
  return stream as unknown as NodeJS.WriteStream;
}

describe("interactive suggestion TUI", () => {
  it("renders the Claude-style ready state with the recommendation first", () => {
    const output = renderToString(
      <SuggestionScreen
        analysis={analysis}
        colorsEnabled={false}
        elapsedSeconds={4.2}
        fileCount={12}
        frameIndex={0}
        loading={false}
        providerName="Gemini"
        recentCommitCount={5}
        selectedPosition={0}
        themeName="aurora"
        width={72}
      />,
      { columns: 72 },
    );

    expect(output).toContain("◆ Git Intent");
    expect(output).toContain("Gemini · Aurora theme");
    expect(output).toContain("✓ Inspected 12 staged files");
    expect(output).toContain("✓ Loaded 5 recent commit subjects");
    expect(output).toContain("✓ Analyzed changes with Gemini");
    expect(output).toContain("4.2s");
    expect(output).toContain(
      "❯ ★ feat(cli): add interactive terminal interface",
    );
    expect(output).toContain(
      "refactor(ui): introduce reusable terminal views",
    );
    expect(output).toContain("Preview");
    expect(output).toContain(
      "• Render progress and suggestions using reusable components.",
    );
    expect(output).toContain(
      "[ Accept ] [ Custom ] [ Cancel ] · ↑↓/JK navigate",
    );
  });

  it("renders an animated analysis state before suggestions arrive", () => {
    const output = renderToString(
      <SuggestionScreen
        colorsEnabled={false}
        elapsedSeconds={1.6}
        fileCount={3}
        frameIndex={2}
        loading
        providerName="Ollama"
        recentCommitCount={0}
        selectedPosition={0}
        themeName="ocean"
        width={68}
      />,
      { columns: 68 },
    );

    expect(output).toContain("✶ Analyzing changes with Ollama…");
    expect(output).toContain("1.6s");
    expect(output).not.toContain("Suggested commit");
    expect(output).not.toContain("Preview");
  });

  it("orders the recommendation first without changing source indexes", () => {
    expect(orderedSuggestionIndexes(analysis)).toEqual([1, 0, 2]);
  });

  it("formats short and long elapsed durations", () => {
    expect(formatElapsedTime(4.24)).toBe("4.2s");
    expect(formatElapsedTime(125.9)).toBe("2m 5s");
  });

  it("keeps the process alive until an interactive result settles", async () => {
    vi.useFakeTimers();
    let resolveResult: ((value: string) => void) | undefined;
    const resultPromise = new Promise<string>((resolve) => {
      resolveResult = resolve;
    });

    const waiting = waitForInteractiveResult(resultPromise);

    expect(vi.getTimerCount()).toBe(1);
    resolveResult?.("selected");
    await expect(waiting).resolves.toBe("selected");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("accepts every common terminal Enter sequence", () => {
    expect(
      resolveSuggestionInput("", keyboardEvent({ return: true })),
    ).toBe("accept");
    expect(resolveSuggestionInput("\r", keyboardEvent())).toBe("accept");
    expect(resolveSuggestionInput("\n", keyboardEvent())).toBe("accept");
    expect(resolveSuggestionInput("\r\n", keyboardEvent())).toBe(
      "accept",
    );
  });

  it("supports arrow keys and keyboard navigation fallbacks", () => {
    expect(
      resolveSuggestionInput("", keyboardEvent({ downArrow: true })),
    ).toBe("next");
    expect(
      resolveSuggestionInput("", keyboardEvent({ upArrow: true })),
    ).toBe("previous");
    expect(resolveSuggestionInput("j", keyboardEvent())).toBe("next");
    expect(resolveSuggestionInput("k", keyboardEvent())).toBe("previous");
  });

  it("parses terminal mouse clicks, releases, and wheel navigation", () => {
    expect(parseTerminalMouseInput("[<0;14;11M")).toEqual({
      button: "left",
      pressed: true,
      x: 14,
      y: 11,
    });
    expect(parseTerminalMouseInput("\u001B[<0;14;11m")).toEqual({
      button: "left",
      pressed: false,
      x: 14,
      y: 11,
    });
    expect(parseTerminalMouseInput("[<64;4;8M")).toMatchObject({
      button: "wheel-up",
      pressed: true,
    });
    expect(parseTerminalMouseInput("[<65;4;8M")).toMatchObject({
      button: "wheel-down",
      pressed: true,
    });
  });

  it("navigates and accepts through a live terminal input stream", async () => {
    const stdin = terminalInput();
    const stdout = terminalOutput();
    const instance = render(
      <SuggestionTuiController
        analysisPromise={Promise.resolve(analysis)}
        animation={false}
        colorsEnabled={false}
        fileCount={1}
        providerName="Gemini"
        recentCommitCount={0}
        startedAtMs={Date.now()}
        themeName="aurora"
      />,
      {
        exitOnCtrlC: false,
        interactive: true,
        patchConsole: false,
        stdin,
        stdout,
      },
    );

    try {
      await instance.waitUntilRenderFlush();
      await instance.waitUntilRenderFlush();
      stdin.emit("readable");
      stdin.push("\u001B[B");
      await instance.waitUntilRenderFlush();
      stdin.push("\n");

      await expect(
        waitForInteractiveResult(instance.waitUntilExit()),
      ).resolves.toEqual({
        kind: "suggestion",
        suggestionIndex: 0,
      });
    } finally {
      instance.cleanup();
    }
  });

  it("selects and accepts a suggestion through live mouse clicks", async () => {
    const stdin = terminalInput();
    const stdout = terminalOutput();
    const instance = render(
      <SuggestionTuiController
        analysisPromise={Promise.resolve(analysis)}
        animation={false}
        colorsEnabled={false}
        fileCount={1}
        providerName="Gemini"
        recentCommitCount={0}
        startedAtMs={Date.now()}
        themeName="aurora"
      />,
      {
        exitOnCtrlC: false,
        interactive: true,
        patchConsole: false,
        stdin,
        stdout,
      },
    );

    try {
      await instance.waitUntilRenderFlush();
      await instance.waitUntilRenderFlush();
      stdin.push("\u001B[<0;5;12M");
      await instance.waitUntilRenderFlush();
      stdin.push("\u001B[<0;5;12M");

      await expect(
        waitForInteractiveResult(instance.waitUntilExit()),
      ).resolves.toEqual({
        kind: "suggestion",
        suggestionIndex: 0,
      });
    } finally {
      instance.cleanup();
    }
  });
});
