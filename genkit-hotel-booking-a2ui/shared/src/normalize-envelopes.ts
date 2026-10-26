const MESSAGE_KEYS = ['createSurface', 'updateComponents', 'updateDataModel', 'deleteSurface'] as const;

/**
 * Repairs a structural slip models make with A2UI before it reaches the strict
 * renderer: a `version` key written INSIDE the message ("updateComponents:
 * Unrecognized key(s) in object: 'version'"). The model copies it from the
 * earlier surfaces it sees in the history, where `@genkit-ai/a2ui` stamps
 * `version` at the top level. The top-level one is the only valid place, and
 * the plugin always sets it, so the nested copy can simply go.
 *
 * Anything else that's invalid is left alone: the renderer rejects it and the
 * session asks the agent to re-render (see the app's AgentSession).
 */
export function normalizeEnvelopes<T>(envelopes: T[]): { envelopes: T[]; repaired: number } {
  let repaired = 0;
  const fixed = envelopes.map((envelope) => {
    const copy = { ...(envelope as Record<string, unknown>) };
    for (const key of MESSAGE_KEYS) {
      const message = copy[key] as Record<string, unknown> | undefined;
      if (message && typeof message === 'object' && 'version' in message) {
        const { version, ...rest } = message;
        copy[key] = rest;
        copy['version'] ??= version;
        repaired++;
      }
    }
    return copy as T;
  });
  return { envelopes: fixed, repaired };
}
