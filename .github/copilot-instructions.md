# Copilot Instructions for `pmcelhaney/gatherbrain`

This repository contains GatherBrain, a local-first second brain web app that runs entirely in the browser using the File System Access API.

## Mission

Implement features **one user story at a time**. Keep each change focused to a single story or coherent slice of behavior.

## User stories

User stories live in `github/user-stories/`. Each file describes a feature, its requirements, and acceptance criteria. Stories provide useful context even after they are implemented — **do not delete story files**.

## Required workflow

1. **Pick a small scope**
   - Work on one story per iteration.
   - Do not mix unrelated features in the same change.

2. **Use TDD**
   - Start by writing or updating tests that describe expected behavior.
   - Tests must fail before implementation and pass after.

3. **Implement in small steps**
   - Keep code changes focused on the story being implemented.
   - Prefer clean, readable TypeScript over clever optimizations.

4. **Run CI checks locally before pushing**
   - `npm run lint` — ESLint
   - `npm run build` — TypeScript + Vite production build
   - `npm test` — Vitest

## Manual acceptance tests

Every PR description must include a section titled exactly `## Manual acceptance tests` with 3–6 checkboxes. Each checkbox must describe an observable behavior (not an implementation detail). When creating the PR, leave all boxes unchecked — the reviewer checks each one after manually verifying the behavior. All boxes must be checked before the PR can be merged.

- Cover the main success path, at least one edge case, and one regression check where applicable.
- Exception: if a PR only adds files under `github/` or `.github/`, this section may be omitted.

## Quality bar for every change

- Tests fail first, then pass after implementation.
- `npm run build` produces no TypeScript errors.
- `npm run lint` passes with no errors.
- Scope remains limited to one story per iteration.
