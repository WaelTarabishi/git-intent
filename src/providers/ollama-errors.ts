function errorCode(error: unknown): string | undefined {
  const visited = new Set<object>();
  let current = error;

  while (
    typeof current === "object" &&
    current !== null &&
    !visited.has(current)
  ) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string") {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }

  return undefined;
}

export class OllamaUnavailableError extends Error {
  constructor(cause?: unknown) {
    const code = errorCode(cause);
    const connectionClosed =
      code === "ECONNRESET" || code === "UND_ERR_SOCKET";
    super(
      connectionClosed
        ? "Ollama closed the connection before responding. Its model runner may have stopped because the request exceeded available RAM, VRAM, or context capacity. Check the Ollama logs, free memory, or stage fewer changes and try again."
        : "Cannot reach Ollama. Install Ollama and make sure its server is running, then confirm the configured URL is reachable.",
      cause === undefined ? undefined : { cause },
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

export class OllamaNoModelsError extends Error {
  constructor() {
    super(
      "No local Ollama models are installed. Install one with `ollama pull <model>` and try again.",
    );
    this.name = "OllamaNoModelsError";
  }
}

export class OllamaInvalidModelListError extends Error {
  constructor() {
    super("Ollama returned an invalid installed-model list.");
    this.name = "OllamaInvalidModelListError";
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
