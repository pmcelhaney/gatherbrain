# Copilot Instructions

## Directory READMEs

Every directory in this repository must contain a `README.md` that lists and describes its files and subdirectories. When creating a new directory, always add a `README.md` to it. When adding a new file to an existing directory, update that directory's `README.md` to include the new file.

Format:

```markdown
# path/to/dir

One-sentence summary of the directory's purpose.

## Files

- **`filename.ts`** — What the file does.

## Subdirectories   ← omit section if there are no subdirectories

- **`subdir/`** — What the subdirectory contains.
```

## Tests

All test files live in the `tests/` directory at the repository root, mirroring the subdirectory structure of `src/`. Test files are named `<module>.test.ts` and placed in `tests/<subdir>/` to match `src/<subdir>/<module>.ts`. Do not place test files inside `src/`.
