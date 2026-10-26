/**
 * A2UI names shared by the agent (server) and the renderer (Angular app).
 * The catalog id the agent puts in `createSurface` must be exactly the id of a
 * catalog the renderer registered.
 */

/** The A2UI v0.9 basic catalog, as registered by `@a2ui/angular/v0_9`'s BasicCatalog. */
export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';

/** Basic components + the GolemUI-backed hotel components. */
export const HOTEL_CATALOG_ID = 'https://golemui.com/a2ui/catalogs/hotel-booking/v1';

/** Custom components of the hotel catalog. */
export const CONTRACT_FORM = 'ContractForm';
export const BOOKING_REVIEW = 'BookingReview';
export const CHECKOUT = 'Checkout';

/** Events the hotel components fire (their `context` carries the result). */
export const HOTEL_EVENTS = {
  /** BookingReview, after the app created the booking: { booking: { id, total, nights, specialRequests? }, humanChanges } */
  bookingConfirmed: 'booking_confirmed',
  /** BookingReview, guest rejected the proposal: {} */
  bookingRejected: 'booking_rejected',
  /** Checkout, after the app took the payment: { bookingId, amount, brand, last4 } */
  paymentCompleted: 'payment_completed',
  /** Checkout, guest closed it: {} */
  paymentCancelled: 'payment_cancelled',
} as const;

/** The two variants of the demo. */
export type Variant = 'pure' | 'golem';
