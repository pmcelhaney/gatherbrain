# gatherbrain

`gatherbrain` is a prompt-first second brain TUI. Type a fact title, press Enter, and it writes the entry to a slug-named Markdown file in the current context.

The app is launched with a workspace root. The root directory and every non-hidden subdirectory are contexts. Hidden directories, including `.trash` and `.gatherbrain`, are ignored.

The top of the screen shows the current context, existing facts in that context and its subcontexts are listed below it, and the prompt stays on the bottom line.

When facts do not fit on one screen, complete items are paged with an ellipsis. Use `Page Up` and `Page Down` to move between pages.

Commands use colon-prefixed names. Press `Tab` after `:` to complete command names. If a command is missing an argument, the prompt asks for the next argument.

Use `:switch my-cool-project` to switch to an existing context. Subsequent facts are written to that directory.

Use `:gaze people/alex` to gaze at another context while staying in the current context. New facts are still written to the current context and get `relatedContexts` pointing at the gaze context. Use `:clear-gaze` to clear gaze.

Use `:lens todo` to switch to the todo lens, which only shows facts with type `todo`, `waiting`, `in progress`, or `fact` (the default type). Use `:lens all` to show every fact again.

Use `:edit 3` to open the third listed fact in `$EDITOR`.

Use `:delete 3` to move the third listed fact to `.trash` inside its context directory.

Use `:relate 3 people/alex` to add a workspace-relative context path to the third listed fact's reserved `relatedContexts` front matter field.

Use `:type task 3` to change the third listed fact's front matter type to `task`. The type name can be any letter-starting word with letters, numbers, `_`, or `-`.

Default commands are defined in `default-config/commands.json`. A workspace-local `.gatherbrain/commands.json` can add commands or override defaults with the same command name. See [Custom Commands](docs/custom-commands.md).

The older slash shortcuts still work:

Use `/s my-cool-project` to switch to an existing context. Subsequent facts are written to that directory. Press `Tab` after `/s` to complete existing context folders.

Use `/g people/alex` to gaze at another context while staying in the current context. New facts are still written to the current context and get `relatedContexts` pointing at the gaze context. Use `/g` to clear gaze.

Use `/l todo` to switch to the todo lens, which only shows facts with type `todo`, `waiting`, `in progress`, or `fact` (the default type). Use `/l all` to show every fact again.

Use `/e 3` to open the third listed fact in `$EDITOR`.

Use `/d 3` to move the third listed fact to `.trash` inside its context directory.

Use `/r 3 people/alex` to add a workspace-relative context path to the third listed fact's reserved `relatedContexts` front matter field.

Each saved file uses this front matter:

```markdown
---
title: Example fact
type: fact
---
```

## Run

```sh
npm start -- /path/to/workspace
```

Use `:q`, `:quit`, `:exit`, or `Ctrl+C` to leave the prompt.

## Test

```sh
npm test
```
