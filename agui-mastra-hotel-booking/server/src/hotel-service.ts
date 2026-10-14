import { bookingProblems, nightsBetween, priceBooking, requestSchema } from '@hotel/shared';
import type { AvailabilityRequest, BookingRequest, PaymentRequest, SchemaNode } from '@hotel/shared';

/**
 * The mocked hotel backend — implements the contract in `@hotel/shared` with
 * in-memory maps. No database on purpose: restart the server and it's clean.
 *
 * It still behaves like a real API where it matters for the demo: it validates
 * every request against the contract (required fields, enums, ranges) and the
 * cross-field business rules, and prices bookings itself. Whatever the agent
 * proposes, this is the last line of defence.
 */

export interface Booking extends BookingRequest {
  id: string;
  total: number;
  nights: number;
  status: 'pending_payment' | 'paid';
  payment?: { brand: string; last4: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problems: string[],
  ) {
    super(problems.join(' '));
  }
}

/** Rooms of the (tiny) Hotel Aurora. */
const TOTAL_ROOMS = 6;

const bookings = new Map<string, Booking>();
let sequence = 1000;

export function checkAvailability(body: unknown): { available: boolean; roomsLeft: number; nights: number } {
  const request = body as AvailabilityRequest;
  const problems = contractProblems(requestSchema('checkAvailability'), request);
  if (problems.length > 0) throw new ApiError(422, problems);
  const roomsLeft = TOTAL_ROOMS - roomsTaken(request.dates);
  return { available: roomsLeft >= request.rooms, roomsLeft, nights: nightsBetween(request.dates.start, request.dates.end) };
}

export function createBooking(body: unknown): Booking {
  const request = body as BookingRequest;
  const problems = [...contractProblems(requestSchema('createBooking'), request), ...bookingProblems(request)];
  if (problems.length === 0 && TOTAL_ROOMS - roomsTaken(request.dates) < request.rooms) {
    problems.push('Not enough rooms left for those dates.');
  }
  if (problems.length > 0) throw new ApiError(422, problems);

  const quote = priceBooking(request);
  const booking: Booking = {
    id: `AUR-${++sequence}`,
    dates: request.dates,
    guests: request.guests,
    rooms: request.rooms,
    board: request.board,
    car: request.car,
    ...(request.specialRequests ? { specialRequests: request.specialRequests } : {}),
    total: quote.total,
    nights: quote.nights,
    status: 'pending_payment',
  };
  bookings.set(booking.id, booking);
  return booking;
}

export function createPayment(body: unknown): Booking {
  const request = body as PaymentRequest;
  const problems = contractProblems(requestSchema('createPayment'), request);
  if (problems.length > 0) throw new ApiError(422, problems);
  const booking = bookings.get(request.bookingId);
  if (!booking) throw new ApiError(404, [`Booking ${request.bookingId} not found.`]);
  if (Math.abs(request.amount - booking.total) > 0.005) {
    throw new ApiError(422, [`Amount €${request.amount} doesn't match the booking total €${booking.total}.`]);
  }
  booking.status = 'paid';
  booking.payment = { brand: request.brand, last4: request.last4 };
  return booking;
}

export function listBookings(): Booking[] {
  return [...bookings.values()];
}

function roomsTaken(dates: { start: string; end: string }): number {
  return listBookings()
    .filter((booking) => booking.dates.start < dates.end && dates.start < booking.dates.end)
    .reduce((sum, booking) => sum + booking.rooms, 0);
}

/**
 * A deliberately small JSON Schema check over the contract's own request
 * schema: required, enums (oneOf/const), types, numeric and length bounds,
 * nested objects.
 */
function contractProblems(schema: SchemaNode, body: unknown, prefix = ''): string[] {
  if (body === null || typeof body !== 'object') return [`${prefix || 'The request body'} must be a JSON object.`];
  const data = body as Record<string, unknown>;
  const problems: string[] = [];

  for (const name of schema.required ?? []) {
    if (data[name] === undefined || data[name] === null || data[name] === '') problems.push(`"${prefix}${name}" is required.`);
  }
  for (const [name, field] of Object.entries(schema.properties ?? {})) {
    const value = data[name];
    const path = `${prefix}${name}`;
    if (value === undefined || value === null) continue;
    if (field.oneOf && !field.oneOf.some((option) => option.const === value)) {
      problems.push(`"${path}" must be one of ${field.oneOf.map((option) => option.const).join(', ')}.`);
    }
    if ((field.type === 'integer' && !Number.isInteger(value)) || (field.type === 'number' && typeof value !== 'number')) {
      problems.push(`"${path}" must be a${field.type === 'integer' ? 'n integer' : ' number'}.`);
    }
    if (typeof value === 'number' && field.minimum !== undefined && value < field.minimum) problems.push(`"${path}" must be ≥ ${field.minimum}.`);
    if (typeof value === 'number' && field.maximum !== undefined && value > field.maximum) problems.push(`"${path}" must be ≤ ${field.maximum}.`);
    if (field.type === 'boolean' && typeof value !== 'boolean') problems.push(`"${path}" must be true or false.`);
    if (field.type === 'string' && typeof value !== 'string') problems.push(`"${path}" must be a string.`);
    if (field.format === 'date' && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))) problems.push(`"${path}" must be a date (YYYY-MM-DD).`);
    if (typeof value === 'string' && field.maxLength !== undefined && value.length > field.maxLength) {
      problems.push(`"${path}" must be at most ${field.maxLength} characters.`);
    }
    if (field.type === 'object' && field.properties) problems.push(...contractProblems(field, value, `${path}.`));
  }
  return problems;
}
