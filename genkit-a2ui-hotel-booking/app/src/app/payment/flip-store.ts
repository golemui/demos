import { signal } from '@angular/core';

/**
 * Tiny shared signal between the CVV input and the card preview.
 *
 * Why this exists: GolemUI exposes onChange / onBlur / onClick / onLoad /
 * onFilter event hooks, but NOT an onFocus hook. The "flip the card when the
 * CVV is focused" interaction therefore can't be wired through the form event
 * system. The React version (credit-card, agui-mastra-hotel-booking) uses a
 * useSyncExternalStore store; in Angular a module-level signal is the idiomatic equivalent. Card *data* still flows
 * the idiomatic GolemUI way — runtime-function props reading $form.
 */
export const cardFlipped = signal(false);
