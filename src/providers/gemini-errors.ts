export class GeminiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      "Cannot reach the Gemini API. Check your network connection and try again.",
      cause === undefined ? undefined : { cause },
    );
    this.name = "GeminiUnavailableError";
  }
}

export class GeminiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Gemini did not respond within ${timeoutMs} ms. Increase the configured timeout or stage fewer changes.`,
    );
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiAuthenticationError extends Error {
  constructor() {
    super(
      "Gemini rejected the API key. Check GEMINI_API_KEY (or GOOGLE_API_KEY), its restrictions, and its project access.",
    );
    this.name = "GeminiAuthenticationError";
  }
}

export class GeminiRateLimitError extends Error {
  constructor() {
    super(
      "Gemini rate limit or quota was exceeded. Check the API project's quota and billing, then try again.",
    );
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiModelUnavailableError extends Error {
  constructor(model: string) {
    super(
      `Gemini model "${model}" is unavailable. Choose a supported generateContent model.`,
    );
    this.name = "GeminiModelUnavailableError";
  }
}

export class GeminiHttpError extends Error {
  constructor(status: number) {
    super(`Gemini request failed with HTTP ${status}.`);
    this.name = "GeminiHttpError";
  }
}

export class GeminiEmptyResponseError extends Error {
  constructor() {
    super(
      "Gemini returned no commit analysis. The response may have been blocked or stopped; try again or review the staged content.",
    );
    this.name = "GeminiEmptyResponseError";
  }
}

export class GeminiInvalidJsonError extends Error {
  constructor() {
    super(
      "Gemini returned invalid JSON instead of structured commit analysis.",
    );
    this.name = "GeminiInvalidJsonError";
  }
}

export class GeminiSchemaValidationError extends Error {
  constructor() {
    super(
      "Gemini returned JSON that does not match the required commit-analysis schema.",
    );
    this.name = "GeminiSchemaValidationError";
  }
}

export class GeminiInvalidResponseError extends Error {
  constructor() {
    super("Gemini returned an invalid API response.");
    this.name = "GeminiInvalidResponseError";
  }
}

export class GeminiDiffTooLargeError extends Error {
  constructor(actualCharacters: number, maximumCharacters: number) {
    super(
      `The staged diff is ${actualCharacters} characters, exceeding the ${maximumCharacters}-character safety limit. Stage fewer related changes and try again; the diff was not sent to Gemini.`,
    );
    this.name = "GeminiDiffTooLargeError";
  }
}
