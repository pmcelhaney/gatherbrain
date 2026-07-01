# Core Class Sketch

This sketch treats the spec as a domain model first and a terminal UI second.
The goal is to keep storage, parsing, state transitions, and rendering separate
enough that each can be tested without running the full TUI.

The application will be built in Node.js. Class names in this document refer to
JavaScript classes unless a later implementation note says otherwise.

## Domain Classes

### `Session`

Represents a named unit of work.

Responsibilities:

- Normalize and expose the session name.
- Provide filesystem-safe path segments for storage.
- Compare sessions by canonical name.

Does not:

- Own facts.
- Know about the current query or selection.
- Manage time boxes directly.

### `Fact`

Represents one Markdown-backed unit of knowledge.

Core fields:

- `id`, stored as a UUID
- `content`
- `type`
- `createdAt`
- `dueDate`
- `file`
- `homeSession`
- `associatedSessions`

Responsibilities:

- Enforce the invariant that every fact has exactly one home session.
- Enforce that every fact ID is a UUID.
- Add or remove associated sessions without duplicating the home session.
- Apply domain changes such as `setType`, `setDueDate`, and `associateSession`.
- Produce a serializable representation for Markdown storage. The home session
  stays on the domain object, but it is derived from the containing directory
  and is not serialized into front matter.

Does not:

- Decide where files live.
- Parse search syntax.
- Render itself for the terminal.

### `TimeBox`

Represents planned work for a time range, date, and session.

Core fields:

- `id`
- `date`
- `session`
- `startsAt`
- `endsAt`

Responsibilities:

- Validate that the end is after the start.
- Keep the calendar date explicit even when start and end times are local-time
  values.
- Answer overlap and containment questions.
- Carry only planning data, never fact data.

Does not:

- Create facts.
- Change the current session on its own.

## Application State

### `AppState`

Owns the current interactive state from the spec.

Core fields:

- `currentSession`
- `currentQuery`
- `currentSelection`
- `currentMode`
- `planPreview`

Responsibilities:

- Enforce that facts cannot be captured before a session is selected.
- Reset in-memory state during startup and runtime restart reloads.
- Switch sessions and reset the query to `session:<new session>`.
- Track mode transitions inferred from prompt input.

Does not:

- Persist facts.
- Execute commands directly.
- Parse every prompt grammar itself.

### `Selection`

Represents the stable selected result identities, not just row numbers.

Responsibilities:

- Resolve number and dot selectors against the current `SearchResultSet`.
- Preserve selected fact IDs for command execution.
- Clear when the session or query changes.

Does not:

- Apply actions.
- Store facts.

### `PlanPreview`

Represents the uncommitted edit in plan mode.

Responsibilities:

- Hold the parsed time box draft while the user types.
- Report whether the preview is valid enough to commit.
- Convert to a `TimeBox` on Enter.

Does not:

- Persist itself.
- Create facts.

## Parsing And Dispatch

### `PromptClassifier`

Classifies raw prompt input into one of the five modes.

Responsibilities:

- Detect capture, search, command, selection, and plan prefixes.
- Keep the first-character mode rules centralized.

Does not:

- Execute the prompt.
- Mutate application state.

### `PromptController`

Coordinates prompt handling.

Responsibilities:

- Accept raw input.
- Ask `PromptClassifier` which mode applies.
- Route to the matching handler.
- Return an `InteractionResult` describing state changes and messages.

Does not:

- Contain detailed command, search, selection, or plan parsers.

### `SearchQueryParser`

Parses `/` input after shortcut expansion.

Responsibilities:

- Support terms, quoted phrases, field filters, Boolean operators, and grouping.
- Enforce precedence: `NOT`, then `AND`, then `OR`.
- Treat adjacent terms as implicit `AND`.
- Produce a query AST.

Does not:

- Search files.
- Know about terminal row numbers.

### `SearchShortcutRegistry`

Expands `//shortcut` queries.

Responsibilities:

- Store named shortcut definitions.
- Resolve dynamic values such as current session, today, and this week.
- Return a complete search query string before parsing.

Does not:

- Parse the expanded query.
- Execute searches.

### `CommandRegistry`

Maps `:` command names to command objects.

Initial commands:

- `SwitchSessionCommand`
- `RestartCommand`
- `PasteCommand`

Responsibilities:

- Resolve command names.
- Validate command arguments.
- Execute state transitions through explicit command classes.

Does not:

- Handle selection actions.

### `SelectionActionRegistry`

Maps configurable action keywords to action objects.

Initial actions:

- `SetTypeAction`
- `SetDueDateAction`
- `TrashFactAction`
- `AssociateCurrentSessionAction`

Responsibilities:

- Load the action DSL.
- Resolve an action keyword such as `todo`, `tomorrow`, `delete`, or `gather`.
- Apply the action to selected facts through repositories.

Does not:

- Parse search queries.
- Change command-mode behavior.

### `PlanParser`

Parses `;` input into a `PlanPreview`.

Responsibilities:

- Parse examples such as `; 9-10 Steve` and `; tomorrow 2-3 Reading`.
- Resolve the planning date and local start and end times.
- Return a staged time box draft for immediate calendar rendering.

Does not:

- Persist the time box until the preview is committed.

## Persistence

### `Workspace`

Represents the root storage location.

Responsibilities:

- Locate root-level session folders, fact files, and `.trash`.
- Locate the daily time box text file for a given date.
- Provide path-building helpers for repositories.

Does not:

- Parse Markdown front matter.
- Parse time box text files.
- Execute searches.

### `FactRepository`

Persists facts as Markdown files with front matter.

Responsibilities:

- Create facts in `<workspace>/<home session>/`.
- Read facts from Markdown files and derive each fact's home session from its
  containing directory.
- Update front matter and content.
- Move deleted facts into `.trash` under their home session.

Does not:

- Decide what a selection action means.
- Maintain current UI state.

### `TimeBoxRepository`

Persists and retrieves time boxes in date-scoped text files.

Responsibilities:

- Save committed time boxes.
- Store time boxes one file per date so historical plans remain available.
- Load the current date cheaply for the normal interactive workflow.
- Read and write through `TimeBoxTextCodec`.
- Query historical dates without coupling planning data to fact storage.
- Query time boxes by time range.
- Keep planning storage independent from fact storage.

Does not:

- Create facts.
- Drive plan preview rendering.

### `TimeBoxTextCodec`

Handles conversion between `TimeBox` instances and daily text files.

Responsibilities:

- Parse one date's time boxes from a text file.
- Serialize one date's time boxes back to text.
- Preserve enough stable identity to update or delete committed time boxes.

Does not:

- Choose file paths.
- Query historical ranges.

### `MarkdownFactCodec`

Handles conversion between `Fact` instances and Markdown files.

Responsibilities:

- Parse front matter.
- Serialize front matter.
- Require repository-provided storage context for the fact's home session.
- Preserve fact body content.

Does not:

- Choose file paths.
- Move files to trash.

## Search And Results

### `SearchEngine`

Executes parsed search queries against facts.

Responsibilities:

- Evaluate query AST nodes against facts.
- Support field filters such as `type`, `due`, and `session`.
- Return a stable `SearchResultSet`.

Does not:

- Parse prompt strings.
- Render rows.

### `SearchResultSet`

Represents the facts visible in the body.

Responsibilities:

- Maintain stable fact numbers until the session or search changes.
- Expose visible ordering for rendering and dot selection.
- Resolve displayed numbers to fact IDs.

Does not:

- Mutate facts.

## Terminal UI

### `TerminalApp`

Top-level runtime object.

Responsibilities:

- Wire together state, repositories, parsers, registries, and renderers.
- Handle lifecycle startup and shutdown.
- Drive the render loop.

Does not:

- Contain domain rules that belong in lower-level classes.

### `HeaderRenderer`

Renders current session, active query, mode, and result count.

### `BodyRenderer`

Renders either the current `SearchResultSet` or the calendar in plan mode.

### `PromptRenderer`

Renders the prompt according to current mode and input buffer.

### `CalendarRenderer`

Renders committed time boxes plus the staged `PlanPreview`.

## Suggested Dependency Direction

```text
TerminalApp
  -> PromptController
  -> AppState
  -> Registries and parsers
  -> Repositories
  -> Domain classes
```

Renderers should read view models, not repositories directly.
Repositories should know storage details, not terminal state.
Domain classes should not import UI, parser, or persistence code.

## First Implementation Slices

1. Domain classes: `Session`, `Fact`, `TimeBox`.
2. State classes: `AppState`, `Selection`, `PlanPreview`.
3. Fact persistence: `Workspace`, `MarkdownFactCodec`, `FactRepository`.
4. Prompt classification and capture flow.
5. Search parser and shortcut expansion.
6. Selection actions.
7. Planning parser and daily time box persistence: `PlanParser`,
   `TimeBoxTextCodec`, `TimeBoxRepository`.
8. Terminal rendering.
