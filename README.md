# gatherbrain

`gatherbrain` is a prompt-first second brain TUI. Type a fact title, press Enter, and it writes the entry to a slug-named Markdown file in the current context.

The app is launched with a workspace root. The root directory and every non-hidden subdirectory are contexts. Hidden directories, including `.trash` and `.gatherbrain`, are ignored.

The top of the screen shows the current context, existing facts in that context and its subcontexts are listed below it, and the prompt stays on the bottom line.

When notes do not fit on one screen, complete items are paged with an ellipsis. Use `Page Up` and `Page Down` to move between pages.

Use `/s my-cool-project` to switch to an existing context. Subsequent facts are written to that directory. Press `Tab` after `/s` to complete existing context folders.

Use `/l todo` to switch to the todo lens, which only shows notes with type `todo`, `waiting`, `in progress`, or `fact` (the default type). Use `/l all` to show every note again.

Use `/e 3` to open the third listed fact in `$EDITOR`.

Use `/d 3` to move the third listed fact to `.trash` inside its context directory.

Use `/r 3 people/alex` to add a workspace-relative context path to the third listed fact's reserved `relatedContexts` front matter field.

Use `:task 3` to change the third listed fact's front matter type to `task`. The type name can be any letter-starting word with letters, numbers, `_`, or `-`.

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
