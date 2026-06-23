# gatherbrain

`gatherbrain` is a prompt-first second brain app. Type a fact, press Enter, and it writes the entry to a timestamped Markdown file in `notes/`.

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
