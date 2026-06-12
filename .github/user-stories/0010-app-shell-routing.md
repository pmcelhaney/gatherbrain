# 0010 — App Shell and Client-Side Routing

## Summary

As a user, I want a single-page app shell that renders entity pages by URL so that I can navigate between entities.

## Details

Implement the top-level app shell in `src/main.ts` and `src/app.ts`. The app uses hash-based routing for simplicity (`#/entity/{id}`).

### URL Scheme

| URL | View |
|-----|------|
| `#/` | Home / vault selector |
| `#/entity/{id}` | Entity page for the given id |

### App Shell Requirements

- `src/app.ts` exports an `App` class that:
  - Holds references to `VaultService`, `EntityStore`, `SchemaRegistry`, `QueryEngine`.
  - Has a `boot()` method that:
    1. Attempts to restore the vault (story 0002).
    2. If vault is available, loads schemas (story 0005) and all entities (story 0007).
    3. Registers all custom elements (later stories).
    4. Renders the current route.
  - Listens to `hashchange` events and re-renders on navigation.
- The app renders into a `<div id="app">` in `index.html`.
- When no vault is loaded, render the vault selection screen (story 0002).
- When a vault is loaded and the route is `#/entity/{id}`:
  - Look up the entity by id.
  - Look up its schema.
  - Parse the schema's `fullPageTemplate` HTML.
  - Inject the template into the app container.
  - Inject the `EntityContext` into all custom elements (story 0011).
- If the entity is not found, show a "Not found" message with the id.

### Navigation Helper

```ts
function navigateTo(id: string): void;
// Sets window.location.hash to #/entity/{id}
```

Export this from `src/services/router.ts`.

### Acceptance Criteria

- Navigating to `#/entity/person_John_Smith` renders the person schema's `fullPageTemplate`.
- Navigating to an unknown id shows a "Not found" message.
- On vault load, the app automatically navigates to `#/` and shows the vault selector if no vault is persisted.
- After boot with a persisted vault, navigating to a valid entity URL renders the page.
- `hashchange` causes the app to re-render the new entity without a full page reload.
