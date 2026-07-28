export class OllamaUnavailableError extends Error {
  constructor() {
    super(
      "Cannot reach Ollama. Install Ollama and make sure its server is running, then confirm the configured URL is reachable.",
    );
    this.name = "OllamaUnavailableError";
  }
}

export class OllamaModelUnavailableError extends Error {
  constructor(model: string) {
    super(
      `Ollama model "${model}" is unavailable. Pull it with \`ollama pull ${model}\` or choose another model.`,
    );
    this.name = "OllamaModelUnavailableError";
  }
}

export class OllamaTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Ollama did not respond within ${timeoutMs} ms. Increase the configured timeout or try a smaller model.`,
    );
    this.name = "OllamaTimeoutError";
  }
}

export class OllamaEmptyResponseError extends Error {
  constructor() {
    super("Ollama returned an empty model response. Try the request again.");
    this.name = "OllamaEmptyResponseError";
  }
}

export class OllamaInvalidJsonError extends Error {
  constructor() {
    super(
      "Ollama returned invalid JSON instead of structured commit analysis.",
    );
    this.name = "OllamaInvalidJsonError";
  }
}

export class OllamaSchemaValidationError extends Error {
  constructor() {
    super(
      "Ollama returned JSON that does not match the required commit-analysis schema.",
    );
    this.name = "OllamaSchemaValidationError";
  }
}

export class OllamaHttpError extends Error {
  constructor(status: number, detail?: string) {
    const suffix = detail === undefined ? "" : `: ${detail}`;
    super(`Ollama request failed with HTTP ${status}${suffix}`);
    this.name = "OllamaHttpError";
  }
}

export class OllamaDiffTooLargeError extends Error {
  constructor(actualCharacters: number, maximumCharacters: number) {
    super(
      `The staged diff is ${actualCharacters} characters, exceeding the ${maximumCharacters}-character safety limit. Stage fewer related changes and try again; the diff was not sent to Ollama.`,
    );
    this.name = "OllamaDiffTooLargeError";
  }
}
