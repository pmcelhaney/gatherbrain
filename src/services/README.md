# src/services

Application-level services.

## Files

- **`router.ts`** — Hash-based client-side router. `navigateTo(id)` sets `window.location.hash`. `parseRoute(hash)` decodes the hash and returns a typed route object (`{ view: 'home' }` or `{ view: 'entity'; id: string }`). Also exports the `Router` interface used for dependency injection.
