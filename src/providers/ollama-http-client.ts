export type OllamaHttpClient = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
