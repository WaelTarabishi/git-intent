import { styleText, type InspectColor } from "node:util";

export const themeNames = ["aurora", "sunset", "ocean", "mono"] as const;

export type ThemeName = (typeof themeNames)[number];

type TextStyle = InspectColor | readonly InspectColor[];

interface ThemePalette {
  brand: TextStyle;
  heading: TextStyle;
  primary: TextStyle;
  secondary: TextStyle;
  accent: TextStyle;
  success: TextStyle;
  warning: TextStyle;
  danger: TextStyle;
  info: TextStyle;
  muted: TextStyle;
}

const palettes: Record<ThemeName, ThemePalette> = {
  aurora: {
    brand: ["bold", "magentaBright"],
    heading: ["bold", "cyanBright"],
    primary: "cyanBright",
    secondary: "blueBright",
    accent: "magentaBright",
    success: "greenBright",
    warning: "yellowBright",
    danger: "redBright",
    info: "blueBright",
    muted: "gray",
  },
  sunset: {
    brand: ["bold", "yellowBright"],
    heading: ["bold", "magentaBright"],
    primary: "yellowBright",
    secondary: "redBright",
    accent: "magentaBright",
    success: "greenBright",
    warning: "yellow",
    danger: "redBright",
    info: "cyanBright",
    muted: "gray",
  },
  ocean: {
    brand: ["bold", "cyanBright"],
    heading: ["bold", "blueBright"],
    primary: "cyanBright",
    secondary: "blueBright",
    accent: "greenBright",
    success: "greenBright",
    warning: "yellowBright",
    danger: "redBright",
    info: "cyan",
    muted: "gray",
  },
  mono: {
    brand: ["bold", "whiteBright"],
    heading: ["bold", "white"],
    primary: "whiteBright",
    secondary: "white",
    accent: ["bold", "whiteBright"],
    success: "whiteBright",
    warning: ["bold", "white"],
    danger: ["bold", "whiteBright"],
    info: "white",
    muted: "dim",
  },
};

export interface TerminalTheme {
  readonly name: ThemeName;
  readonly colorEnabled: boolean | undefined;
  brand(text: string): string;
  heading(text: string): string;
  primary(text: string): string;
  secondary(text: string): string;
  accent(text: string): string;
  success(text: string): string;
  warning(text: string): string;
  danger(text: string): string;
  info(text: string): string;
  muted(text: string): string;
  confidence(value: number, text: string): string;
  fileStatus(status: string, text: string): string;
  commitType(type: string, text: string): string;
}

interface CreateThemeOptions {
  color?: boolean;
  stream?: NodeJS.WritableStream;
}

export const defaultThemeName: ThemeName = "aurora";

export function terminalColorsEnabled(color?: boolean): boolean {
  if (color === false) {
    return false;
  }
  if (color === true) {
    return true;
  }
  if (process.env.FORCE_COLOR === "0") {
    return false;
  }
  if (process.env.FORCE_COLOR !== undefined) {
    return true;
  }
  return (
    process.env.NO_COLOR === undefined &&
    process.env.NODE_DISABLE_COLORS === undefined
  );
}

export function createTheme(
  name: ThemeName = defaultThemeName,
  options: CreateThemeOptions = {},
): TerminalTheme {
  const palette = palettes[name];
  const stream = options.stream ?? process.stdout;

  const paint = (style: TextStyle, text: string): string => {
    if (!terminalColorsEnabled(options.color)) {
      return text;
    }

    return styleText(style, text, {
      stream,
      validateStream: options.color !== true,
    });
  };

  const theme: TerminalTheme = {
    name,
    colorEnabled: options.color,
    brand: (text) => paint(palette.brand, text),
    heading: (text) => paint(palette.heading, text),
    primary: (text) => paint(palette.primary, text),
    secondary: (text) => paint(palette.secondary, text),
    accent: (text) => paint(palette.accent, text),
    success: (text) => paint(palette.success, text),
    warning: (text) => paint(palette.warning, text),
    danger: (text) => paint(palette.danger, text),
    info: (text) => paint(palette.info, text),
    muted: (text) => paint(palette.muted, text),
    confidence: (value, text) => {
      if (value >= 0.85) {
        return theme.success(text);
      }
      if (value >= 0.65) {
        return theme.warning(text);
      }
      return theme.danger(text);
    },
    fileStatus: (status, text) => {
      switch (status) {
        case "A":
          return theme.success(text);
        case "M":
          return theme.warning(text);
        case "D":
        case "U":
          return theme.danger(text);
        case "R":
          return theme.info(text);
        case "C":
          return theme.secondary(text);
        case "T":
          return theme.accent(text);
        default:
          return theme.muted(text);
      }
    },
    commitType: (type, text) => {
      switch (type) {
        case "feat":
          return theme.success(text);
        case "fix":
        case "revert":
          return theme.danger(text);
        case "docs":
        case "ci":
          return theme.info(text);
        case "perf":
          return theme.warning(text);
        case "refactor":
        case "style":
          return theme.accent(text);
        case "test":
          return theme.secondary(text);
        default:
          return theme.muted(text);
      }
    },
  };

  return theme;
}
