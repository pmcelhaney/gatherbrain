# gatherbrain

`gatherbrain` is a prompt-first second brain TUI. Type a fact title, press Enter, and it writes the entry to a slug-named Markdown file in the current context.

The app is launched with a workspace root. The root directory and every non-hidden subdirectory are contexts. Hidden directories, including `.trash` and `.gatherbrain`, are ignored.

The workspace is loaded into an in-memory model at startup. Visible workspace directories are watched while the TUI is running, so external Markdown edits and newly created contexts are reflected in the model without restarting the app. Workspace configuration in `.gatherbrain` is also watched, so command, lens, enum, and template changes are reloaded while the app runs.

The top of the screen shows the current context, existing facts in that context and its subcontexts are listed below it, and the prompt stays on the bottom line.

When facts do not fit on one screen, complete items are paged with an ellipsis. Use `Page Up` and `Page Down` to move between pages.

Commands use colon-prefixed names. Press `Tab` after `:` to complete command names. If a command is missing an argument, the prompt asks for the next argument.

Use `:switch my-cool-project` to switch to a context. If the context does not exist, the app asks whether to create it. Subsequent facts are written to that directory.

The `:switch` command also accepts Unix-style context paths: `./foo` is a child of the current context, `/foo` is under the workspace root, `../` is the parent, and `../foo` is a sibling.

Use `:peek people/alex` to peek at another context while staying in the current context. New facts are still written to the current context and get `relatedContexts` pointing at the peek context. The peeked context has its own lens, so changing lenses while peeking does not change the current context's lens. Use `:clear-peek` to clear peek.

Use `:lens todo` to switch to the todo lens, which only shows facts with type `todo`, `waiting`, `in progress`, or `fact` (the default type). Use `:lens all` to show every fact again.

Use `:lens due` to show facts with a `due` date that are not `done`. Use `:lens today` to show not-done facts due on or before today. Use `:lens current` to show the today lens plus `done` facts last modified today.

Use `:new Follow up with Alex` to create a new fact. Typing a title without a colon also creates a fact.

Use `:edit 3` to open the third listed fact in `$EDITOR`.

Use `:open` to open the current context directory in the system file viewer. Use `:open 3` to open the file referenced by the third listed fact's `file` front matter property.

Use `:delete 3` to move the third listed fact to `.trash` inside its context directory.

Use `:relate 3 people/alex` to add a workspace-relative context path to the third listed fact's reserved `relatedContexts` front matter field.

Use `:type task 3` to change the third listed fact's front matter type to `task`. The type name can be any letter-starting word with letters, numbers, `_`, or `-`; enum-listed values can also include spaces, such as `in progress`.

Use `:due today 3` to set the third listed fact's `due` front matter property to a normalized date such as `2026-06-24`.

Use `:paste` to name and save the current clipboard contents to a `.txt` file in the current context. Press Enter to accept the default `Pasted <timestamp>` name, or pass a name inline with `:paste My pasted item`. The companion fact's `file` front matter property points to the pasted file. On macOS, image clipboard contents such as screenshots are saved as `.png` files and embedded in the companion Markdown fact.

Use `:debug-keys` to toggle key debugging output.

Use `:restart` to restart the app process and restore the current context, peek, lens, lens history, and page position.

Default commands are defined in `default-config/commands.json`. A workspace-local `.gatherbrain/commands.json` can add commands or override defaults with the same command name. See [Custom Commands](docs/custom-commands.md).

Command enum arguments can use workspace-local `.gatherbrain/enums.json` value lists. See [Custom Enums](docs/custom-enums.md).

Default lenses are defined in `default-config/lenses.json`. A workspace-local `.gatherbrain/lenses.json` can add lenses or override defaults with the same lens id. See [Custom Lenses](docs/custom-lenses.md).

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
