/** One field the human changed before approving the agent's proposal. */
export interface HumanChange {
  path: string;
  proposed: unknown;
  approved: unknown;
}

/**
 * Compares what the agent proposed with what the human approved. Sent back with
 * the tool result, it tells the agent HOW its proposal was corrected — not just
 * that it was accepted — so it can acknowledge the change.
 */
export function diffProposal(proposed: Record<string, unknown>, approved: Record<string, unknown>): HumanChange[] {
  const before = flatten(proposed);
  const after = flatten(approved);
  const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...paths]
    .filter((path) => JSON.stringify(before[path]) !== JSON.stringify(after[path]))
    .map((path) => ({ path, proposed: before[path], approved: after[path] }));
}

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(flat, flatten(entry as Record<string, unknown>, path));
    } else {
      flat[path] = entry;
    }
  }
  return flat;
}
