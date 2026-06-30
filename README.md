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
- Capturing facts into the current session.
- Searching persisted facts with `/...` queries.
- Selection actions such as `. tomorrow`, `. todo`, `. gather`, and `. delete`.
- Planning time boxes with `; 9-10 Steve`.
- Markdown fact storage and daily text-file timebox storage.

Not implemented yet:

- Paste/import mode after `:paste`.
- Command or session completion.
- Live plan preview while typing.
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
/Search shortcuts
/session:"Thinking about Gatherbrain design"
/type:todo
/due:today
```

Operate on visible facts:

```text
. todo
. tomorrow
1 delete
.. gather
```

Plan time:

```text
; 9-10 Thinking about Gatherbrain design
; tomorrow 14:30-15:00 Reading
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

## Development

Run the full test suite:

```bash
npm test
```

The project uses small committed slices. See [AGENTS.md](AGENTS.md) for workflow
notes.
