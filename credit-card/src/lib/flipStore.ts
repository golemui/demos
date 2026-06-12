import { useSyncExternalStore } from 'react';

/**
 * Tiny module-level store shared between the CVV input and the card preview.
 *
 * Why this exists: GolemUI exposes onChange / onBlur / onClick / onLoad /
 * onFilter event hooks, but NOT an onFocus hook. The "flip the card when the
 * CVV is focused" interaction therefore can't be wired through the form event
 * system. Two sibling widgets (CvvInput, CardPreview) need to share one
 * boolean, so we keep it in a framework-native external store and subscribe
 * with useSyncExternalStore. Card *data* still flows the idiomatic way —
 * through runtime-function props reading $form.
 */

let flipped = false;
const listeners = new Set<() => void>();

export const flipStore = {
  set(value: boolean) {
    if (flipped === value) return;
    flipped = value;
    listeners.forEach((l) => l());
  },
  get() {
    return flipped;
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useCardFlipped(): boolean {
  return useSyncExternalStore(flipStore.subscribe, flipStore.get);
}
