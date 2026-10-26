import type { FormEvent } from '@golemui/core';
import { addDays, bookingIssues, DATES_CHANGED_EVENT, MAX_NIGHTS } from '@hotel/shared';
import type { BookingRequest } from '@hotel/shared';

const RULE_PATHS = ['dates.start', 'dates.end', 'guests'] as const;

/**
 * Host-side reactions to the generated booking forms. The forms reference these
 * by event NAME; the rules live here (and in the shared pricing module the
 * server also enforces), never in the LLM or the form JSON.
 *
 *  - datesChanged: once an arrival is picked, the departure picker only offers
 *    1–30 nights after it.
 *  - every change: cross-field business rules (e.g. 9 guests in 1 room) are
 *    injected as validation issues on the field they concern, so the guest
 *    sees them inline and submit is blocked — same rules the API applies.
 */
export function handleBookingFormEvent(event: FormEvent): void {
  const booking = event.data as Partial<BookingRequest>;

  if (event.name === DATES_CHANGED_EVENT && booking.dates?.start) {
    const start = booking.dates.start;
    event.callback({ type: 'OVERRIDE_WIDGET_PROP', payload: { path: 'dates.end', prop: 'minDate', value: addDays(start, 1) } });
    event.callback({ type: 'OVERRIDE_WIDGET_PROP', payload: { path: 'dates.end', prop: 'maxDate', value: addDays(start, MAX_NIGHTS) } });
  }

  const issues = bookingIssues(booking);
  for (const path of RULE_PATHS) {
    const messages = issues.filter((issue) => issue.path === path).map((issue) => issue.message);
    event.callback({ type: 'INJECT_VALIDATION_ISSUES', payload: { path, issues: messages.length > 0 ? messages : null } });
  }
}
