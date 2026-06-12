import { VaultService } from './store/vault';
import { EntityStore } from './store/entity-store';
import { SchemaRegistry } from './schema/registry';
import { QueryEngine } from './query/engine';
import { loadSchemasFromVault } from './schema/loader';
import { BUILTIN_SCHEMAS } from './schema/builtins';
import { navigateTo, parseRoute, type Router } from './services/router';
import { injectContext, type EntityContext, type AutocompleteService } from './elements/context';

export class App {
  private vault: VaultService;
  private store: EntityStore;
  private schemas: SchemaRegistry;
  private query: QueryEngine;
  private appRoot: HTMLElement;

  constructor(appRoot: HTMLElement) {
    this.appRoot = appRoot;
    this.vault = new VaultService();
    this.store = new EntityStore();
    this.schemas = new SchemaRegistry();
    this.query = new QueryEngine(this.store);
  }

  async boot(): Promise<void> {
    const restored = await this.vault.restore();

    if (restored) {
      await this.loadVaultData();
    }

    this.render();

    window.addEventListener('hashchange', () => {
      this.render();
    });
  }

  private async loadVaultData(): Promise<void> {
    this.schemas.load(BUILTIN_SCHEMAS);
    const vaultSchemas = await loadSchemasFromVault(this.vault);
    this.schemas.load(vaultSchemas);
    await this.store.loadAll(this.vault);
  }

  private render(): void {
    if (!this.vault.handle) {
      this.renderVaultSelector();
      return;
    }

    const route = parseRoute(window.location.hash);

    if (route.view === 'entity') {
      this.renderEntityPage(route.id);
    } else {
      this.renderHome();
    }
  }

  private renderVaultSelector(): void {
    this.appRoot.innerHTML = '<h1>GatherBrain</h1>';

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open Vault';
    button.addEventListener('click', async () => {
      try {
        await this.vault.open();
        await this.loadVaultData();
        this.render();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        throw err;
      }
    });

    this.appRoot.append(button);
  }

  private renderHome(): void {
    const h1 = document.createElement('h1');
    h1.textContent = 'GatherBrain';

    const p = document.createElement('p');
    p.textContent = `Vault: ${this.vault.getHandle().name}`;

    this.appRoot.replaceChildren(h1, p);
  }

  private renderEntityPage(id: string): void {
    const entity = this.store.getById(id);

    if (!entity) {
      const p = document.createElement('p');
      p.textContent = `Not found: ${id}`;
      this.appRoot.replaceChildren(p);
      return;
    }

    const schema = this.schemas.get(entity.schema);

    if (!schema || !schema.fullPageTemplate) {
      this.appRoot.innerHTML = `<p>No template for schema: ${entity.schema}</p>`;
      return;
    }

    this.appRoot.innerHTML = schema.fullPageTemplate;

    const router: Router = {
      navigateTo,
    };

    const autocomplete: AutocompleteService = {
      suggest: async (query, schemaName) => {
        const results = this.store.search(query);
        if (schemaName) {
          return results.filter((e) => e.schema === schemaName);
        }
        return results;
      },
    };

    const context: EntityContext = {
      entity,
      schema,
      store: this.store,
      schemas: this.schemas,
      query: this.query,
      router,
      updateEntity: (entityId, patch) => this.store.updateFrontmatter(entityId, patch).then(() => undefined),
      autocomplete,
    };

    injectContext(this.appRoot, context);
  }
}
