// Widget loaders map a widget `type` string to a lazily-imported component.
// The key here (`temperatureChart`) must match the type passed to
// `gui.displays.custom('temperatureChart', ...)` in the form definition.
export const customWidgetLoaders: Record<string, () => Promise<unknown>> = {
  temperatureChart: async () =>
    (await import('./TemperatureChart')).TemperatureChart,
};
