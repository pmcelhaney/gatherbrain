import { type Entity } from '../types/index';
import { type Schema } from '../types/index';
import { type EntityStore } from '../store/entity-store';
import { type SchemaRegistry } from '../schema/registry';
import { type QueryEngine } from '../query/engine';
import { type Router } from '../services/router';

export interface AutocompleteService {
  suggest(query: string, schemaName?: string): Promise<Entity[]>;
}

export interface EntityContext {
  entity: Entity;
  schema: Schema;
  store: EntityStore;
  schemas: SchemaRegistry;
  query: QueryEngine;
  router: Router;
  updateEntity: (id: string, patch: Record<string, unknown>) => Promise<void>;
  autocomplete: AutocompleteService;
}

export const CONTEXT_KEY = Symbol('entityContext');

export function injectContext(root: Element, context: EntityContext): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = root;

  while (node !== null) {
    const el = node as Element;

    if (typeof (el as unknown as { receiveContext?: unknown }).receiveContext === 'function') {
      (el as unknown as { receiveContext: (ctx: EntityContext) => void }).receiveContext(context);
    }

    node = walker.nextNode();
  }
}
