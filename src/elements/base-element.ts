import { type EntityContext } from './context';

export class BaseElement extends HTMLElement {
  protected context: EntityContext | null = null;

  receiveContext(ctx: EntityContext): void {
    this.context = ctx;
    this.onContextReady();
  }

  onContextReady(): void {
    // Subclasses override this to perform rendering.
  }
}
