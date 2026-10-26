import { ApplicationConfig, inject, Injector, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { BasicCatalog, provideA2Ui, provideMarkdownRenderer } from '@a2ui/angular/v0_9';
import { renderMarkdown } from '@a2ui/markdown-it';
import { SessionsService } from './agent/sessions.service';
import { hotelCatalog } from './hotel/hotel-catalog';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // One A2UI renderer for both variants: the plain basic catalog (pure A2UI)
    // and the hotel catalog (basic + the GolemUI-backed components).
    provideA2Ui(() => {
      // Resolve lazily: SessionsService injects A2uiRendererService, which
      // injects this config — inject()ing it here is a circular dependency.
      const injector = inject(Injector);
      return {
        catalogs: [new BasicCatalog(), hotelCatalog],
        actionHandler: (action) => injector.get(SessionsService).dispatch(action),
      };
    }),
    provideMarkdownRenderer(renderMarkdown),
  ],
};
