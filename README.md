# Gatherbrain

Gatherbrain is a local-first terminal app for keeping track of work when the
work itself is scattered. It was created for enterprise architecture: moving
between projects, meetings, people, and decisions while tasks live across
email, PowerPoint, Excel, and Miro.

Instead of asking you to hold all of that in working memory, Gatherbrain lets
you quickly capture small pieces of information as **facts**, organize them by
the **context** you are currently working in, and bring them back with
keyboard-first search and selection commands. The data is stored as plain
Markdown files in a local workspace.

It is an installable work in progress, not a finished product. It may also be
of interest to people exploring human-computer interaction, keyboard-efficient
input, and tools that offload working memory.

## The Idea

At any moment, you work in a context: a person, meeting, project, or topic.
Capture a fact in that context with plain text, then search for it or associate
it with other contexts later—without duplicating it or losing its original
home.

```text
@Architecture Review Board!
Ask whether the reference architecture needs an exception process.
```

Later, search and act without leaving the keyboard:

```text
/exception process
. task tomorrow
```

Contexts, facts, transient search, selection commands, and tab completion are
the core interaction model. Read the [usage guide](docs/usage.md) for the
complete command reference and examples.

## Try It

Requirements: Node.js 20 or newer.

```bash
npm start
```

Run that from a local clone of this repository.

Gatherbrain has no external npm dependencies. By default, it keeps your local
data in `./workspace`, which is ignored by Git. To store it elsewhere:

```bash
GATHERBRAIN_WORKSPACE=/path/to/workspace npm start
```

Create or enter a context with `@<context>!`, write a fact, and use `:help`
inside the app whenever you need a reminder.

## Project Status and Provenance

Gatherbrain is actively exploratory. The current terminal interface supports
context switching, capture, search, fact associations, selection actions,
undo, paste, configuration, and Markdown-based storage. A browser-style
full-screen navigation model has not been built yet.

This project was built through an AI-assisted, "vibe-coded" process. Its
behavior is protected by deterministic automated tests, developed alongside the
application. See the [development notes](docs/development.md) if you want to
run or contribute to it.

## Documentation

- [Usage guide](docs/usage.md): commands, configuration, storage, and current limitations
- [Core interaction specification](docs/spec.md): product model and design decisions
- [Core class sketch](docs/core-classes.md): implementation-oriented class overview
- [Development notes](docs/development.md): tests, smoke rendering, and contributor workflow
