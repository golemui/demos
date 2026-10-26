import { ApplicationConfig, inject, Injector, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BasicCatalog, provideA2Ui, provideMarkdownRenderer } from '@a2ui/angular/v0_9';
import { renderMarkdown } from '@a2ui/markdown-it';
import { ConciergeService } from './agent/concierge.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // The A2UI renderer with the v0.9 basic catalog.
    provideA2Ui(() => {
      // Resolve lazily: ConciergeService injects A2uiRendererService, which
      // injects this config — inject()ing it here is a circular dependency.
      const injector = inject(Injector);
      return {
        catalogs: [new BasicCatalog()],
        actionHandler: (action) => injector.get(ConciergeService).dispatch(action),
      };
    }),
    provideMarkdownRenderer(renderMarkdown),
  ],
};
