import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormComponent } from '@golemui/gui-angular';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import type { ComponentApi } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { BOOKING_REVIEW, bookingIssues, formForOperation, HOTEL_EVENTS, priceBooking, type BookingRequest } from '@hotel/shared';
import { ApiProblem, HotelApiService } from '../api/hotel-api.service';
import { handleBookingFormEvent } from './booking-form-events';
import { describeSpecialRequests } from './contract-labels';
import { diffProposal } from './diff';
import { euros } from './format';
import { HotelComponent } from './hotel-component';

export const BookingReviewApi = {
  name: BOOKING_REVIEW,
  schema: z.object({ proposal: z.record(z.string(), z.any()), bookingId: z.string().optional() }).strict(),
} satisfies ComponentApi;

const CORE_FIELDS = ['dates', 'guests', 'rooms', 'board', 'car'];

/**
 * `BookingReview` — the human-in-the-loop step. The agent only PROPOSES a
 * booking; here the guest sees it in the contract-generated form (core fields
 * + the special requests the agent proposed), with a price breakdown computed
 * by host code and recomputed on every edit. On Confirm the APP calls
 * POST /bookings and tells the agent what was created and what the guest changed.
 */
@Component({
  selector: 'hotel-booking-review',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormComponent],
  template: `
    <div class="hotel-surface hotel-review">
      <div class="hotel-review__badge">
        Approval required · the app {{ bookingId() ? 'updates booking ' + bookingId() : 'creates the booking' }}
      </div>

      <div class="quote" aria-live="polite">
        @if (quote().nights > 0) {
          @for (line of quote().lines; track line.label) {
            <div class="quote__row"><span>{{ line.label }}</span><span>{{ euros(line.amount) }}</span></div>
          }
          <div class="quote__row quote__row--total">
            <span>Total · {{ quote().nights }} night(s)</span><span>{{ euros(quote().total) }}</span>
          </div>
        } @else {
          <div class="quote__empty">Pick arrival and departure to see the price.</div>
        }
        <div class="quote__note">Priced by the app, not the AI — updates as you edit.</div>
      </div>

      <gui-form [config]="config()" (formSubmit)="confirm($event)" (formEvent)="onFormEvent($event)" />

      <div class="hotel-review__actions">
        <button type="button" class="hotel-button hotel-button--ghost" [disabled]="submitting()" (click)="reject()">Reject</button>
        @if (submitting()) { <span class="hotel-review__status">Booking…</span> }
        @if (problems().length) { <span class="hotel-review__status hotel-review__status--error">{{ problems().join(' ') }}</span> }
        @if (requests().length) { <span class="hotel-review__status">Special requests: {{ requests().join(' · ') }}</span> }
      </div>
    </div>
  `,
})
export class BookingReviewComponent extends HotelComponent<typeof BookingReviewApi> {
  private readonly api = inject(HotelApiService);
  protected readonly euros = euros;

  /** Set when the agent proposes a CHANGE to an existing booking: confirm = PATCH, not POST. */
  protected readonly bookingId = computed(() => this.prop<string>('bookingId'));

  private readonly proposal = computed(() => (this.prop<Partial<BookingRequest>>('proposal') ?? {}) as BookingRequest, {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  /** Core fields + only the special requests the agent proposed. */
  protected readonly config = computed(() => ({
    formDef: formForOperation({
      operation: 'createBooking',
      fields: [...CORE_FIELDS, ...Object.keys(this.proposal().specialRequests ?? {}).map((key) => `specialRequests.${key}`)],
      submitLabel: 'Confirm booking',
    }),
    data: structuredClone(this.proposal()),
    formName: `review-${this.surfaceId()}`,
  }));

  private readonly draft = signal<Partial<BookingRequest> | null>(null);
  protected readonly quote = computed(() => priceBooking(this.draft() ?? this.proposal()));
  protected readonly requests = computed(() => describeSpecialRequests((this.draft() ?? this.proposal()).specialRequests));
  protected readonly submitting = signal(false);
  protected readonly problems = signal<string[]>([]);

  protected onFormEvent(event: FormEvent): void {
    handleBookingFormEvent(event);
    this.draft.set(structuredClone(event.data) as Partial<BookingRequest>);
  }

  protected async confirm(event: FormSubmitEvent): Promise<void> {
    const approved = event.data as BookingRequest;
    if (bookingIssues(approved).length > 0) return; // shown inline on the fields
    this.submitting.set(true);
    this.problems.set([]);
    try {
      const id = this.bookingId();
      const booking = id ? await this.api.updateBooking(id, approved) : await this.api.createBooking(approved);
      this.fire(HOTEL_EVENTS.bookingConfirmed, {
        booking: { id: booking.id, total: booking.total, nights: booking.nights, specialRequests: booking.specialRequests },
        humanChanges: diffProposal(this.proposal() as never, approved as never),
      });
    } catch (error) {
      this.problems.set(error instanceof ApiProblem ? error.problems : [String(error)]);
    } finally {
      this.submitting.set(false);
    }
  }

  protected reject(): void {
    this.fire(HOTEL_EVENTS.bookingRejected, {});
  }
}
