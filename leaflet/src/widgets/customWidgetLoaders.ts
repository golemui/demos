import type { ComponentType } from 'react';
import type { WithWidget, WidgetLoaders } from '@golemui/core';

/** Maps each custom widget `type` to a lazy-loaded React implementation. */
export const customWidgetLoaders: WidgetLoaders<ComponentType<WithWidget>> = {
  addressAutocomplete: async () =>
    (await import('./AddressAutocomplete')).AddressAutocomplete,
  routeMap: async () => (await import('./RouteMap')).RouteMap,
  routeSummary: async () => (await import('./RouteSummary')).RouteSummary,
};
