import { Directive, inject } from '@angular/core';
import { A2uiRendererService, CatalogComponent } from '@a2ui/angular/v0_9';
import type { ComponentApi } from '@a2ui/web_core/v0_9';

/**
 * Base for the hotel catalog's components: an A2UI catalog component that can
 * fire its own events back to the agent.
 *
 * `surface.dispatchAction` sends `{ event: { name, context } }` as-is — the
 * context is NOT resolved against the data model — so a GolemUI form can hand
 * its submitted, already-validated values straight to the agent.
 */
@Directive()
export abstract class HotelComponent<Api extends ComponentApi> extends CatalogComponent<Api> {
  private readonly renderer = inject(A2uiRendererService);

  /** A literal prop sent by the agent (these components don't use data bindings). */
  protected prop<T>(key: string): T | undefined {
    return (this.props() as Record<string, { value: () => unknown } | undefined>)[key]?.value() as T | undefined;
  }

  protected fire(name: string, context: Record<string, unknown>): void {
    const surface = this.renderer.surfaceGroup.getSurface(this.surfaceId());
    if (surface) void surface.dispatchAction({ event: { name, context } }, this.componentId());
  }
}
