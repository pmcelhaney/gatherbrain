# src/elements

Custom HTML element infrastructure for the GatherBrain UI.

## Files

- **`base-element.ts`** — `BaseElement` extends `HTMLElement`. Stores the injected `EntityContext` and calls `onContextReady()` when context arrives. All future custom elements should extend this class.
- **`context.ts`** — Defines the `EntityContext` interface (entity, schema, store, schemas, query, router, updateEntity, autocomplete) and the `AutocompleteService` interface. Exports `injectContext(root, ctx)`, which walks a DOM subtree and calls `receiveContext(ctx)` on any element that exposes that method.
