# 0021 — Entity Navigation

## Summary

As a user, I want to click any entity link on a page and be taken to that entity's page so that I can navigate the knowledge graph naturally.

## Details

Entity links appear in multiple places:
- Wikilinks in rendered Markdown (`<entity-markdown>` renders them as `<a>` tags).
- Titles in `<entity-relation-list>` items.
- Titles in `<entity-query>` results.
- Titles in `<entity-related-notes>` results.

### Requirements

**Link format:** All entity links use hash-based URLs: `#/entity/{id}`.

**Click handling:**

- Rendered wikilinks (`<a href="#/entity/{id}">`) should be handled by the native browser anchor behavior — since the app uses hash routing (story 0010), clicking these links will fire a `hashchange` event and the app will render the new entity. No special handling is needed beyond what story 0010 provides.

**Back navigation:**

- The `<entity-page>` element should render a Back button.
- The browser's native back/forward buttons should work correctly since we are using hash URLs.
- Implement `router.back()` as `window.history.back()`.

**Keyboard accessibility:**

- All entity links must be focusable and activatable via keyboard (this is native for `<a>` elements).

**Router service** (`src/services/router.ts`):

```ts
class Router {
  navigateTo(entityId: string): void;  // sets window.location.hash
  back(): void;                        // calls window.history.back()
  getCurrentEntityId(): string | null; // parses hash to extract entity id
}
```

**Global link delegation:**

Add a single `click` listener on `document` that intercepts clicks on `<a>` elements with `data-entity-id` attributes and calls `router.navigateTo(entityId)` rather than following the href. This ensures navigation is handled consistently.

### Acceptance Criteria

- Clicking `[[John Smith]]` in rendered Markdown opens John Smith's entity page.
- Clicking a title in an `<entity-relation-list>` navigates to that entity's page.
- The browser back button returns to the previously viewed entity.
- Navigation does not cause a full page reload.
- Navigating to an entity that doesn't exist in the store shows a "Not found" message.
