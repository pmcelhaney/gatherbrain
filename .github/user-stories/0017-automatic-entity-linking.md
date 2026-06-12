# 0017 — Automatic Entity Linking

## Summary

As a user, I want the app to automatically detect and convert plain text references to existing entities into Markdown wikilinks so that I don't have to manually link every mention.

## Details

Implement `src/services/auto-linker.ts`.

### Goal

Given plain text and a list of known entities, replace occurrences of known entity titles and aliases with `[[Title]]` wikilinks.

### Algorithm

```ts
function autoLink(text: string, store: EntityStore): string;
```

**Rules:**

1. Build a lookup map from every known entity title and alias to its canonical entity title.
   - Keys are case-insensitive.
2. Find the longest match at each position (greedy longest match).
   - Example: if "Tech Assembly" and "Tech" are both entity titles, "Tech Assembly" wins.
3. Replace the matched text with `[[Canonical Title]]`.
   - Use the matched entity's `title` property as the canonical form.
4. **Do not** replace text that is already inside a wikilink (`[[...]]`).
5. **Do not** create duplicate links — if a title is already linked once in the same text, do not link subsequent occurrences (optional for MVP; log that this case is skipped).
6. **Ambiguity:** if a term matches multiple entities with equal ranking, do not link it. Leave it as plain text.

### Ranking (for disambiguation)

When multiple entities match the same term, rank by:
1. Entities related to the current entity (their ids appear in the current entity's frontmatter).
2. Entities whose title is an exact (not alias) match.
3. Most recently created.

If after ranking the top two candidates have equal score, leave the term unlinked.

### Usage

This function is called by the quick capture flow (story 0018) after the user presses Enter.

### Example

```
Input:  "Send John the Tech Assembly agenda"
Entities: John Smith (alias: John), Tech Assembly
Output: "Send [[John Smith]] the [[Tech Assembly]] agenda"
```

### Acceptance Criteria

- "John" matches entity with alias "John" → `[[John Smith]]`.
- "Tech Assembly" matches the full title, not just "Tech" if both exist.
- Text already inside `[[...]]` is not re-processed.
- An ambiguous match (two entities with the same alias, no ranking winner) is left unlinked.
- Unit tests cover: basic linking, longest match, already linked, ambiguity, case insensitivity.
