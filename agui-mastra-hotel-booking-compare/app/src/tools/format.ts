/** Human-readable rendering of a contract value for chat summaries and diffs. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    const range = value as { start?: unknown; end?: unknown };
    if ('start' in range || 'end' in range) return `${range.start ?? '…'} → ${range.end ?? '…'}`;
    return JSON.stringify(value);
  }
  return String(value);
}

export function euros(amount: number): string {
  return `€${amount.toFixed(2)}`;
}
