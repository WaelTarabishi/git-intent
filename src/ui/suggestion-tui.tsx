import {
  Box,
  measureElement,
  Text,
  render,
  useApp,
  useInput,
  useStdout,
  type DOMElement,
  type Key,
} from "ink";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";

import type {
  CommitAnalysis,
  CommitSuggestion,
} from "../analysis/commit-analysis-schema.js";
import type { ThemeName } from "./theme.js";

const spinnerFrames = ["✻", "✽", "✶", "✳", "✢", "✣"] as const;
const enableMouseTracking = "\u001B[?1000h\u001B[?1006h";
const disableMouseTracking = "\u001B[?1006l\u001B[?1000l";

interface TuiPalette {
  brand: string;
  heading: string;
  primary: string;
  secondary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  muted: string;
  border: string;
}

const tuiPalettes: Record<ThemeName, TuiPalette> = {
  aurora: {
    brand: "#e879f9",
    heading: "#67e8f9",
    primary: "#e2e8f0",
    secondary: "#a78bfa",
    accent: "#f0abfc",
    success: "#4ade80",
    warning: "#facc15",
    danger: "#fb7185",
    muted: "#94a3b8",
    border: "#22d3ee",
  },
  sunset: {
    brand: "#fbbf24",
    heading: "#fb7185",
    primary: "#fff7ed",
    secondary: "#fdba74",
    accent: "#f472b6",
    success: "#86efac",
    warning: "#fde047",
    danger: "#f87171",
    muted: "#a8a29e",
    border: "#f97316",
  },
  ocean: {
    brand: "#22d3ee",
    heading: "#60a5fa",
    primary: "#e0f2fe",
    secondary: "#38bdf8",
    accent: "#2dd4bf",
    success: "#34d399",
    warning: "#facc15",
    danger: "#fb7185",
    muted: "#94a3b8",
    border: "#0284c7",
  },
  mono: {
    brand: "whiteBright",
    heading: "whiteBright",
    primary: "white",
    secondary: "white",
    accent: "whiteBright",
    success: "whiteBright",
    warning: "white",
    danger: "whiteBright",
    muted: "gray",
    border: "gray",
  },
};

type ToneRole = keyof TuiPalette;

interface ToneProps {
  children: ReactNode;
  palette: TuiPalette;
  role: ToneRole;
  colorsEnabled: boolean;
  bold?: boolean;
  dim?: boolean;
}

function Tone({
  children,
  palette,
  role,
  colorsEnabled,
  bold,
  dim,
}: ToneProps) {
  return (
    <Text
      {...(colorsEnabled ? { color: palette[role] } : {})}
      {...(bold === undefined ? {} : { bold })}
      {...(dim === undefined ? {} : { dimColor: dim })}
    >
      {children}
    </Text>
  );
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function orderedSuggestionIndexes(
  analysis: CommitAnalysis,
): number[] {
  const indexes = analysis.suggestions.map((_, index) => index);
  indexes.sort((left, right) => {
    if (left === analysis.recommendedSuggestionIndex) {
      return -1;
    }
    if (right === analysis.recommendedSuggestionIndex) {
      return 1;
    }
    return left - right;
  });
  return indexes;
}

export function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const wholeMinutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${wholeMinutes}m ${remainingSeconds}s`;
}

function commitTypeRole(type: CommitSuggestion["type"]): ToneRole {
  switch (type) {
    case "feat":
      return "success";
    case "fix":
    case "revert":
      return "danger";
    case "docs":
    case "ci":
      return "heading";
    case "perf":
      return "warning";
    case "refactor":
    case "style":
      return "accent";
    case "test":
      return "secondary";
    default:
      return "muted";
  }
}

interface CommitSubjectProps {
  suggestion: CommitSuggestion;
  palette: TuiPalette;
  colorsEnabled: boolean;
}

function CommitSubject({
  suggestion,
  palette,
  colorsEnabled,
}: CommitSubjectProps) {
  return (
    <Text wrap="truncate-end">
      <Tone
        palette={palette}
        colorsEnabled={colorsEnabled}
        role={commitTypeRole(suggestion.type)}
        bold
      >
        {suggestion.type}
      </Tone>
      {suggestion.scope === undefined ? null : (
        <Tone
          palette={palette}
          colorsEnabled={colorsEnabled}
          role="secondary"
        >
          ({suggestion.scope})
        </Tone>
      )}
      <Tone palette={palette} colorsEnabled={colorsEnabled} role="muted">
        :
      </Tone>{" "}
      <Tone palette={palette} colorsEnabled={colorsEnabled} role="primary">
        {suggestion.description}
      </Tone>
    </Text>
  );
}

interface SuggestionScreenProps {
  analysis?: CommitAnalysis | undefined;
  colorsEnabled: boolean;
  elapsedSeconds: number;
  fileCount: number;
  frameIndex: number;
  loading: boolean;
  providerName: string;
  recentCommitCount: number;
  selectedPosition: number;
  themeName: ThemeName;
  width: number;
  interactionRefs?: SuggestionInteractionRefs | undefined;
}

interface SuggestionInteractionRefs {
  accept: RefObject<DOMElement | null>;
  cancel: RefObject<DOMElement | null>;
  custom: RefObject<DOMElement | null>;
  suggestions: RefObject<Array<DOMElement | null>>;
}

export function SuggestionScreen({
  analysis,
  colorsEnabled,
  elapsedSeconds,
  fileCount,
  frameIndex,
  loading,
  providerName,
  recentCommitCount,
  selectedPosition,
  themeName,
  width,
  interactionRefs,
}: SuggestionScreenProps) {
  const palette = tuiPalettes[themeName];
  const borderProps = colorsEnabled ? { borderColor: palette.border } : {};
  const orderedIndexes =
    analysis === undefined ? [] : orderedSuggestionIndexes(analysis);
  const selectedIndex = orderedIndexes[selectedPosition];
  const selectedSuggestion =
    selectedIndex === undefined
      ? undefined
      : analysis?.suggestions[selectedIndex];

  return (
    <Box width={width} flexDirection="column">
      <Box
        width="100%"
        borderStyle="round"
        paddingX={1}
        justifyContent="space-between"
        {...borderProps}
      >
        <Tone
          palette={palette}
          colorsEnabled={colorsEnabled}
          role="brand"
          bold
        >
          ◆ Git Intent
        </Tone>
        <Tone
          palette={palette}
          colorsEnabled={colorsEnabled}
          role="muted"
        >
          {providerName} · {titleCase(themeName)} theme
        </Tone>
      </Box>

      <Box marginTop={1} paddingX={2}>
        <Tone
          palette={palette}
          colorsEnabled={colorsEnabled}
          role="success"
        >
          ✓
        </Tone>
        <Text> Inspected {fileCount} staged files</Text>
      </Box>
      <Box paddingX={2}>
        <Tone
          palette={palette}
          colorsEnabled={colorsEnabled}
          role="success"
        >
          ✓
        </Tone>
        <Text>
          {" "}
          {recentCommitCount === 0
            ? "Loaded repository context"
            : `Loaded ${recentCommitCount} recent commit ${
                recentCommitCount === 1 ? "subject" : "subjects"
              }`}
        </Text>
      </Box>
      <Box paddingX={2}>
        <Box flexGrow={1}>
          <Tone
            palette={palette}
            colorsEnabled={colorsEnabled}
            role={loading ? "accent" : "success"}
          >
            {loading
              ? spinnerFrames[frameIndex % spinnerFrames.length]
              : "✓"}
          </Tone>
          <Text>
            {" "}
            {loading ? "Analyzing" : "Analyzed"} changes with {providerName}
            {loading ? "…" : ""}
          </Text>
        </Box>
        <Tone
          palette={palette}
          colorsEnabled={colorsEnabled}
          role="muted"
        >
          {formatElapsedTime(elapsedSeconds)}
        </Tone>
      </Box>

      {analysis === undefined ? null : (
        <>
          {analysis.splitRecommended ? (
            <Box marginTop={1} paddingX={2}>
              <Tone
                palette={palette}
                colorsEnabled={colorsEnabled}
                role="warning"
              >
                ⚠ Split recommended
                {analysis.splitReason === undefined
                  ? ""
                  : ` · ${analysis.splitReason}`}
              </Tone>
            </Box>
          ) : null}

          <Box marginTop={1} paddingX={2}>
            <Tone
              palette={palette}
              colorsEnabled={colorsEnabled}
              role="heading"
              bold
            >
              Suggested commit
            </Tone>
          </Box>

          <Box flexDirection="column" marginTop={1}>
            {orderedIndexes.map((suggestionIndex, position) => {
              const suggestion = analysis.suggestions[suggestionIndex]!;
              const selected = position === selectedPosition;
              const recommended =
                suggestionIndex === analysis.recommendedSuggestionIndex;
              return (
                <Box
                  key={suggestionIndex}
                  ref={(element) => {
                    if (interactionRefs !== undefined) {
                      interactionRefs.suggestions.current[position] =
                        element;
                    }
                  }}
                  paddingLeft={2}
                  width="100%"
                >
                  <Box width={4}>
                    <Tone
                      palette={palette}
                      colorsEnabled={colorsEnabled}
                      role={selected ? "accent" : "muted"}
                      bold={selected}
                    >
                      {selected ? "❯ " : "  "}
                      {recommended ? "★" : " "}
                    </Tone>
                  </Box>
                  <Box flexGrow={1} flexShrink={1}>
                    <CommitSubject
                      suggestion={suggestion}
                      palette={palette}
                      colorsEnabled={colorsEnabled}
                    />
                  </Box>
                  <Box width={5} justifyContent="flex-end">
                    <Tone
                      palette={palette}
                      colorsEnabled={colorsEnabled}
                      role={
                        suggestion.confidence >= 0.85
                          ? "success"
                          : suggestion.confidence >= 0.65
                            ? "warning"
                            : "danger"
                      }
                    >
                      {Math.round(suggestion.confidence * 100)}%
                    </Tone>
                  </Box>
                </Box>
              );
            })}
          </Box>

          {selectedSuggestion === undefined ? null : (
            <Box
              marginTop={1}
              width="100%"
              borderStyle="round"
              paddingX={1}
              flexDirection="column"
              {...borderProps}
            >
              <Tone
                palette={palette}
                colorsEnabled={colorsEnabled}
                role="heading"
                bold
              >
                Preview
              </Tone>
              <CommitSubject
                suggestion={selectedSuggestion}
                palette={palette}
                colorsEnabled={colorsEnabled}
              />
              <Box height={1} />
              {selectedSuggestion.details.map((detail) => (
                <Box key={detail}>
                  <Tone
                    palette={palette}
                    colorsEnabled={colorsEnabled}
                    role="accent"
                  >
                    •
                  </Tone>
                  <Text> {detail}</Text>
                </Box>
              ))}
              {selectedSuggestion.tests.map((test) => (
                <Box key={test}>
                  <Tone
                    palette={palette}
                    colorsEnabled={colorsEnabled}
                    role="heading"
                  >
                    ✓
                  </Tone>
                  <Text> {test}</Text>
                </Box>
              ))}
              {selectedSuggestion.breakingChanges.map((breakingChange) => (
                <Box key={breakingChange}>
                  <Tone
                    palette={palette}
                    colorsEnabled={colorsEnabled}
                    role="danger"
                  >
                    ⚡
                  </Tone>
                  <Text> {breakingChange}</Text>
                </Box>
              ))}
            </Box>
          )}

          <Box marginTop={1} paddingX={2} gap={1}>
            <Box ref={interactionRefs?.accept}>
              <Tone
                palette={palette}
                colorsEnabled={colorsEnabled}
                role="success"
                bold
              >
                [ Accept ]
              </Tone>
            </Box>
            <Box ref={interactionRefs?.custom}>
              <Tone
                palette={palette}
                colorsEnabled={colorsEnabled}
                role="accent"
              >
                [ Custom ]
              </Tone>
            </Box>
            <Box ref={interactionRefs?.cancel}>
              <Tone
                palette={palette}
                colorsEnabled={colorsEnabled}
                role="danger"
              >
                [ Cancel ]
              </Tone>
            </Box>
            <Tone
              palette={palette}
              colorsEnabled={colorsEnabled}
              role="muted"
            >
              · ↑↓/JK navigate
            </Tone>
          </Box>
        </>
      )}
    </Box>
  );
}

export interface SuggestionTuiOptions {
  analysisPromise: Promise<CommitAnalysis>;
  animation: boolean;
  colorsEnabled: boolean;
  fileCount: number;
  providerName: string;
  recentCommitCount: number;
  startedAtMs: number;
  themeName: ThemeName;
}

export type SuggestionTuiResult =
  | { kind: "suggestion"; suggestionIndex: number }
  | { kind: "custom" };

export class SuggestionTuiCancelledError extends Error {
  override readonly name = "ExitPromptError";

  constructor() {
    super("Suggestion selection cancelled.");
  }
}

export type SuggestionInputAction =
  | "accept"
  | "cancel"
  | "custom"
  | "first"
  | "last"
  | "next"
  | "previous";

export interface TerminalMouseEvent {
  button: "left" | "wheel-down" | "wheel-up";
  pressed: boolean;
  x: number;
  y: number;
}

export function parseTerminalMouseInput(
  input: string,
): TerminalMouseEvent | undefined {
  const match =
    /^(?:\u001B)?\[<(\d+);(\d+);(\d+)([Mm])$/u.exec(input);
  if (match === null) {
    return undefined;
  }

  const buttonCode = Number.parseInt(match[1]!, 10);
  const x = Number.parseInt(match[2]!, 10);
  const y = Number.parseInt(match[3]!, 10);
  if (x < 1 || y < 1) {
    return undefined;
  }

  if ((buttonCode & 64) !== 0) {
    return {
      button: (buttonCode & 1) === 0 ? "wheel-up" : "wheel-down",
      pressed: match[4] === "M",
      x,
      y,
    };
  }

  if ((buttonCode & 3) !== 0) {
    return undefined;
  }
  return {
    button: "left",
    pressed: match[4] === "M",
    x,
    y,
  };
}

export function resolveSuggestionInput(
  input: string,
  key: Key,
): SuggestionInputAction | undefined {
  if (key.eventType === "release") {
    return undefined;
  }

  const normalizedInput = input.toLowerCase();
  if (key.escape || (key.ctrl && normalizedInput === "c")) {
    return "cancel";
  }
  if (
    key.downArrow ||
    key.rightArrow ||
    key.pageDown ||
    normalizedInput === "j"
  ) {
    return "next";
  }
  if (
    key.upArrow ||
    key.leftArrow ||
    key.pageUp ||
    normalizedInput === "k"
  ) {
    return "previous";
  }
  if (key.home) {
    return "first";
  }
  if (key.end) {
    return "last";
  }
  if (normalizedInput === "c") {
    return "custom";
  }
  if (
    key.return ||
    input === "\r" ||
    input === "\n" ||
    input === "\r\n"
  ) {
    return "accept";
  }
  return undefined;
}

function elementContainsMouseEvent(
  element: DOMElement | null | undefined,
  event: TerminalMouseEvent,
): boolean {
  if (element === null || element === undefined) {
    return false;
  }
  const { x, y, width, height } = measureElement(element);
  const mouseX = event.x - 1;
  const mouseY = event.y - 1;
  return (
    mouseX >= x &&
    mouseX < x + width &&
    mouseY >= y &&
    mouseY < y + height
  );
}

export function SuggestionTuiController(options: SuggestionTuiOptions) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const interactionRefs: SuggestionInteractionRefs = {
    accept: useRef<DOMElement>(null),
    cancel: useRef<DOMElement>(null),
    custom: useRef<DOMElement>(null),
    suggestions: useRef<Array<DOMElement | null>>([]),
  };
  const [analysis, setAnalysis] = useState<CommitAnalysis>();
  const [selectedPosition, setSelectedPosition] = useState(0);
  const [frameIndex, setFrameIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const orderedIndexes = useMemo(
    () => (analysis === undefined ? [] : orderedSuggestionIndexes(analysis)),
    [analysis],
  );

  useEffect(() => {
    let active = true;
    void options.analysisPromise.then(
      (value) => {
        if (!active) {
          return;
        }
        setElapsedSeconds((Date.now() - options.startedAtMs) / 1000);
        setAnalysis(value);
      },
      (error: unknown) => {
        if (!active) {
          return;
        }
        exit(
          error instanceof Error
            ? error
            : new Error("Commit analysis failed unexpectedly."),
        );
      },
    );
    return () => {
      active = false;
    };
  }, [exit, options.analysisPromise, options.startedAtMs]);

  useEffect(() => {
    if (analysis !== undefined || !options.animation) {
      return;
    }

    const timer = setInterval(() => {
      setFrameIndex((current) => current + 1);
      setElapsedSeconds((Date.now() - options.startedAtMs) / 1000);
    }, 80);
    return () => clearInterval(timer);
  }, [analysis, options.animation, options.startedAtMs]);

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }
    stdout.write(enableMouseTracking);
    return () => {
      if (!stdout.destroyed && !stdout.writableEnded) {
        stdout.write(disableMouseTracking);
      }
    };
  }, [stdout]);

  useInput((input, key) => {
    const mouseEvent = parseTerminalMouseInput(input);
    if (mouseEvent !== undefined) {
      if (analysis === undefined || !mouseEvent.pressed) {
        return;
      }
      if (mouseEvent.button === "wheel-down") {
        setSelectedPosition(
          (current) => (current + 1) % orderedIndexes.length,
        );
        return;
      }
      if (mouseEvent.button === "wheel-up") {
        setSelectedPosition(
          (current) =>
            (current - 1 + orderedIndexes.length) %
            orderedIndexes.length,
        );
        return;
      }
      if (
        elementContainsMouseEvent(
          interactionRefs.cancel.current,
          mouseEvent,
        )
      ) {
        exit(new SuggestionTuiCancelledError());
        return;
      }
      if (
        elementContainsMouseEvent(
          interactionRefs.custom.current,
          mouseEvent,
        )
      ) {
        exit({ kind: "custom" } satisfies SuggestionTuiResult);
        return;
      }
      if (
        elementContainsMouseEvent(
          interactionRefs.accept.current,
          mouseEvent,
        )
      ) {
        const suggestionIndex = orderedIndexes[selectedPosition];
        if (suggestionIndex !== undefined) {
          exit({
            kind: "suggestion",
            suggestionIndex,
          } satisfies SuggestionTuiResult);
        }
        return;
      }

      const clickedPosition =
        interactionRefs.suggestions.current.findIndex((element) =>
          elementContainsMouseEvent(element, mouseEvent),
        );
      if (clickedPosition >= 0) {
        if (clickedPosition === selectedPosition) {
          const suggestionIndex = orderedIndexes[clickedPosition];
          if (suggestionIndex !== undefined) {
            exit({
              kind: "suggestion",
              suggestionIndex,
            } satisfies SuggestionTuiResult);
          }
          return;
        }
        setSelectedPosition(clickedPosition);
      }
      return;
    }

    const action = resolveSuggestionInput(input, key);
    if (action === "cancel") {
      exit(new SuggestionTuiCancelledError());
      return;
    }
    if (analysis === undefined) {
      return;
    }
    if (action === "next") {
      setSelectedPosition(
        (current) => (current + 1) % orderedIndexes.length,
      );
      return;
    }
    if (action === "previous") {
      setSelectedPosition(
        (current) =>
          (current - 1 + orderedIndexes.length) % orderedIndexes.length,
      );
      return;
    }
    if (action === "first") {
      setSelectedPosition(0);
      return;
    }
    if (action === "last") {
      setSelectedPosition(orderedIndexes.length - 1);
      return;
    }
    if (action === "custom") {
      exit({ kind: "custom" } satisfies SuggestionTuiResult);
      return;
    }
    if (action === "accept") {
      const suggestionIndex = orderedIndexes[selectedPosition];
      if (suggestionIndex !== undefined) {
        exit({
          kind: "suggestion",
          suggestionIndex,
        } satisfies SuggestionTuiResult);
      }
    }
  });

  const terminalWidth = stdout.columns ?? 80;
  const width = Math.max(36, Math.min(80, terminalWidth));

  return (
    <SuggestionScreen
      analysis={analysis}
      colorsEnabled={options.colorsEnabled}
      elapsedSeconds={elapsedSeconds}
      fileCount={options.fileCount}
      frameIndex={frameIndex}
      loading={analysis === undefined}
      providerName={options.providerName}
      recentCommitCount={options.recentCommitCount}
      selectedPosition={selectedPosition}
      themeName={options.themeName}
      width={width}
      interactionRefs={interactionRefs}
    />
  );
}

function isSuggestionTuiResult(value: unknown): value is SuggestionTuiResult {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }
  return value.kind === "custom" || value.kind === "suggestion";
}

export async function waitForInteractiveResult<T>(
  resultPromise: Promise<T>,
): Promise<T> {
  // Some Windows terminal hosts do not keep Node alive through the raw stdin
  // handle after the analysis animation stops. A quiet referenced timer avoids
  // process.beforeExit unmounting Ink before the developer presses a key.
  const keepAlive = setInterval(() => undefined, 60_000);
  try {
    return await resultPromise;
  } finally {
    clearInterval(keepAlive);
  }
}

export async function runSuggestionTui(
  options: SuggestionTuiOptions,
): Promise<SuggestionTuiResult> {
  const instance = render(<SuggestionTuiController {...options} />, {
    alternateScreen: true,
    exitOnCtrlC: false,
    incrementalRendering: false,
    maxFps: 30,
  });

  try {
    const result = await waitForInteractiveResult(
      instance.waitUntilExit(),
    );
    if (!isSuggestionTuiResult(result)) {
      throw new SuggestionTuiCancelledError();
    }
    return result;
  } finally {
    instance.cleanup();
  }
}
