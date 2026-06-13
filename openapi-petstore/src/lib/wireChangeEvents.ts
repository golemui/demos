/** Event name emitted by every input on change (so the app can read live data). */
export const LIVE_CHANGE = 'liveChange';

type Widget = Record<string, unknown>;

/**
 * Deep-clone a list of JSON widgets and wire `on.change` on every input widget
 * to a shared event name. GolemUI then fires `formEvent` (with the full form
 * data) on every keystroke — the JSON-native way to observe live form data,
 * since JSON form props can't be JS callbacks.
 *
 * Applied to the *rendered* copy only, so the editable JSON panel keeps showing
 * the pristine definition the MCP produced.
 */
export function wireChangeEvents(widgets: unknown[]): unknown[] {
  return widgets.map((w) => wireWidget(w as Widget));
}

function wireWidget(widget: Widget): Widget {
  const next: Widget = { ...widget };

  if (next.kind === 'input') {
    const existing = (next.on as Record<string, unknown> | undefined) ?? {};
    next.on = { ...existing, change: LIVE_CHANGE };
  }

  // Recurse into layout children.
  if (Array.isArray(next.children)) {
    next.children = next.children.map((c) => wireWidget(c as Widget));
  }

  // Recurse into a repeater's row template (lives under props.template).
  if (next.props && typeof next.props === 'object') {
    const props = next.props as Record<string, unknown>;
    if (props.template && typeof props.template === 'object') {
      next.props = { ...props, template: wireWidget(props.template as Widget) };
    }
  }

  return next;
}
