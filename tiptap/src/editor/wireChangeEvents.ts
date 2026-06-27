/** Event name every input emits on change, so the node view can read live data. */
export const LIVE_CHANGE = 'liveChange';

type Widget = Record<string, unknown>;

/**
 * Deep-clone a list of GolemUI JSON widgets and wire `on.change` on every input
 * to a shared event name. GolemUI then fires `formEvent` (with the full form
 * data) on every keystroke — the JSON-native way to observe live form data,
 * since JSON form props can't be JS callbacks.
 *
 * We render this wired clone inside the node view, but keep the *pristine*
 * definition in `node.attrs.formDef` (so the "View document JSON" panel shows
 * the form exactly as authored). Captured values are mirrored back into
 * `node.attrs.value` from the `liveChange` event.
 */
export function wireChangeEvents(widgets: unknown[]): Widget[] {
  return widgets.map((w) => wireWidget(w as Widget));
}

function wireWidget(widget: Widget): Widget {
  const next: Widget = { ...widget };

  if (next.kind === 'input') {
    const existing = (next.on as Record<string, unknown> | undefined) ?? {};
    next.on = { ...existing, change: LIVE_CHANGE };
  }

  if (Array.isArray(next.children)) {
    next.children = next.children.map((c) => wireWidget(c as Widget));
  }

  if (next.props && typeof next.props === 'object') {
    const props = next.props as Record<string, unknown>;
    if (props.template && typeof props.template === 'object') {
      next.props = { ...props, template: wireWidget(props.template as Widget) };
    }
  }

  return next;
}
