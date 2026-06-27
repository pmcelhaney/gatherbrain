# Usage

Run the app with a workspace root:

```sh
npm start -- /path/to/workspace
```

The root directory and every non-hidden subdirectory are contexts. Hidden directories, including `.trash` and `.gatherbrain`, are ignored.

Each context can include an optional reserved `index.md` file for context metadata. The app loads that file onto the context and does not show it as a normal fact.

The workspace is loaded into an in-memory model at startup. Visible workspace directories are watched while the TUI is running, so external Markdown edits and newly created contexts are reflected in the model without restarting the app. Workspace configuration in `.gatherbrain` is also watched, so command, lens, enum, and template changes are reloaded while the app runs.

The top of the screen shows the current context. Existing facts in that context and its subcontexts are listed below it, and the prompt stays on the bottom line.

When facts do not fit on one screen, complete items are paged with an ellipsis. Use `Page Up` and `Page Down` to move between pages.

Use `:q`, `:quit`, `:exit`, or `Ctrl+C` to leave the prompt.

## Capturing Facts

Typing text without a leading colon creates a fact in the current context.

```text
Follow up with @Alex about the prototype
```

The saved fact gets:

- a plain-text title preview capped at 80 characters,
- the full captured text in the Markdown body,
- Markdown links in the body for matching `@context` references,
- `type: fact` unless changed later.

Use `:new` when you want the same behavior through an explicit command:

```text
:new Follow up with @Alex about the prototype
```

If you type only `:new`, the app prompts for the fact text.

Use `%<type>` to capture a fact and set its type in one step:

```text
%todo Get milk
```

Press `Tab` after `%` to complete values from the `factType` enum. If the type is not listed, the app asks whether to add it to the workspace enum before creating the fact.

## Commands

Commands use colon-prefixed names. Press `Tab` after `:` to complete command names. If a command is missing an argument, the prompt asks for the next argument.

## Contexts

Use `:switch my-cool-project` to switch to a context. If the context does not exist, the app asks whether to create it. Subsequent facts are written to that directory.

The `:switch` command accepts Unix-style context paths:

- `./foo` is a child of the current context.
- `/foo` is under the workspace root.
- `../` is the parent.
- `../foo` is a sibling.

## Peek

Use `:peek people/alex` to peek at another context while staying in the current context.

New facts are still written to the current context and get `relatedContexts` pointing at the peek context. The peeked context has its own lens, so changing lenses while peeking does not change the current context's lens.

Use `:clear-peek` to clear peek.

## Lenses

Use `:lens todo` to switch to the todo lens, which only shows facts with type `todo`, `waiting`, `in progress`, or `fact` (the default type). Use `:lens all` to show every fact again.

Built-in lenses:

- `all`: show all visible facts.
- `todo`: show facts whose type is `fact`, `todo`, `waiting`, or `in progress`.
- `due`: show facts with a `due` date that are not `done`.
- `today`: show not-done facts due on or before today.
- `current`: show the today lens plus `done` facts last modified today.

## Editing And Opening

Use `:edit 3` to open the third listed fact in `$EDITOR`.

Use `:open` to open the current context directory in the system file viewer.

Use `:open 3` to open the file referenced by the third listed fact's `file` front matter property.

## Deleting

Use `:delete 3` to move the third listed fact to `.trash` inside its context directory.

## Relations

Use `:relate 3 people/alex` to add a workspace-relative context path to the third listed fact's reserved `relatedContexts` front matter field.

## Types And Dates

Use `:type task 3` to change the third listed fact's front matter type to `task`.

The type name can be any letter-starting text with letters, numbers, spaces, `_`, or `-`.

Use `:due today 3` to set the third listed fact's `due` front matter property to a normalized date such as `2026-06-24`.

Date arguments understand:

- `today`, `tomorrow`, and `yesterday`
- `in 2 days` and `in 2 weeks`
- weekdays such as `friday` and `next monday`
- `YYYY-MM-DD`
- `M/D/YYYY` and `M/D/YY`

## Paste

Use `:paste` to name and save the current clipboard contents to a file in the current context. Press Enter to accept the default `Pasted <timestamp>` name, or pass a name inline:

```text
:paste Screenshot of launch issue
```

The chosen name is used for the pasted file and its companion fact. The companion fact's `file` front matter property points to the pasted file. On macOS, image clipboard contents such as screenshots are saved as `.png` files and embedded in the companion Markdown fact.

## Timebox Planner

Timeboxes assign intended focus time to contexts. They are independent of facts and are stored as TSV files under `.gatherbrain/timeboxes/`, one file per day:

```text
.gatherbrain/timeboxes/2026-06-29.tsv
```

Each row has no header and contains:

```text
/context/path<TAB>09:00<TAB>12:00
```

Timeboxes are overlays. Adding a timebox appends a row and does not split or rewrite older rows. When several rows contain the same moment, the last matching row wins. When no timebox matches, the resolved context is `/`.

Use `:plan` without arguments to show the current day's 15-minute planner view:

```text
:plan
```

Use `:plan <start> <context>` to create a 30-minute timebox:

```text
:plan 9 /arb-prep
```

Use `:plan <start>-<end> <context>` to create a longer timebox:

```text
:plan 1:30-3 /arb/meetings/2026-06-29
```

Bare hours `1` through `7` are interpreted as afternoon workday times, so `1:30-3` becomes `13:30-15:00`.

Use `:cancel <time-or-range> <context>` to remove stored rows matching both the time and context:

```text
:cancel 11 /arb/meetings/2026-06-29
:cancel 11-11:30 /arb/meetings/2026-06-29
```

If multiple rows match, the app prompts you to choose one. The fallback root context `/` is never stored, so it cannot be cancelled.

Use `:now` to switch to the context that owns the present local time. If no timebox matches, `:now` switches to `/`.

## Debugging And Restarting

Use `:debug-keys` to toggle key debugging output.

Use `:restart` to restart the app process and restore the current context, peek, lens, lens history, and page position.

This is useful when using the app while actively developing it.

## Configuration

Default commands are defined in `default-config/commands.json`. A workspace-local `.gatherbrain/commands.json` can add commands or override defaults with the same command name. See [Custom Commands](custom-commands.md).

Command enum arguments can use workspace-local `.gatherbrain/enums.json` value lists. See [Custom Enums](custom-enums.md).

Default lenses are defined in `default-config/lenses.json`. A workspace-local `.gatherbrain/lenses.json` can add lenses or override defaults with the same lens id. See [Custom Lenses](custom-lenses.md).
