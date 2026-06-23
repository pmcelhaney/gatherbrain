# gatherbrain

`gatherbrain` is a prompt-first second brain TUI. Type a fact, press Enter, and it writes the entry to a timestamped Markdown file in `notes/`.

The top of the screen shows the current context, existing notes in that context are listed below it, and the prompt stays on the bottom line.

Use `/s my-cool-project` to switch to a context. Subsequent notes are written to `notes/my-cool-project/`, and the folder is created if it does not exist. The `/s` command only switches context; it does not create a note. Press `Tab` after `/s` to complete existing context folders.

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
