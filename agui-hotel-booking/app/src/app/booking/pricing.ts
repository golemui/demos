/**
 * Host-side pricing for a hotel booking. A PURE function of the booking data —
 * no LLM, no network. This is where the money math lives, so it's correct by
 * construction and testable. The agent never computes a total; it only proposes
 * selections, and the app prices them.
 *
 * Rate card (per night):
 *   room base ............ €60
 *   per guest ........... +€10  (rooms sleep up to 4)
 *   half board .......... +€10 / guest
 *   full board .......... +€20 / guest
 *   car — sport ......... +€45   compact +€25   suv +€30
 */

export type Board = 'none' | 'half' | 'full';
export type Car = 'none' | 'sport' | 'compact' | 'suv';

export interface Booking {
  /** The stay as a date-range array (rangeDatePicker value): [{ start, end }]. */
  dates?: Array<{ start?: string; end?: string }>;
  guests?: number;
  board?: Board;
  car?: Car;
}

export interface PriceLine {
  label: string;
  amount: number; // EUR, whole-stay
}

export interface Quote {
  nights: number;
  guests: number;
  lines: PriceLine[];
  total: number;
}

const ROOM_PER_NIGHT = 60;
const GUEST_PER_NIGHT = 10;
const BOARD_PER_NIGHT: Record<Board, number> = { none: 0, half: 10, full: 20 };
const CAR_PER_NIGHT: Record<Car, number> = { none: 0, sport: 45, compact: 25, suv: 30 };
const CAR_LABEL: Record<Car, string> = {
  none: 'No car',
  sport: 'Sports car',
  compact: 'Compact car',
  suv: 'SUV',
};
const BOARD_LABEL: Record<Board, string> = {
  none: 'No board',
  half: 'Half board',
  full: 'Full board',
};

export function nightsBetween(arrival?: string, departure?: string): number {
  if (!arrival || !departure) return 0;
  const a = Date.parse(arrival);
  const d = Date.parse(departure);
  if (Number.isNaN(a) || Number.isNaN(d) || d <= a) return 0;
  return Math.round((d - a) / (24 * 60 * 60 * 1000));
}

export function priceBooking(booking: Booking): Quote {
  const range = booking.dates?.[0] ?? {};
  const nights = nightsBetween(range.start, range.end);
  const guests = Math.max(1, Math.min(4, booking.guests ?? 1));
  const board: Board = booking.board ?? 'none';
  const car: Car = booking.car ?? 'none';

  const lines: PriceLine[] = [];
  if (nights > 0) {
    lines.push({ label: `Room · ${nights} night(s) × €${ROOM_PER_NIGHT}`, amount: nights * ROOM_PER_NIGHT });
    lines.push({
      label: `Guests · ${guests} × €${GUEST_PER_NIGHT} × ${nights} night(s)`,
      amount: nights * GUEST_PER_NIGHT * guests,
    });
    if (BOARD_PER_NIGHT[board] > 0) {
      lines.push({
        label: `${BOARD_LABEL[board]} · ${guests} × €${BOARD_PER_NIGHT[board]} × ${nights} night(s)`,
        amount: nights * BOARD_PER_NIGHT[board] * guests,
      });
    }
    if (CAR_PER_NIGHT[car] > 0) {
      lines.push({
        label: `${CAR_LABEL[car]} · €${CAR_PER_NIGHT[car]} × ${nights} night(s)`,
        amount: nights * CAR_PER_NIGHT[car],
      });
    }
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { nights, guests, lines, total };
}

/** The quote as a labelled summary (rows + total) for the harness surface. */
export function priceSummary(booking: Booking): {
  rows: Array<{ label: string; value: string }>;
  total?: { label: string; value: string };
  empty?: string;
} {
  const quote = priceBooking(booking);
  if (quote.nights <= 0) {
    return { rows: [], empty: 'Pick your arrival and departure dates to see the price.' };
  }
  return {
    rows: quote.lines.map((line) => ({ label: line.label, value: `€${line.amount.toFixed(2)}` })),
    total: { label: `Total · ${quote.nights} night(s)`, value: `€${quote.total.toFixed(2)}` },
  };
}
