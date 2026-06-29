# Usage

Run the app with a workspace root:

```sh
npm start -- /path/to/workspace
```

Use `:q`, `:quit`, `:exit`, or `Ctrl+C` to leave the prompt.

## Workspace Model

The root directory and every non-hidden subdirectory are contexts. Hidden directories, including `.trash`, `.gatherbrain`, and any directory whose name starts with `.`, are ignored by the model.

Each context can include an optional reserved `index.md` file for context metadata. The app loads that file onto the context and does not show it as a normal fact.

At startup, the workspace is loaded into an in-memory model. Visible workspace directories are watched while the TUI is running, so external Markdown edits and newly created contexts are reflected without restarting the app. Workspace configuration in `.gatherbrain` is also watched, so command, enum, lens, settings, and template changes can be picked up while the app runs.

The screen has:

- a header showing the current context, active peek, and active lens,
- a body rendered from the active lens,
- a prompt on the bottom line.

Facts are sorted newest-created first by default. Visible item numbers are stable until you switch contexts, so deleting or moving an item does not renumber the remaining visible facts in the current session.

When facts do not fit on one screen, complete items are paged with an ellipsis. Use `Page Up` and `Page Down` to move between pages.

## Capturing Facts

Typing text without a leading colon creates a fact in the current context:

```text
Follow up with @Alex about the prototype
```

The saved fact gets:

- a front matter UUID,
- a plain-text title preview capped at 80 characters,
- the full captured text in the Markdown body,
- Markdown links in the body for matching `@context` references,
- `type: fact` unless a type is supplied.

Use `:new` when you want the same behavior through an explicit command:

```text
:new Follow up with @Alex about the prototype
```

If you type only `:new`, the app prompts for the fact text.

Add ` -- ` after the fact text to apply the same metadata shorthand used for visible items. Metadata can include one fact type, one due date, and `/context` relations:

```text
Follow up with Alex -- todo tomorrow /people/alex
Ask Jordan for a decision -- waiting friday /projects/gatherbrain
```

## Command Mode

Commands use colon-prefixed names:

```text
:switch projects/gatherbrain
```

Press `Tab` after `:` to complete command names. Completion is case-insensitive.

If a command is missing an argument, the prompt asks for the next argument. Fact arguments can be visible item numbers or visible fact titles. Press `Tab` while entering a fact title to complete by title.

For example, these can both edit the same visible fact:

```text
:edit 3
:edit Feed the cat
```

## Contexts

Use `:switch` to change context:

```text
:switch projects/gatherbrain
```

If the context does not exist, the app asks whether to create it. Subsequent facts are written to that directory.

`:switch` accepts Unix-style context paths:

- `./foo` is a child of the current context.
- `/foo` is under the workspace root.
- `../` is the parent.
- `../foo` is a sibling.

Switching context clears peek.

## Peek

Use `:peek` to look at another context while staying in the current context:

```text
:peek people/alex
```

New facts are still written to the current context and get `relatedContexts` pointing at the peek context. The peeked context has its own lens, so changing lenses while peeking does not change the current context's lens.

Use `:clear-peek` to clear peek.

## Lenses

Use `:lens` to change the active lens:

```text
:lens today
```

Built-in lenses:

- `all`: show all visible facts.
- `todo`: show facts whose type is `fact`, `todo`, `waiting`, or `in progress`.
- `due`: show facts with a `due` date that are not `done`.
- `today`: show not-done facts due on or before today.
- `current`: show the `today` lens plus `done` facts last modified today.

When peek is active, `:lens` changes the peek lens. The current context keeps its own lens state.

## Editing And Opening

Use `:edit` to open a visible fact in `$EDITOR`:

```text
:edit 3
```

Use `:open` without an item to open the current context directory in the system file viewer:

```text
:open
```

Use `:open <item>` to open the file referenced by that fact's `file` front matter property:

```text
:open 3
```

## Moving, Deleting, And Relating

Use `:delete` to move a fact to `.trash` inside its context directory:

```text
:delete 3
```

Use `:move` to move a fact to another context:

```text
:move 3 /projects/gatherbrain
```

Moving a fact also adds a `relatedContexts` relation to the context it came from. If the destination already has a file with the same name, the moved file gets a numeric suffix instead of overwriting the existing file.

Add `/context` in item update shorthand to add a context relation without moving the file:

```text
3 /people/alex
```

Relations are stored in the reserved `relatedContexts` front matter field.

## Types And Dates

Use item update shorthand to change a fact's front matter type:

```text
3 done
```

Use item update shorthand to set the `due` front matter property:

```text
3 today
```

Date arguments are normalized to `YYYY-MM-DD`.

Date arguments understand:

- `today`, `tomorrow`, and `yesterday`
- `in 2 days` and `in 2 weeks`
- weekdays such as `friday` and `next monday`
- `YYYY-MM-DD`
- `M/D/YYYY` and `M/D/YY`

## Paste

Use `:paste` to name and save the current clipboard contents to a file in the current context:

```text
:paste
```

Press Enter to accept the default `Pasted <timestamp>` name, or pass a name inline:

```text
:paste Screenshot of launch issue
```

The chosen name is used for the pasted file and its companion fact. The companion fact's `file` front matter property points to the pasted file.

On macOS, image clipboard contents such as screenshots are saved as `.png` files and embedded in the companion Markdown fact.

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

Use `:plan` without arguments to show the current day's planner timeline:

```text
:plan
```

The planner defaults to showing the workday from `08:00` through `18:00`. If a day has timeboxes outside that window, the visible timeline expands to include them.

The planner renders resolved blocks as a small colorized timeline:

- `●` marks scheduled context blocks.
- `○` marks free blocks.
- `▶ now` marks the current time, attached to the timeline.

Each block shows its display time, context or `free`, and duration:

```text
   9:00  ●  /deep-work · 2h
  11:00  ○  free · 30m
  11:30  ●  /team-standup · 30m
         ▶ now 11:47
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

If the planned context does not exist, the app asks whether to create it before adding the timebox.

Use `:cancel <time-or-range> <context>` to remove stored rows matching both the time and context:

```text
:cancel 11 /arb/meetings/2026-06-29
:cancel 11-11:30 /arb/meetings/2026-06-29
```

If multiple rows match, the app prompts you to choose one. The fallback root context `/` is never stored, so it cannot be cancelled.

Use `:now` to switch to the context that owns the present local time. If no timebox matches, `:now` switches to `/`.

## Event Logs

Actions that change state, change view, or invoke external tools are logged under `.gatherbrain/events/`, one TSV file per day:

```text
.gatherbrain/events/2026-06-27.tsv
```

Each row contains:

```text
timestamp<TAB>event<TAB>json-metadata
```

These logs are intentionally simple. They are useful for debugging, auditing changes, and future analysis by scripts or LLM tools.

## Debugging And Restarting


Use `:restart` to restart the app process and restore the current context, peek, lens, lens history, and page position.

This is useful when using the app while actively developing it.

## Configuration

Default configuration lives in `default-config/`. Workspace-local configuration lives under `.gatherbrain/` in the workspace root and overrides or extends defaults.

- Commands: `default-config/commands.json` and `.gatherbrain/commands.json`
- Enums: `default-config/enums.json` and `.gatherbrain/enums.json`
- Lenses: `default-config/lenses.json` and `.gatherbrain/lenses.json`
- Settings: `default-config/settings.json` and `.gatherbrain/settings.json`
- Templates: `default-config/templates/*.hbs` and `.gatherbrain/templates/*.hbs`

Workspace settings currently include the planner workday:

```json
{
  "settings": {
    "workday": {
      "start": "09:00",
      "end": "17:00"
    }
  }
}
```

See also:

- [Custom Commands](custom-commands.md)
- [Custom Enums](custom-enums.md)
- [Custom Lenses](custom-lenses.md)
