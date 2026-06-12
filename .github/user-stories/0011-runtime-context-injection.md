# 0011 — Runtime Context Injection

## Summary

As a developer, I want the app to inject a shared runtime context into all custom elements on a page so that elements can access data and services without receiving them as HTML attributes.

## Details

After rendering a schema's `fullPageTemplate` into the DOM, the app must inject a typed `EntityContext` object into every custom element in the rendered tree.

### Context Type

```ts
interface EntityContext {
  entity: Entity;           // the current entity being viewed
  schema: Schema;           // the current entity's schema
  store: EntityStore;       // read/write access to all entities
  schemas: SchemaRegistry;  // look up any schema
  query: QueryEngine;       // run queries
  router: Router;           // navigate programmatically
  updateEntity: (id: string, patch: Record<string, unknown>) => Promise<void>;
  autocomplete: AutocompleteService;  // story 0021
}
```

### Injection Mechanism

- Define a `CONTEXT_KEY = Symbol('entityContext')` in `src/elements/context.ts`.
- After inserting a template into the DOM, call:
  ```ts
  function injectContext(root: Element, context: EntityContext): void;
  ```
  This walks all descendants of `root`, and for any element that has a `receiveContext` method, calls `element.receiveContext(context)`.
- Custom elements should implement a `receiveContext(ctx: EntityContext): void` method rather than reading context from attributes.
- Elements may store the context locally and re-render when it is received.

### Base Class

Provide a `BaseElement` class in `src/elements/base-element.ts` that:
- Extends `HTMLElement`.
- Has a `protected context: EntityContext | null = null` field.
- Implements `receiveContext(ctx: EntityContext): void` which sets `this.context = ctx` and calls `this.onContextReady()`.
- Has an empty `onContextReady(): void` method that subclasses override to perform rendering.

All custom elements defined in subsequent stories should extend `BaseElement`.

### Acceptance Criteria

- After `injectContext(root, ctx)` is called, all custom elements within `root` have their context set.
- Elements that have not yet received context do not throw errors — they render empty or show a loading state.
- `BaseElement.onContextReady()` is called exactly once after context is injected.
- Elements added to the DOM after initial injection (e.g., via `<entity-query>` rendering results) also receive context when `injectContext` is called on the new subtree.
