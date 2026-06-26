# Agent Guide

This repository is a prompt-first working-memory TUI written in Node.js ESM. It stores facts as Markdown files with front matter inside a user-selected workspace directory.

## Start Here

- Read `src/README.md` for the architecture and each source file's role.
- Run `npm test` after behavior changes.
- Use `npm start -- <workspace-root>` or `node src/index.js <workspace-root>` to run the TUI manually.
- Use `npm run import:people -- <csv-path> [workspace-root]` for the people importer.

## Fast Navigation

- TUI orchestration, prompt state, rendering, completions, command execution: `src/index.js`
- Command-facing workspace operations and model refresh after mutations: `src/api.js`
- Markdown/front matter, fact creation, deletion, relation/property edits: `src/facts.js`
- In-memory context/fact model, model refresh, filesystem watch: `src/model.js`
- Command DSL parsing and config loading: `src/commands.js`
- Lens config, presenter logic, visible fact filtering: `src/lenses.js`
- Handlebars template rendering and color filters: `src/templates.js`
- Enum config and autocomplete values: `src/enums.js`
- Natural-language dates: `src/dates.js`
- Workspace config watchers: `src/config-watch.js`
- Default command/lens/enum/template config: `default-config/`
- Notion people import script: `scripts/import-people.js`
- Tests mirror source files under `test/`.

## Core Invariants

- Context IDs are workspace-relative slash paths. The root context ID is `""`.
- Fact IDs are workspace-relative Markdown file paths.
- Hidden directories are ignored by the model, including `.trash`, `.gatherbrain`, and any path segment beginning with `.`.
- New facts are always created in the current context, even while peeking at another context.
- Saving while peeking relates the new fact to the peeked context.
- `:switch` clears peek.
- Deleting a fact moves it into `.trash` inside the fact's context instead of permanently removing it.
- Rendering should use the in-memory model, not reread files on every draw.
- After app-driven mutations, refresh the model region that changed.
- Command names and argument shapes come from the command DSL config.
- Enums come from enum config and are used for argument validation/autocomplete.
- Templates render presenter view models; presenters are app code, not user config.

## Fact Creation Details

- `saveFact()` in `src/facts.js` is the canonical fact creation helper.
- Generated filename bases are truncated to prevent `ENAMETOOLONG`.
- New fact titles are plain text previews capped at 80 characters.
- The full captured fact text is stored in the Markdown body.
- `@context` references in captured body text are converted to Markdown links.
- The default template prefers body text over title text.
- TUI rendering converts Markdown links to plain colored labels.

## Testing Guidance

- Run the full suite with `npm test`.
- Add or update focused tests in the matching `test/*.test.js` file.
- Important test files:
  - `test/index.test.js` for TUI behavior, command execution, completion, rendering, paste/open/restart.
  - `test/api.test.js` for command-facing workspace operations and model refresh.
  - `test/facts.test.js` for Markdown, filenames, relations, and low-level filesystem helpers.
  - `test/model.test.js` for workspace loading, hidden directory handling, refresh, and model watchers.
  - `test/lenses.test.js` for presenter and lens behavior.
  - `test/commands.test.js` for command DSL parsing.
  - `test/templates.test.js` for Handlebars rendering.

## Change Placement

- If the change affects file format or Markdown parsing, start in `src/facts.js`.
- If the change affects command-facing workspace mutations or context resolution, start in `src/api.js`.
- If the change affects what facts are visible or what fields templates receive, start in `src/lenses.js`.
- If the change affects screen layout, wrapping, prompt mode, paste, editor/open integration, or key handling, start in `src/index.js`.
- If the change affects command syntax or arguments, update `default-config/commands.json` and `src/commands.js`.
- If the change affects user-configurable views, update `default-config/lenses.json`, `default-config/templates/`, `src/lenses.js`, or `src/templates.js` as appropriate.
- If the change affects default autocomplete values for enum arguments, update `default-config/enums.json` and tests.

## Local Config Shape

Workspace-local configuration lives under `.gatherbrain/` in the selected workspace root:

- `.gatherbrain/commands.json`
- `.gatherbrain/enums.json`
- `.gatherbrain/lenses.json`
- `.gatherbrain/templates/*.hbs`

Default config is loaded first, then local config overrides or extends it.

## Repository Practices

- Keep edits scoped. The project has broad integration tests, but many behaviors are intentionally simple.
- Prefer existing helpers over ad hoc filesystem or string manipulation.
- Do not bypass the object model for rendering paths.
- Keep generated Markdown stable and covered by tests when changing format behavior.
- Use `rg` to find call sites quickly.
