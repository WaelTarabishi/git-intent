# Dependencies

This project will be a command-line program that runs on a developer's computer. It will inspect Git's staging area, ask a language model for commit-message suggestions in later phases, validate the result, and let the developer make the final decision.

The project needs three different kinds of tools:

## Dependencies, devDependencies, and external tools

### `dependencies`

Runtime dependencies are npm packages needed while the installed CLI is running. If another developer installs and executes the finished package, these packages must be available too.

For this project, the initial runtime dependencies are:

- `commander`
- `execa`
- `@inquirer/prompts`
- `zod`

For example, `commander` reads CLI options and `execa` runs Git safely. These tasks happen on the user's computer when the CLI runs, so the packages belong in `dependencies`.

### `devDependencies`

Development dependencies are npm packages needed to build, check, and test the project, but not normally needed by the published JavaScript at runtime.

For this project, the initial development dependencies are:

- `typescript`
- `tsx`
- `@types/node`
- `vitest`

For example, TypeScript checks source types and Vitest runs the test suite while the package is being developed.

The exact runtime contents of a published package will depend on the future build and packaging design. The distinction above describes each package's intended responsibility.

### External system tools

External tools are programs installed on the computer, not packages imported into this project.

- **Git** is required because the CLI reads Git's staged changes and eventually invokes `git commit`. Installing an npm package does not install Git.
- **Ollama** is optional for the Phase 3 local provider. It runs as a separate local service, manages local models, and exposes an HTTP API. Installing the CLI will not automatically install a model or the Ollama service.
- **Node.js** is the runtime that executes the CLI. It is installed independently and includes npm in normal Node.js installations.

An npm dependency can communicate with an external tool, but it does not replace that tool. For example, `execa` can start the `git` executable, but Git itself must already be installed.

## Tool and package guide

The status labels used below mean:

- **Required now:** part of the initial setup or the first read-only milestone.
- **Required later:** needed only when a planned feature is introduced.
- **Optional:** needed only when the developer chooses a particular provider or workflow.

### Node.js

**Problem it solves:** Node.js executes JavaScript outside a web browser. It provides the process, filesystem, environment-variable, stream, and networking APIs needed by a CLI.

**Where it will be used:** It will run the compiled command, expose CLI arguments through the process, read environment variables, and provide standard APIs such as `fetch`.

**Conceptual example:** A terminal starts the package's executable; Node.js loads its JavaScript entry point and supplies the arguments the developer typed.

**Status:** Required now. The project should later declare and test a supported Node.js version range.

**Built-in alternative:** None. Node.js is the runtime rather than a library inside the runtime. Other JavaScript runtimes exist, but supporting them would be a separate compatibility decision.

**Why this choice:** The package is intended for the Node.js/npm ecosystem, and the developer audience already uses Node.js.

### npm

**Problem it solves:** npm downloads packages, records dependency versions, runs project scripts, and publishes packages to the npm registry.

**Where it will be used:** It will install the declared packages, run development commands, and eventually package or publish the CLI.

**Conceptual example:** A future `npm test` script could start Vitest using the version recorded by the project.

**Status:** Required now. It is normally included with Node.js.

**Built-in Node.js alternative:** Node.js does not contain a complete package manager API that replaces npm. Other package managers such as pnpm and Yarn are external alternatives.

**Why this choice:** npm is widely available with Node.js and is the distribution target named for this package.

### TypeScript

**Problem it solves:** TypeScript checks types before release. It makes contracts between layers explicit and catches mistakes such as passing an unvalidated provider response to the commit layer.

**Where it will be used:** It describes CLI options, Git results, bounded model
requests, provider contracts, validated suggestions, and test fixtures.

**Conceptual example:** A provider result can be described as a collection of commit-message candidates. Type checking can reject code that treats that collection as a single string.

**Status:** Required now as a development dependency.

**Built-in Node.js alternative:** Recent Node.js versions can execute some TypeScript syntax by stripping types, but that is not a replacement for full project type checking, declaration generation, or a deliberate build configuration. Plain JavaScript with JSDoc is another option.

**Why this choice:** The architecture has several trust boundaries. Static contracts make those boundaries easier to understand, test, and refactor than untyped JavaScript.

### `commander`

**Problem it solves:** Commander parses command names, flags, options, help text, and invalid input in a consistent way.

**Where it will be used:** In the CLI layer, for options such as provider choice, suggestion count, dry-run behavior, or future non-interactive modes.

**Conceptual example:** The developer types a command requesting three suggestions; Commander converts the text arguments into a checked options object and displays help for invalid usage.

**Status:** Required now as a runtime dependency.

**Built-in Node.js alternative:** The CLI could inspect `process.argv` directly and manually implement option parsing, validation, help, and error messages. Node.js also provides limited argument-parsing utilities.

**Why this dependency:** Commander provides a mature CLI structure and consistent help and error behavior without maintaining a custom parser as options grow.

### `execa`

**Problem it solves:** Execa starts external programs, captures their output, represents exit failures clearly, and supports cancellation and timeouts more ergonomically than lower-level process APIs.

**Where it will be used:** In the Git layer for read-only commands such as collecting the staged diff, and later in the commit layer for an explicitly confirmed commit.

**Conceptual example:** The Git layer asks Execa to run Git with an argument array, then separately receives standard output, standard error, and the exit status.

**Status:** Required now as a runtime dependency.

**Built-in Node.js alternative:** `node:child_process`, especially `spawn` or `execFile`, can invoke Git without a shell.

**Why this dependency:** Execa reduces process-management boilerplate and gives clearer cross-platform error handling. The project must still pass arguments as an array and avoid building shell command strings.

### `@inquirer/prompts`

**Problem it solves:** It provides interactive terminal questions such as selection lists and confirmations, including keyboard behavior and cancellation handling.

**Where it will be used:** In the CLI layer during Phase 2 and later, when the developer reviews suggestions, chooses one, and confirms whether to commit.

**Conceptual example:** The CLI displays three validated messages; the developer moves to one choice, selects it, and then answers a separate confirmation question.

**Status:** Included in the initial runtime dependencies, but first used meaningfully in Phase 2. It is not needed for Phase 1's read-only output.

**Built-in Node.js alternative:** `node:readline` and `node:readline/promises` can read terminal input.

**Why this dependency:** Building accessible selection lists, retries, cancellation, and consistent prompts with `readline` would add substantial UI code unrelated to the project's core purpose.

### `zod`

**Problem it solves:** Zod validates unknown data at runtime and converts successful input into a known shape. TypeScript alone cannot prove that JSON returned by a model follows the requested format.

**Where it will be used:** In the validation layer for provider responses and potentially for configuration or persisted settings.

**Conceptual example:** A model returns JSON claiming to contain three suggestions. Zod checks that the value is an object, the suggestions are strings with acceptable lengths, and required fields exist before the UI sees them.

**Status:** Included in the initial runtime dependencies, but first required by Phase 2.

**Built-in Node.js alternative:** Hand-written checks using `typeof`, `Array.isArray`, property checks, and custom error construction.

**Why this dependency:** A schema keeps validation rules centralized, readable, and testable. Hand-written checks become repetitive and can miss nested or malformed values.

### `tsx`

**Problem it solves:** `tsx` runs TypeScript files during development without requiring a separate compile step for every edit.

**Where it will be used:** In development scripts for quickly running the CLI or small development entry points.

**Conceptual example:** During Phase 1, a developer runs the TypeScript CLI in a test repository and immediately sees its read-only staged-diff summary.

**Status:** Required now as a development dependency.

**Built-in Node.js alternative:** Compile with TypeScript first and run the emitted JavaScript with Node.js. Some Node.js versions can also strip a limited set of TypeScript syntax.

**Why this dependency:** It shortens the development feedback loop while TypeScript remains responsible for full type checking and the future production build.

### `@types/node`

**Problem it solves:** It supplies TypeScript declarations for Node.js APIs and globals, such as `process`, buffers, filesystem functions, and child processes.

**Where it will be used:** Anywhere TypeScript code interacts with the Node.js runtime.

**Conceptual example:** The editor can explain the shape of `process.env` and TypeScript can detect an invalid option passed to a Node.js API.

**Status:** Required now as a development dependency.

**Built-in Node.js alternative:** Node.js provides the runtime APIs but does not provide all of the TypeScript declarations needed by a typical TypeScript project.

**Why this dependency:** Without these declarations, Node.js APIs would be missing types or would require unsafe local declarations.

### `vitest`

**Problem it solves:** Vitest discovers tests, supplies assertions and mocks, reports failures, and supports TypeScript-oriented development workflows.

**Where it will be used:** For unit tests of parsing, Git-output interpretation,
sensitive-filename detection, validation, prompt construction, and provider
adapters, plus selected integration tests.

**Conceptual example:** A test supplies a staged diff fixture containing renamed files and verifies that the Git layer returns the expected normalized representation without running a real commit.

**Status:** Required now as a development dependency.

**Built-in Node.js alternative:** `node:test` and `node:assert` provide a capable built-in test runner and assertions.

**Why this dependency:** Vitest offers a concise mocking and TypeScript-friendly workflow familiar to many frontend developers. Tests should avoid unnecessary Vitest-specific coupling so a future change remains possible.

### `dotenv`

**Problem it solves:** Dotenv reads key-value pairs from a `.env` file and places them in `process.env`.

**Where it might be used:** It could load local API-key configuration for cloud providers during development.

**Conceptual example:** A local `.env` file contains a provider key; Dotenv loads it before configuration is read.

**Status:** Optional and deliberately not included in the initial installation.

**Built-in Node.js alternative:** Use the operating system's environment variables, `process.env`, and native Node.js environment-file support such as the `--env-file` command-line option where supported.

**Why we are not using the dependency initially:** Native support is sufficient and removes an extra package. Secret files must remain ignored by Git, and the CLI must never include provider credentials in prompts, diagnostics, or Git content.

### OpenAI JavaScript SDK

**Problem it solves:** The official `openai` package provides typed request methods, authentication handling, response objects, errors, and access to OpenAI APIs.

**Where it will be used:** Only inside a future OpenAI provider adapter. Its types and response format should not escape into the rest of the application.

**Conceptual example:** The OpenAI adapter receives a provider-independent request, calls the SDK, and converts the response into the project's neutral raw-suggestion format.

**Status:** Required later only for developers who enable the OpenAI provider. It must not be installed during the initial phases.

**Built-in Node.js alternative:** Native `fetch` can call the HTTPS API directly.

**Why use the SDK later:** The official SDK can reduce HTTP, authentication, error, and response-handling code. The choice should be revisited when the OpenAI phase begins so the project does not commit early to an SDK surface it is not using.

### Google GenAI SDK

**Problem it solves:** The official `@google/genai` package provides JavaScript access to Google's Gemini models, including request configuration and provider-specific response handling.

**Where it will be used:** Only inside a future Gemini provider adapter. Other layers should know it only through the provider-independent contract.

**Conceptual example:** The Gemini adapter translates the neutral suggestion request into Gemini's request format and translates the result back into neutral candidate data.

**Status:** Required later only for developers who enable the Gemini provider. It must not be installed during the initial phases.

**Built-in Node.js alternative:** Native `fetch` can call the relevant HTTPS API directly.

**Why use the SDK later:** The official SDK can simplify provider-specific authentication, configuration, and response handling. Deferring it avoids unused dependencies and lets the team evaluate the current SDK when implementation actually begins.

### Ollama and its local HTTP API

**Problem it solves:** Ollama installs, manages, and runs language models locally. Its local HTTP API lets another program send prompts to a running model without sending the staged diff to a cloud service.

**Where it is used:** In Phase 3, the Ollama provider adapter calls the configured local service. The service, selected model, and model files remain outside this npm package.

**Conceptual example:** The adapter sends a bounded, explicitly delimited
commit-suggestion request to a loopback HTTP address, receives model output, and
passes that untrusted output to the validation layer.

**Status:** External system tool required for `suggest` and `generate`. It is
not an npm dependency and is not required for `inspect`.

**Built-in Node.js alternative:** Node.js native `fetch` is sufficient for calling Ollama's HTTP API. There is no built-in alternative that runs the language model itself.

**Why use the HTTP API instead of an npm client:** The Phase 3 adapter uses the
documented `/api/generate` protocol through Node.js `fetch`, avoiding an extra
runtime dependency. Ollama is still required as the model host. The project can
reconsider a client library if direct HTTP maintenance becomes costly.

## Dependency principles

- Install a package only when its phase needs it.
- Keep provider SDKs inside their adapters.
- Treat every provider response as untrusted until runtime validation succeeds.
- Prefer Node.js built-ins when they are clear and sufficient, especially for environment variables and HTTP.
- Never assume an npm package installs Git, Ollama, or a local model.
- Pin supported Node.js and package versions during implementation, not in this architecture-only stage.
