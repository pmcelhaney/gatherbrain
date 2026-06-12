# 0003 — Markdown and YAML Frontmatter Parsing

## Summary

As a developer, I want a utility that parses Markdown files with YAML frontmatter so that entity files can be read into structured objects.

## Details

Implement a parser module at `src/store/parser.ts` that reads raw Markdown file content and returns a structured object.

### File Format

Entity files look like this:

```markdown
---
id: entity_abc123
schema: next-action
title: Send John the Tech Assembly agenda
created: 2026-06-12T09:15:00
source: "[[EA Core Weekly]]"
references:
  - "[[John Smith]]"
  - "[[Tech Assembly]]"
status: open
---

Send [[John Smith]] the [[Tech Assembly]] agenda
```

### Requirements

- Use the `gray-matter` library to split frontmatter from body.
- Use the `js-yaml` library (included by gray-matter) for YAML parsing.
- Export the following from `src/store/parser.ts`:

```ts
interface ParsedFile {
  frontmatter: Record<string, unknown>;
  body: string;
}

function parseEntityFile(content: string): ParsedFile;
function serializeEntityFile(frontmatter: Record<string, unknown>, body: string): string;
```

- `parseEntityFile` should return the raw frontmatter object and the body string.
- `serializeEntityFile` should produce a valid Markdown file with `---` delimited frontmatter followed by the body.
- Preserve the body as-is (do not process Markdown links at this layer).
- Handle files with no frontmatter gracefully (return empty frontmatter object).
- Handle files with no body gracefully (return empty string for body).

### Acceptance Criteria

- Parsing a valid entity file returns the correct frontmatter object and body string.
- Serializing a frontmatter object and body produces a round-trippable file (parse → serialize → parse yields the same data).
- Files with missing frontmatter or body do not throw errors.
- Unit tests cover: valid file, no frontmatter, no body, round-trip.
