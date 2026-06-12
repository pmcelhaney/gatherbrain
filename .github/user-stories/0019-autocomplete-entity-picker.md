# 0019 — Autocomplete Service and `<entity-picker>` Element

## Summary

As a user, I want the quick capture input and relation fields to suggest matching entities as I type so that I can reference entities without remembering exact names.

## Details

### Autocomplete Service

File: `src/services/autocomplete.ts`

```ts
interface AutocompleteSuggestion {
  entity: Entity;
  matchedTerm: string;    // the text that was matched (title or alias)
  score: number;          // higher is better
}

class AutocompleteService {
  constructor(store: EntityStore) {}

  suggest(
    query: string,
    options?: {
      schema?: string;         // restrict to a specific schema
      contextEntityId?: string; // boost entities related to this entity
      limit?: number;           // default: 10
    }
  ): AutocompleteSuggestion[];
}
```

**Matching:**
- Search entity titles and aliases.
- Case-insensitive substring match on the last "word token" in the query.
  - Token: the portion of the query after the last space (or the full query if no spaces).
  - Example: query "Send St" → token "St" → matches "John **St**ory", "**St**ephen", aliases "**St**mitty".
- Match against all entities in the store.

**Scoring (higher = better):**
1. Exact prefix match on title (e.g., "St" is a prefix of "Stephen") → +10
2. Exact prefix match on alias → +8
3. Substring match on title → +5
4. Substring match on alias → +3
5. Entity is related to `contextEntityId` (appears in its frontmatter) → +5
6. Entity was recently created (within last 7 days) → +2
7. Tie-break: alphabetical by title.

**Insertion text:**

When the user selects a suggestion, the calling component inserts `[[{entity.title}]]` in place of the current token.

---

### `<entity-picker>` Element

File: `src/elements/entity-picker.ts`

A standalone search-and-select element used in `<entity-relation-list>` and other places.

**Attributes:**
- `schema` (optional) — restrict suggestions to a specific schema.
- `multiple` (boolean) — allow selecting multiple entities (for relation-list).
- `placeholder` — input placeholder text (default: "Search entities…").

**Behavior:**
- Renders a text input.
- As the user types, calls `context.autocomplete.suggest(value, { schema })` and displays a dropdown of results.
- Each dropdown item renders the entity's `pickerTemplate` (or default: entity title).
- Clicking/selecting an item dispatches a `entity-selected` custom event with `detail: { entity: Entity }`.
- Pressing Escape closes the dropdown without selection.

**HTML usage:**
```html
<entity-picker schema="person" placeholder="Add attendee…"></entity-picker>
```

---

### Quick Capture Autocomplete Integration

Update `<quick-capture>` (story 0018) to use the autocomplete service:
- As the user types, detect the current token (text after last space).
- If `suggest(token)` returns results, show a dropdown above/below the input.
- Arrow keys navigate the dropdown; Enter or Tab selects a suggestion.
- Selecting inserts `[[Title]]` replacing the current token.

### Acceptance Criteria

- Typing "St" in quick capture shows a suggestion for "John Smith" (alias: "Smitty") but NOT unrelated entities.
- Selecting "John Smith" inserts `[[John Smith]]`.
- Pressing Escape dismisses the dropdown without inserting.
- `<entity-picker schema="person">` only suggests person entities.
- Score ranking puts exact-prefix matches above substring matches.
