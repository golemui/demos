import type { Board, BookingRequest, Car } from './hotel-api';

/**
 * Pricing and business rules for a booking — PURE functions shared by the
 * server (which prices and validates for real) and the app (which shows the
 * same numbers live while the guest edits). The LLM never does this math: it
 * proposes selections, host code prices them.
 *
 * Rate card (per night):
 *   room ................ €60 × rooms   (each room sleeps up to 4)
 *   guest ............... +€10 / guest
 *   half board .......... +€10 / guest   full board +€20 / guest
 *   car ................. compact +€25   suv +€30   sport +€45
 */

export const MAX_NIGHTS = 30;
export const GUESTS_PER_ROOM = 4;

const ROOM_PER_NIGHT = 60;
const GUEST_PER_NIGHT = 10;
const BOARD_PER_NIGHT: Record<Board, number> = { none: 0, half: 10, full: 20 };
const CAR_PER_NIGHT: Record<Car, number> = { none: 0, compact: 25, suv: 30, sport: 45 };
const BOARD_LABEL: Record<Board, string> = { none: 'Room only', half: 'Half board', full: 'Full board' };
const CAR_LABEL: Record<Car, string> = { none: 'No car', compact: 'Compact car', suv: 'SUV', sport: 'Sports car' };

export interface PriceLine {
  label: string;
  amount: number;
}

export interface Quote {
  nights: number;
  lines: PriceLine[];
  total: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function nightsBetween(start?: string, end?: string): number {
  if (!start || !end) return 0;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / MS_PER_DAY);
}

export function priceBooking(booking: Partial<BookingRequest>): Quote {
  const nights = nightsBetween(booking.dates?.start, booking.dates?.end);
  const rooms = Math.max(1, booking.rooms ?? 1);
  const guests = Math.max(1, booking.guests ?? 1);
  const board: Board = booking.board ?? 'none';
  const car: Car = booking.car ?? 'none';

  const lines: PriceLine[] = [];
  if (nights > 0) {
    lines.push({ label: `${rooms} room(s) × ${nights} night(s) × €${ROOM_PER_NIGHT}`, amount: rooms * nights * ROOM_PER_NIGHT });
    lines.push({ label: `${guests} guest(s) × ${nights} night(s) × €${GUEST_PER_NIGHT}`, amount: guests * nights * GUEST_PER_NIGHT });
    if (BOARD_PER_NIGHT[board] > 0) {
      lines.push({
        label: `${BOARD_LABEL[board]} · ${guests} × ${nights} × €${BOARD_PER_NIGHT[board]}`,
        amount: guests * nights * BOARD_PER_NIGHT[board],
      });
    }
    if (CAR_PER_NIGHT[car] > 0) {
      lines.push({ label: `${CAR_LABEL[car]} · ${nights} × €${CAR_PER_NIGHT[car]}`, amount: nights * CAR_PER_NIGHT[car] });
    }
  }
  return { nights, lines, total: lines.reduce((sum, line) => sum + line.amount, 0) };
}

export interface BookingIssue {
  /** The form/request path the issue belongs to. */
  path: 'dates.start' | 'dates.end' | 'guests';
  message: string;
}

/**
 * Business rules a JSON Schema can't express (cross-field). The server rejects
 * a booking that breaks one (HTTP 422); the forms show them live on the field.
 */
export function bookingIssues(booking: Partial<BookingRequest>): BookingIssue[] {
  const issues: BookingIssue[] = [];
  const { start, end } = booking.dates ?? {};
  if (start && start < today()) issues.push({ path: 'dates.start', message: 'Arrival can’t be in the past.' });
  if (start && end) {
    const nights = nightsBetween(start, end);
    if (nights <= 0) issues.push({ path: 'dates.end', message: 'Departure must be after arrival.' });
    else if (nights > MAX_NIGHTS) issues.push({ path: 'dates.end', message: `Stays are limited to ${MAX_NIGHTS} nights.` });
  }
  const guests = booking.guests ?? 0;
  if (guests > (booking.rooms ?? 1) * GUESTS_PER_ROOM) {
    issues.push({
      path: 'guests',
      message: `${guests} guests need at least ${Math.ceil(guests / GUESTS_PER_ROOM)} rooms (max ${GUESTS_PER_ROOM} per room).`,
    });
  }
  return issues;
}

export function bookingProblems(booking: Partial<BookingRequest>): string[] {
  return bookingIssues(booking).map((issue) => issue.message);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(isoDate) + days * MS_PER_DAY).toISOString().slice(0, 10);
}
