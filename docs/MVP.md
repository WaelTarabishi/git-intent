# MVP Development Plan

The project should advance in small phases. Every phase must leave the previous behavior working, and no phase should introduce a Git mutation before the workflow has an explicit confirmation boundary.

## Phase 1: Read-only TypeScript CLI

### Goal

Create a trustworthy CLI foundation that can inspect the current staged Git changes without using a language model or changing the repository.

### Features

- TypeScript CLI setup.
- Command and option parsing.
- Detection of whether the current directory is inside a Git work tree.
- Read-only inspection of Git's staging area.
- Clear handling of an empty staging area.
- Normalized summaries for added, modified, deleted, renamed, and binary files.
- Safe process execution with Git argument arrays.
- Initial automated test suite.

### Intentionally excluded

- LLM prompts or provider code.
- Ollama, OpenAI, or Gemini packages and API calls.
- Commit-message generation.
- Interactive suggestion selection.
- `git commit`, automatic staging, resets, or any repository mutation.
- Mixed-change detection.

### Acceptance criteria

- The CLI can be run in a test repository and reports only staged changes.
- Unstaged and untracked files are not presented as staged content.
- Running outside a Git repository produces an actionable, non-zero failure.
- An empty index produces a clear message and no error stack intended only for developers.
- Paths containing spaces and common Unicode characters are handled safely.
- Git is invoked without constructing a shell command string.
- No code path can invoke a Git write operation.

### Tests required before moving forward

- Unit tests for Git-output parsing and normalized file states.
- Unit tests for CLI option validation and exit behavior.
- Integration tests using temporary Git repositories for staged versus unstaged changes.
- Integration tests for an empty staging area and a non-repository directory.
- Fixtures or integration coverage for rename, deletion, binary files, spaces, and Unicode paths.
- A test proving inspection does not change the index, working tree, or commit history.

## Phase 2: Mock suggestions and interactive review

### Goal

Prove the complete provider-independent review flow using deterministic fake data, without contacting a model or creating a commit.

### Features

- A mock provider implementing the conceptual provider contract.
- A provider-neutral suggestion request and raw result.
- Structured response parsing and Zod validation.
- Conventional Commit shape validation.
- Multiple deterministic suggestions.
- Interactive suggestion selection.
- A separate confirmation prompt that reports what a future commit would do.
- Clean cancellation at selection or confirmation.

### Intentionally excluded

- Real Ollama, OpenAI, or Gemini calls.
- API keys and cloud configuration.
- Actual `git commit`.
- Automatic editing, staging, or splitting changes.
- Claims that schema-valid mock suggestions are semantically correct.

### Acceptance criteria

- The mock provider can be exchanged through the provider boundary without changing Git or prompt-layer behavior.
- Malformed, missing, duplicated, and empty suggestions are rejected before display.
- The developer can select one of multiple valid suggestions or cancel.
- Selection does not imply confirmation.
- Confirmation still performs no mutation in this phase and is labeled as a simulated action.
- Non-interactive test runs never hang waiting for terminal input.

### Tests required before moving forward

- Schema tests for valid and invalid provider results.
- Conventional Commit validation tests.
- Provider contract tests run against the mock adapter.
- CLI tests for selecting each candidate, declining confirmation, and cancelling.
- Tests for malformed JSON, wrong field types, too few or too many candidates, duplicates, and unsafe control characters.
- An end-to-end test proving the simulated flow leaves Git history and the index unchanged.

## Phase 3: Ollama integration

### Goal

Generate real suggestions through a locally running model while keeping the same validation and human-review workflow.

### Features

- Ollama provider adapter using the local HTTP API.
- Configurable local endpoint and model name.
- Availability and model checks with actionable errors.
- Timeouts and cancellation.
- Provider-neutral prompt construction with clear diff delimiters.
- Secret filtering and diff-size limits before the provider call.
- Shared structured-result validation and interactive review.

### Intentionally excluded

- OpenAI and Gemini.
- Cloud transmission.
- Automatic fallback from Ollama to a cloud provider.
- Model installation or lifecycle management by the npm package.
- Automatic commit unless it is separately designed, tested, and explicitly added at the end of the review workflow.
- Mixed-change splitting.

### Acceptance criteria

- The Ollama adapter can replace the mock adapter without changing the CLI, Git, validation, or review contracts.
- A missing service or model produces a helpful error and no Git mutation.
- Only sanitized and bounded content reaches the local HTTP request.
- Invalid model output is rejected or handled through an explicit retry policy.
- The developer always sees and confirms the exact selected suggestion before any future commit action.
- Tests do not require every contributor or CI job to have a model installed.

### Tests required before moving forward

- Provider contract tests for the Ollama adapter with a fake local HTTP server.
- Tests for success, timeout, cancellation, unavailable service, missing model, malformed response, and non-success HTTP status.
- Prompt tests proving staged content is delimited as untrusted data.
- Security tests for representative token, private-key, credential-file, and high-entropy secret patterns.
- Size-limit and binary-file tests.
- An optional, separately marked manual or integration test against a real local Ollama service.

## Phase 4: OpenAI and Gemini adapters

### Goal

Add opt-in cloud providers without changing core application behavior or weakening the local security boundary.

### Features

- OpenAI adapter behind the shared provider contract.
- Gemini adapter behind the same contract.
- Provider selection through CLI or configuration.
- Environment-variable-based credentials using native Node.js support.
- Provider-specific model configuration, timeouts, cancellation, and error mapping.
- Clear disclosure that sanitized staged content will leave the computer.
- Shared prompt, validation, selection, and confirmation behavior.

### Intentionally excluded

- Automatic provider fallback that could send local-only content to a cloud service.
- Credentials in command history, config committed to Git, prompts, logs, or diagnostics.
- Provider-specific result types in shared layers.
- Assuming identical model capabilities or response behavior.
- Mixed-change detection and automatic staging changes.

### Acceptance criteria

- The CLI can select any configured adapter through the same provider interface.
- Adding each cloud adapter requires no branching inside the Git, validation, or commit layers.
- Missing or invalid credentials fail before staged content is transmitted.
- The developer is clearly informed when a cloud destination is selected.
- Cloud provider errors map to consistent application errors without exposing secrets.
- Shared provider contract tests pass for the mock, Ollama, OpenAI, and Gemini adapters.

### Tests required before moving forward

- Contract tests for both adapters with mocked SDK or HTTP boundaries.
- Tests for missing credentials, authentication errors, rate limits, timeouts, cancellation, malformed results, and provider outages.
- Tests proving credentials are absent from prompts, logs, snapshots, and surfaced errors.
- Tests proving there is no implicit local-to-cloud fallback.
- Shared validation tests using representative outputs from all providers.
- Optional opt-in integration tests that require explicitly supplied test credentials and never run by default.

## Phase 5: Mixed-change detection and atomic recommendations

### Goal

Identify likely unrelated staged work and recommend smaller, coherent commits without silently altering the staging area.

### Features

- Analysis of file, directory, diff, and semantic relationships.
- Confidence-scored groups of likely related changes.
- Explanations for why a staged snapshot may contain multiple concerns.
- Suggested Conventional Commit messages for each proposed group.
- Recommendations for atomic commits.
- A review workflow that makes uncertainty and omitted context visible.

### Intentionally excluded

- Silent `git reset`, `git add`, partial staging, or history rewriting.
- Treating model groupings as facts.
- Splitting hunks automatically without a separately approved safety design.
- Committing a subset that the developer has not explicitly reviewed and staged.
- Promising perfect detection of unrelated changes.

### Acceptance criteria

- Coherent single-purpose changes are not routinely split without evidence.
- Clearly unrelated fixtures produce separate recommendations with understandable reasons.
- Low-confidence cases are labeled uncertain rather than forced into groups.
- Binary, generated, renamed, and cross-cutting files have explicit handling.
- Recommendations never mutate the index.
- If future staging assistance is designed, every mutation is previewed, confirmed, and verified independently of this detection feature.

### Tests required before moving forward

- Curated fixtures for single-purpose, clearly mixed, and ambiguous staged changes.
- Tests for changes spanning source, tests, documentation, migrations, lockfiles, generated files, and configuration.
- Regression tests for false splits and false merges.
- Deterministic tests around grouping rules before model-assisted heuristics.
- Provider-independent tests showing equivalent group structures can be validated across adapters.
- Security tests ensuring grouping does not reintroduce filtered content.
- End-to-end tests proving recommendations leave the staging area unchanged.

## Recommended first milestone

Complete Phase 1 as a strictly read-only vertical slice: invoke the CLI, parse options, inspect the Git index, normalize the result, display a concise staged-change summary, and prove through tests that the repository is unchanged. This establishes the most important factual boundary before adding uncertain model output.
