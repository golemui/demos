/* AUTO-GENERATED from shared/hotel/shared/src/hotel-api.ts — edit there and run `npm run sync`. Do not edit here. */
/**
 * The hotel API contract — the single source of truth of this demo.
 *
 * Everything else is derived from it:
 *  - the server's mock implementation validates requests against these shapes;
 *  - what the agent is told about the API (tool schemas, field descriptions)
 *    is read from here;
 *  - in the demos with GolemUI forms, those forms are GENERATED from it
 *    (`npm run forms`, which runs the GolemUI MCP's `generateFromOpenapi`).
 *
 * Change a field here and the API and the agent's view move together.
 */
/** The createBooking request body. Extracted so updateBooking can reuse its fields. */
const bookingRequestSchema = {
  type: 'object',
  required: ['dates', 'guests', 'rooms', 'board', 'car'],
  properties: {
    dates: {
      type: 'object',
      title: 'Stay',
      description: 'Arrival and departure dates (at most 30 nights)',
      required: ['start', 'end'],
      properties: {
        start: { type: 'string', format: 'date', title: 'Arrival' },
        end: { type: 'string', format: 'date', title: 'Departure' },
      },
    },
    guests: {
      type: 'integer',
      title: 'Guests',
      description: 'Number of guests (rooms sleep up to 4)',
      minimum: 1,
      maximum: 12,
    },
    rooms: { type: 'integer', title: 'Rooms', minimum: 1, maximum: 3 },
    board: {
      title: 'Board',
      description: 'Meal plan',
      oneOf: [
        { const: 'none', title: 'Room only' },
        { const: 'half', title: 'Half board (+€10/night per guest)' },
        { const: 'full', title: 'Full board (+€20/night per guest)' },
      ],
    },
    car: {
      title: 'Rental car',
      oneOf: [
        { const: 'none', title: 'No car' },
        { const: 'compact', title: 'Compact — 4 seats (+€25/night)' },
        { const: 'suv', title: 'SUV — 5 seats (+€30/night)' },
        { const: 'sport', title: 'Sports car — 2 seats (+€45/night)' },
      ],
    },
    specialRequests: {
      type: 'object',
      title: 'Special requests',
      description: 'Optional — only what the guest needs',
      properties: {
        babyCrib: { type: 'boolean', title: 'Baby crib in the room' },
        accessibleRoom: { type: 'boolean', title: 'Step-free, accessible room' },
        arrivalTime: {
          title: 'Expected arrival time',
          oneOf: [
            { const: 'afternoon', title: 'Afternoon (15:00–18:00)' },
            { const: 'evening', title: 'Evening (18:00–22:00)' },
            { const: 'late', title: 'Late night (after 22:00)' },
          ],
        },
        parking: { type: 'boolean', title: 'Reserve a parking space' },
        licensePlate: { type: 'string', title: 'License plate', maxLength: 12 },
        dietary: {
          title: 'Dietary needs',
          oneOf: [
            { const: 'none', title: 'None' },
            { const: 'vegetarian', title: 'Vegetarian' },
            { const: 'vegan', title: 'Vegan' },
            { const: 'gluten-free', title: 'Gluten-free' },
          ],
        },
        notes: {
          type: 'string',
          title: 'Anything else?',
          description: 'Anything else we should prepare',
          maxLength: 500,
        },
      },
    },
  },
} as const;

export const hotelApi = {
  openapi: '3.1.0',
  info: { title: 'Hotel Aurora API', version: '1.0.0' },
  paths: {
    '/bookings': {
      post: {
        operationId: 'createBooking',
        summary: 'Book a stay',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingRequest' } } },
        },
        responses: {
          '201': {
            description: 'Booking created',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } },
          },
          '422': { description: 'The request breaks a business rule' },
        },
      },
    },
    '/bookings/{bookingId}': {
      patch: {
        operationId: 'updateBooking',
        summary: 'Change a booking before it is paid',
        parameters: [{ name: 'bookingId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingUpdate' } } },
        },
        responses: {
          '200': {
            description: 'Booking updated and repriced',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Booking' } } },
          },
          '409': { description: 'The booking is already paid' },
          '422': { description: 'The change breaks a business rule' },
        },
      },
    },
    '/availability': {
      post: {
        operationId: 'checkAvailability',
        summary: 'Check room availability for a stay',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AvailabilityRequest' } } },
        },
        responses: { '200': { description: 'Availability for those dates' } },
      },
    },
    '/payments': {
      post: {
        operationId: 'createPayment',
        summary: 'Pay a booking (the card brand and last 4 digits only, never the card number)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentRequest' } } },
        },
        responses: { '201': { description: 'Payment captured' } },
      },
    },
  },
  components: {
    schemas: {
      BookingRequest: bookingRequestSchema,
      BookingUpdate: {
        type: 'object',
        title: 'Booking changes',
        description: 'Any createBooking fields to change. Only before the booking is paid.',
        properties: bookingRequestSchema.properties,
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          total: { type: 'number' },
          nights: { type: 'integer' },
        },
      },
      AvailabilityRequest: {
        type: 'object',
        required: ['dates', 'rooms'],
        properties: {
          dates: {
            type: 'object',
            required: ['start', 'end'],
            properties: {
              start: { type: 'string', format: 'date' },
              end: { type: 'string', format: 'date' },
            },
          },
          rooms: { type: 'integer', minimum: 1, maximum: 3 },
        },
      },
      PaymentRequest: {
        type: 'object',
        required: ['bookingId', 'amount', 'brand', 'last4'],
        properties: {
          bookingId: { type: 'string' },
          amount: { type: 'number', minimum: 0 },
          brand: { type: 'string' },
          last4: { type: 'string', minLength: 4, maxLength: 4 },
        },
      },
    },
  },
} as const;

/** The operations the agent collects the guest's input for. */
export const ASKABLE_OPERATIONS = ['createBooking', 'updateBooking'] as const;
export type AskableOperation = (typeof ASKABLE_OPERATIONS)[number];

export type Board = 'none' | 'half' | 'full';
export type Car = 'none' | 'compact' | 'suv' | 'sport';

/** The `createBooking` request body. Note `dates` is ONE object — the API's shape, not a widget's. */
export interface BookingRequest {
  dates: { start: string; end: string };
  guests: number;
  rooms: number;
  board: Board;
  car: Car;
  specialRequests?: SpecialRequests;
}

export interface SpecialRequests {
  babyCrib?: boolean;
  accessibleRoom?: boolean;
  arrivalTime?: 'afternoon' | 'evening' | 'late';
  parking?: boolean;
  licensePlate?: string;
  dietary?: 'none' | 'vegetarian' | 'vegan' | 'gluten-free';
  notes?: string;
}

/** The updateBooking (PATCH) body: any createBooking fields. */
export type BookingUpdate = Partial<BookingRequest>;

export interface AvailabilityRequest {
  dates: { start: string; end: string };
  rooms: number;
}

export interface PaymentRequest {
  bookingId: string;
  amount: number;
  brand: string;
  last4: string;
}
