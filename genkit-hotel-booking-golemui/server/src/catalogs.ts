import type { A2uiCatalog, A2uiCatalogComponent } from '@genkit-ai/a2ui';
import { basicCatalogComponents } from './basic-catalog';
import {
  BOOKING_REVIEW,
  CHECKOUT,
  CONTRACT_FORM,
  describeOperation,
  HOTEL_CATALOG_ID,
  HOTEL_EVENTS,
} from '@hotel/shared';

/**
 * The catalog, as the AGENT sees it (the `a2ui()` middleware injects these
 * descriptions into the system prompt). The renderer registers the matching
 * implementations under the same id in the Angular app.
 */

/** The basic catalog, described from the renderer's own schema (see basic-catalog.ts). */
const BASIC = basicCatalogComponents();

/** The basic catalog + three components backed by GolemUI and host code. */
export const hotelCatalog: A2uiCatalog = {
  id: HOTEL_CATALOG_ID,
  components: [
    ...BASIC,
    {
      name: CONTRACT_FORM,
      description: `Asks the guest for fields of a hotel API operation. The app renders a form GENERATED from the API contract (widgets, labels, options, validation) — you only choose WHICH fields to ask. On submit it fires your action event with context { values } holding ONLY the asked fields, in the API's shape. Never build booking forms out of TextFields — use this.

Operation createBooking (new booking), its fields:
${describeOperation('createBooking')}

Operation updateBooking (change an existing, unpaid booking): the same fields, all optional — ask only the ones to change.`,
    props:
      'operation: "createBooking" | "updateBooking" (required); fields: string[] of field names above, e.g. ["dates","rooms"] or ["specialRequests.babyCrib"] (required); prefill?: object of suggested values in the API shape, e.g. { "dates": { "start": "2026-11-20", "end": "2026-11-27" }, "specialRequests": { "babyCrib": true } }; submitLabel?: string; action: { event: { name: string } } (required — fired on submit).',
    },
    {
      name: BOOKING_REVIEW,
      description: `The guest reviews and confirms a booking you propose. The app prices it in host code (live breakdown), lets the guest edit any field, and on confirm the APP calls POST /bookings itself (or PATCH /bookings/{bookingId} when you pass a bookingId). Fires "${HOTEL_EVENTS.bookingConfirmed}" with context { booking: { id, total, nights, specialRequests }, humanChanges: [{ path, proposed, approved }] } or "${HOTEL_EVENTS.bookingRejected}". Never quote prices yourself.`,
      props:
        'proposal: the full booking (dates, guests, rooms, board, car, specialRequests?) (required); bookingId?: string — pass it when CHANGING an existing booking: the app then updates it instead of creating a new one.',
    },
    {
      name: CHECKOUT,
      description: `Secure card checkout. The app charges the card itself; card data never reaches you. Fires "${HOTEL_EVENTS.paymentCompleted}" with context { bookingId, amount, brand, last4 } or "${HOTEL_EVENTS.paymentCancelled}".`,
      props: 'bookingId: string (required); amount: number in EUR (required).',
    },
  ],
};
