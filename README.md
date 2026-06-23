# gatherbrain

`gatherbrain` is a prompt-first second brain TUI. Type a fact, press Enter, and it writes the entry to a timestamped Markdown file in `notes/`.

The top of the screen shows the current context, existing notes in that context and its subcontexts are listed below it, and the prompt stays on the bottom line.

When notes do not fit on one screen, complete items are paged with an ellipsis. Use `Page Up` and `Page Down` to move between pages.

Use `/s my-cool-project` to switch to a context. Subsequent notes are written to `notes/my-cool-project/`, and the folder is created if it does not exist. The `/s` command only switches context; it does not create a note. Press `Tab` after `/s` to complete existing context folders.

Use `/l todo` to switch to the todo lens, which only shows notes with type `todo`, `waiting`, `in progress`, or `fact` (the default type). Use `/l all` to show every note again.

Use `/e 3` to open the third listed note in `$EDITOR`.

Use `:task 3` to change the third listed note's front matter type to `task`. The type name can be any letter-starting word with letters, numbers, `_`, or `-`.

Each saved file uses this front matter:

```markdown
---
type: fact
---
```

## Run

```sh
npm start
```

Use `:q`, `:quit`, `:exit`, or `Ctrl+C` to leave the prompt.

## Test

```sh
npm test
```
