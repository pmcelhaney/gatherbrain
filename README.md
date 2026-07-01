# Gatherbrain

Gatherbrain is a local-first terminal app for capturing small facts while you
work. The app is built in Node.js and stores data as plain text files in a
workspace directory.

This repository is a clean rebuild of Gatherbrain around the living
specification in [docs/spec.md](docs/spec.md).

## Current Status

The app currently supports:

- A persistent terminal screen with a header, fact body, and prompt.
- Session switching with `:switch <session>`.
- Session discovery with `:sessions`.
- Numbered session navigation with `:session <number>`.
- Capturing facts into the current session.
- Searching persisted facts with `/...` queries and shortcuts.
- Fact inspection with `:inspect <number>`.
- Selection actions such as `. tomorrow`, `. todo`, `. gather`, `. open`, and `. delete`.
- Undo for the last selection action with `:undo`.
- Planning time boxes with `; 9-10 Steve`.
- Updating and deleting time boxes with `:timebox`.
- Pasting clipboard text or screenshots into the current session with `:paste`.
- Live mode, plan, and completion feedback while typing in the TUI.
- Config loading from `gatherbrain.config.json`.
- Markdown fact storage and daily text-file timebox storage.

Not implemented yet:

- A full-screen browser-style navigation model.

## Requirements

- Node.js 20 or newer.

## Install

This project currently has no external npm dependencies.

```bash
npm test
```

## Run

```bash
npm start
```

By default, Gatherbrain stores local app data in:

```text
./workspace
```

To use a different workspace:

```bash
GATHERBRAIN_WORKSPACE=/path/to/workspace npm start
```

For a non-interactive smoke render:

```bash
npm start -- --render-once
```

## Basic Workflow

Start by switching to a session:

```text
:switch Thinking about Gatherbrain design
```

Capture a fact by typing plain text:

```text
Search shortcuts should work like //current.
```

Search facts:

```text
/ 
/Search shortcuts
/session:"Thinking about Gatherbrain design"
/session:Thinking about Gatherbrain design
/@Thinking about Gatherbrain design
/type:todo
/due:today
//current
```

`/` by itself refreshes the current query, uses the current session query, or
lists all facts if no query exists.

Operate on visible facts:

```text
. todo
. inprogress
. tomorrow
. open
1 delete
.. gather
```

Plan time:

```text
; 9-10 Thinking about Gatherbrain design
; tomorrow 14:30-15:00 Reading
```

Edit planned time:

```text
:timebox 1 10-11 Architecture Review Board
:timebox delete 1
```

Exit:

```text
:exit
```

or:

```text
:quit
```

## Documentation

- [Usage guide](docs/usage.md)
- [Core interaction specification](docs/spec.md)
- [Core class sketch](docs/core-classes.md)

## Configuration

Gatherbrain loads `gatherbrain.config.json` from the current working directory
when the app starts. User settings merge over the built-in defaults.

```json
{
  "defaultFactType": "note",
  "selectionActions": {
    "actions": {
      "idea": { "action": "set_type", "value": "idea" }
    }
  }
}
```

See [gatherbrain.config.example.json](gatherbrain.config.example.json) for a
complete starter file.

## Development

Run the full test suite:

```bash
npm test
```

The project uses small committed slices. See [AGENTS.md](AGENTS.md) for workflow
notes.
