import { useMemo, useState } from 'react';
import { GuiForm } from '@golemui/gui-react';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import { bookingIssues, formForOperation, priceBooking, type BookingRequest } from '@hotel/shared';
import type { ToolSurfaceProps } from '../agui/toolSurfaces';
import { diffProposal, type HumanChange } from '../agui/diff';
import { ApiProblem, hotelApi, type Booking } from '../api/hotelApi';
import { handleBookingFormEvent } from '../booking/bookingFormEvents';
import { euros, formatValue } from './format';
import { describeSpecialRequests } from './contractLabels';

type ConfirmResult =
  | { status: 'booked'; booking: Booking; humanChanges: HumanChange[] }
  | { status: 'rejected' }
  | { status: 'error'; problems: string[] };

type ConfirmArgs = BookingRequest & {
  /** Set when the agent proposes a CHANGE to an existing unpaid booking. */
  bookingId?: string;
};

/**
 * `confirm_booking` — the harness. The agent PROPOSES a createBooking request;
 * nothing happens until the guest approves it:
 *
 *  - the review form is the same contract-generated createBooking form,
 *    pre-filled with the proposal and fully editable;
 *  - the price breakdown above it is host code (shared with the server),
 *    recomputed live on every edit — the LLM never does the math;
 *  - on Confirm, the APP calls POST /bookings — or PATCH /bookings/{id} when
 *    the agent is changing an existing booking — and the agent gets back the
 *    server's booking plus a diff of what the guest changed.
 */
export function ConfirmBookingSurface({ toolCallId, args: rawArgs, result, respond }: ToolSurfaceProps<ConfirmArgs>) {
  const { bookingId, ...args } = rawArgs;
  const [draft, setDraft] = useState<Partial<BookingRequest>>(args);
  const [submitting, setSubmitting] = useState(false);

  const config = useMemo(
    () => ({
      formDef: formForOperation({ operation: 'createBooking', fields: reviewFields(args), submitLabel: 'Confirm booking' }),
      data: structuredClone(args),
      formName: `confirm-${toolCallId}`,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawArgs, toolCallId],
  );

  const quote = priceBooking(draft);
  const blocked = bookingIssues(draft).length > 0;

  function onFormEvent(event: FormEvent) {
    handleBookingFormEvent(event);
    setDraft(structuredClone(event.data) as Partial<BookingRequest>);
  }

  async function onSubmit(event: FormSubmitEvent) {
    const approved = event.data as BookingRequest;
    setSubmitting(true);
    try {
      const booking = bookingId ? await hotelApi.updateBooking(bookingId, approved) : await hotelApi.createBooking(approved);
      respond({
        status: 'booked',
        booking: { id: booking.id, total: booking.total, nights: booking.nights, specialRequests: booking.specialRequests },
        humanChanges: diffProposal(args as unknown as Record<string, unknown>, approved as unknown as Record<string, unknown>),
      } satisfies ConfirmResult);
    } catch (error) {
      respond({ status: 'error', problems: error instanceof ApiProblem ? error.problems : [String(error)] } satisfies ConfirmResult);
    }
  }

  if (result !== undefined) return <ConfirmDone result={result as ConfirmResult} updated={Boolean(bookingId)} />;

  return (
    <div className="surface surface--review">
      <div className="surface__header">
        <span className="surface__badge surface__badge--warn">Approval required</span>
        <code className="surface__meta">confirm_booking → {bookingId ? `PATCH /bookings/${bookingId}` : 'POST /bookings'}</code>
      </div>

      <div className="quote" aria-live="polite">
        {quote.nights > 0 ? (
          <>
            {quote.lines.map((line) => (
              <div className="quote__row" key={line.label}>
                <span>{line.label}</span>
                <span>{euros(line.amount)}</span>
              </div>
            ))}
            <div className="quote__row quote__row--total">
              <span>Total · {quote.nights} night(s)</span>
              <span>{euros(quote.total)}</span>
            </div>
          </>
        ) : (
          <div className="quote__empty">Pick arrival and departure to see the price.</div>
        )}
        <div className="quote__note">Priced by the app, not the AI — updates as you edit.</div>
      </div>

      <GuiForm config={config} formSubmit={onSubmit} formEvent={onFormEvent} />

      <div className="surface__actions">
        <button type="button" className="button button--ghost" disabled={submitting} onClick={() => respond({ status: 'rejected' } satisfies ConfirmResult)}>
          Reject
        </button>
        {submitting && <span className="surface__status">Booking…</span>}
        {blocked && !submitting && <span className="surface__status surface__status--warn">Fix the highlighted fields to confirm</span>}
      </div>
    </div>
  );
}

const CORE_FIELDS = ['dates', 'guests', 'rooms', 'board', 'car'];

/**
 * The review shows every core field, plus only the special requests the agent
 * actually proposed — the guest reviews what will be sent, not the whole menu.
 */
function reviewFields(proposal: BookingRequest): string[] {
  return [...CORE_FIELDS, ...Object.keys(proposal.specialRequests ?? {}).map((key) => `specialRequests.${key}`)];
}

function ConfirmDone({ result, updated }: { result: ConfirmResult; updated: boolean }) {
  if (result.status === 'rejected') {
    return <div className="surface surface--done surface--muted">✕ Booking proposal rejected</div>;
  }
  if (result.status === 'error') {
    return <div className="surface surface--done surface--error">⚠ The hotel refused it: {result.problems.join(' ')}</div>;
  }
  return (
    <div className="surface surface--done">
      <div className="surface__done-title">
        ✓ {updated ? 'Updated' : 'Booked'} <strong>{result.booking.id}</strong> · {euros(result.booking.total)}
      </div>
      {result.booking.specialRequests && describeSpecialRequests(result.booking.specialRequests).length > 0 && (
        <div className="surface__requests">
          <span className="material-icons">room_service</span>
          Saved with the booking: {describeSpecialRequests(result.booking.specialRequests).join(' · ')}
        </div>
      )}
      {result.humanChanges.length > 0 && (
        <ul className="surface__changes">
          {result.humanChanges.map((change) => (
            <li key={change.path}>
              <code>{change.path}</code> {formatValue(change.proposed)} → <strong>{formatValue(change.approved)}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
