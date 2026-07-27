# Architecture

## Intended flow

The finished CLI will use this sequence:

```text
Developer command
    → CLI argument parsing
    → staged Git diff collection
    → secret filtering
    → LLM provider
    → structured result validation
    → interactive selection
    → confirmation
    → Git commit
```

Each arrow is a boundary. Data should cross a boundary only after the previous layer has completed its checks. In particular:

- Git inspection is read-only until the final commit action.
- Unsanitized staged content must not reach a provider.
- Model output is untrusted until runtime validation succeeds.
- A validated suggestion is still only a suggestion.
- Selection is not confirmation; committing requires a separate explicit confirmation.

## Flow in more detail

1. **Developer command:** The developer invokes the CLI inside a Git working tree.
2. **CLI argument parsing:** The command and options are converted into a known configuration. Invalid combinations fail before Git or a provider is called.
3. **Staged Git diff collection:** The Git layer reads only the index, not all unstaged working-tree changes. It also gathers enough metadata to handle additions, deletions, renames, binary files, and an empty staging area.
4. **Secret filtering:** The security layer detects or redacts likely secrets and identifies content that is unsafe to send. High-confidence findings should stop cloud transmission unless a future, deliberately designed policy says otherwise.
5. **LLM provider:** A selected adapter sends only the approved, sanitized request to Ollama, OpenAI, or Gemini. Provider timeouts, unavailable models, invalid credentials, and network errors remain provider-layer errors.
6. **Structured result validation:** The validation layer parses the result and enforces the expected structure and commit-message rules. Prompt instructions do not replace validation.
7. **Interactive selection:** The developer reviews multiple candidates and may choose one, request a retry in a later design, edit one in a later design, or cancel.
8. **Confirmation:** The CLI displays the exact message and action that will occur and asks for an explicit yes/no decision.
9. **Git commit:** Only the commit layer may perform the mutation. It commits the staged snapshot using the confirmed message and reports Git's actual result.

## Provider-independent design

The application needs a stable provider concept rather than conditional OpenAI, Gemini, or Ollama logic spread throughout the CLI.

Conceptually, every provider adapter should expose:

- A stable provider identifier, such as `ollama`, `openai`, or `gemini`.
- A way to check whether required configuration is present and usable.
- A generation operation that accepts one neutral suggestion request.
- A neutral success result containing raw candidate data and limited, non-secret metadata.
- Consistent failures for configuration, authentication, availability, timeout, cancellation, rate limits, and malformed provider output.

The neutral request should contain only project-owned concepts:

- The sanitized staged-change representation.
- The requested number of suggestions.
- Conventional Commit constraints.
- Relevant repository context that has passed the same security policy.
- Cancellation and timeout information.

The provider contract should not contain OpenAI, Gemini, or Ollama SDK types. Each adapter translates at its boundary:

```text
Project request
    → provider-specific request
    → provider-specific response
    → neutral raw result
```

The raw result then goes through the shared validation layer. Adapters should not be trusted to declare their own output valid. This gives all providers the same rules and makes a mock provider possible in Phase 2.

Provider-specific configuration belongs with the adapter:

- Ollama: local endpoint and model name.
- OpenAI: API key, selected model, and cloud-specific options.
- Gemini: API key, selected model, and Google-specific options.

The CLI may choose a provider, but it should not know how that provider authenticates or formats requests.

## Shared domain concepts

The design will eventually need neutral concepts such as:

- **Staged change set:** file metadata plus a bounded diff representation collected from Git's index.
- **Sanitized change set:** staged data after secret and policy checks, safe enough for the selected destination.
- **Suggestion request:** sanitized context plus message style and count requirements.
- **Raw provider result:** untrusted data returned by an adapter.
- **Validated suggestions:** normalized candidates that satisfy the schema and basic policy.
- **Commit intent:** the exact selected message tied to the staged snapshot the developer reviewed.
- **Commit result:** success or a clear Git failure without inventing state.

These are conceptual domain objects, not TypeScript definitions yet.

## Layer responsibilities

### CLI layer

The CLI layer owns the user-facing session:

- Parse commands and options.
- Display help and actionable errors.
- Coordinate the layers in the intended order.
- Render staged-change summaries and validated suggestions.
- Ask for interactive selection and a separate confirmation.
- Handle cancellation and choose process exit codes.

It must not parse raw Git output, scan secrets, format provider-specific requests, validate model JSON by assumption, or directly construct a shell command.

### Git layer

The Git layer is the sole source of repository facts:

- Verify that the command runs inside a Git work tree.
- Inspect the index and collect the staged diff.
- Distinguish staged changes from unstaged and untracked changes.
- Normalize file states such as added, modified, deleted, renamed, and binary.
- Detect an empty staging area and report Git failures faithfully.
- Produce a stable staged-snapshot identity or equivalent guard for the later commit.

Read operations and write operations should be visibly separate. No read-only inspection method may commit, stage, reset, or edit files.

### Security layer

The security layer decides what content may leave the local Git process:

- Scan staged paths and content for likely credentials and sensitive material.
- Redact safe-to-redact values.
- Block or require a deliberate future policy for high-risk findings.
- Apply size limits so enormous or generated diffs are not sent blindly.
- Prevent credentials from appearing in logs, errors, telemetry, prompts, or test snapshots.
- Describe whether data stays local with Ollama or is sent to a selected cloud provider.

Secret detection is defense in depth, not a guarantee. Pattern matching has false positives and false negatives. The safest default for cloud providers is to stop when confidence is high and tell the developer which file needs review without printing the secret.

### Prompt layer

The prompt layer expresses provider-neutral intent:

- Summarize the staged-change context in a consistent format.
- Request the desired number of suggestions.
- State Conventional Commit constraints and expected structured output.
- Keep instructions separate from untrusted diff content.
- Mark diff content as data so text inside a source file cannot silently become a trusted instruction.
- Enforce prompt-size budgets by selecting or summarizing approved context according to a visible policy.

It must not contain SDK calls, API keys, terminal prompts, or Git mutation logic.

### Provider layer

The provider layer handles model transport:

- Implement the shared provider contract.
- Translate neutral requests to Ollama, OpenAI, or Gemini formats.
- Read provider configuration without exposing credentials.
- Apply timeouts and support cancellation.
- Convert provider errors into consistent application errors.
- Return raw neutral result data for shared validation.

It must not commit, prompt for confirmation, or bypass the security layer. SDK-specific types stay inside the relevant adapter.

### Validation layer

The validation layer is the trust boundary after the model:

- Parse structured output without assuming it is valid JSON.
- Enforce the shared response schema.
- Normalize whitespace and reject empty or duplicate candidates.
- Enforce agreed Conventional Commit structure and reasonable length limits.
- Reject unexpected or unsafe control characters.
- Produce clear retryable versus non-retryable validation errors.

Schema validity does not prove that a suggestion is accurate. The developer remains responsible for semantic review.

### Commit layer

The commit layer owns the only planned Git mutation:

- Accept an exact, validated message only after explicit confirmation.
- Verify that the staged snapshot still matches what was reviewed.
- Invoke Git without shell interpolation.
- Preserve Git's hooks, signing, configuration, and error behavior.
- Report the actual commit identifier on success.
- Make no commit when confirmation is declined or the staged snapshot changed.

It must not silently stage files, split changes, bypass hooks, rewrite history, or retry a failed commit with altered options.

## Conventional Commit suggestions

The prompt and validation policies should agree on the target shape:

```text
type(optional-scope): concise description
```

Future policy may allow an optional body and footer, including breaking-change notation. The model should propose a type and scope based on evidence in the staged diff. The validator can enforce shape, but only the developer can judge whether `fix`, `feat`, `refactor`, or another type is accurate.

## Architecture risks

### Secret leakage

A staged diff can contain API keys, private URLs, personal data, or proprietary code. Filtering must occur before provider selection is invoked. Cloud transmission should be explicit and visible.

### Prompt injection in source content

A staged file may contain text that looks like an instruction to the model. The prompt layer must clearly delimit repository content as untrusted data, and the response must still pass shared validation and human review.

### Staging-area race

The index could change between analysis and confirmation. The commit layer should bind the review to a staged-snapshot identity and refuse to commit if it changed.

### Incorrect or fabricated suggestions

Models may misunderstand the diff. Multiple suggestions and human review help, but they do not guarantee correctness. No model response should trigger an automatic commit.

### Large and binary changes

Diffs can exceed context limits or include binary data. The Git and prompt layers need explicit size, truncation, and omission policies that remain visible to the developer.

### Provider drift

SDKs, model names, response formats, and availability change. Thin adapters, shared contract tests, and provider-specific integration tests limit the impact.

### Cross-platform process behavior

Git invocation, terminals, quoting, signals, and exit codes differ across operating systems. Argument arrays, integration tests, and avoidance of shell strings reduce this risk.

### Mixed staged changes

One staged snapshot may contain unrelated work. Early phases should not pretend to split it automatically. Phase 5 will add detection and recommendations, while actual staging changes remain under developer control unless a later design explicitly expands scope.

## Safety invariants

- No provider receives unsanitized diff content.
- No provider output bypasses runtime validation.
- No selection counts as commit confirmation.
- No commit occurs when the reviewed staged snapshot has changed.
- No provider SDK type crosses into shared application layers.
- No API key is placed in a prompt, log, Git message, fixture, or error report.
- No phase before the commit feature performs Git mutations.
