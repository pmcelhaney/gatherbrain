# AGENTS.md

## Project Instructions

- Always commit after completing a slice of work.
- Keep `docs/spec.md` as the living product specification and update it when product decisions change.
- Keep `AGENTS.md` current when project workflow, architecture, or tooling conventions change.
- Build this application in Node.js.

## Engineering Notes

- Prefer small, focused slices with their own commits.
- Run `npm test` before committing each implementation slice.
- Keep architecture decisions documented before or alongside implementation.
- Treat facts, contexts, capture, transient search, selection commands, and tab completion as the core product concepts.
- Treat fact associations as part of the context model: a fact has one home context and may be gathered into additional contexts.
- Tags and time boxes are not active product concepts.
