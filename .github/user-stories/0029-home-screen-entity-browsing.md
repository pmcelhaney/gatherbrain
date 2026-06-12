# 0029 — Home Screen and Entity Browsing

## Summary

As a user, I want a home screen that lets me browse entities by type so that I can navigate to any entity even without knowing its direct URL.

## Details

When the app is loaded with a vault and the route is `#/` (or just `#`), render a home screen instead of "not found."

### Home Screen Layout

```
[Vault Name]

Recent Entities              [last 10 modified entities, any schema]

By Type
  People          [count]
  Meetings        [count]
  Topics          [count]
  Next Actions    [count]
  Decisions       [count]
  Open Questions  [count]
  Captured Notes  [count]
```

Clicking a type header (e.g., "Meetings") expands a list of entities of that type, sorted by title, each linking to `#/entity/{id}`.

### Requirements

- Implement a `HomeView` component in `src/views/home-view.ts`.
- Display the vault name in the heading.
- "Recent Entities" shows the 10 most recently modified entities (by file modification time or `created` frontmatter, whichever is available).
- Each entity type section is collapsed by default and expands on click.
- Each entity in the list shows: title and schema type.
- Clicking an entity title navigates to its page.
- Include a search input at the top:
  - As the user types, filter the entity lists by title/alias match.
  - Works across all schemas simultaneously.

### Acceptance Criteria

- Home screen shows vault name and type-grouped entity list.
- Clicking "Meetings" shows all meeting entities.
- Clicking a meeting title navigates to the meeting page.
- Searching "Tech" filters to entities whose title or alias contains "tech".
- After adding a new entity via quick capture, the home screen entity count updates.
