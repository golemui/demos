import { ApplicationConfig, inject, Injector, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideA2Ui, provideMarkdownRenderer } from '@a2ui/angular/v0_9';
import { renderMarkdown } from '@a2ui/markdown-it';
import { ConciergeService } from './agent/concierge.service';
import { hotelCatalog } from './hotel/hotel-catalog';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // The A2UI renderer with the hotel catalog: the basic components + the
    // GolemUI-backed ones.
    provideA2Ui(() => {
      // Resolve lazily: ConciergeService injects A2uiRendererService, which
      // injects this config — inject()ing it here is a circular dependency.
      const injector = inject(Injector);
      return {
        catalogs: [hotelCatalog],
        actionHandler: (action) => injector.get(ConciergeService).dispatch(action),
      };
    }),
    provideMarkdownRenderer(renderMarkdown),
  ],
};
