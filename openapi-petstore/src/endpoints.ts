/**
 * The Petstore operations offered in the dropdown — metadata only.
 *
 * The actual GolemUI form definition for each operation lives in a static JSON
 * file under `public/forms/<id>.json` and is loaded over HTTP at runtime (see
 * `lib/loadFormDef.ts`). Those files are the *verbatim* output of the GolemUI
 * MCP `generate_from_openapi` against the Petstore v3 spec — every field, enum
 * and validator below it comes straight from the spec. All four validated clean
 * (`valid: true`, `unmapped: []`).
 */
export interface EndpointDef {
  /** Stable id — the dropdown value, the GolemUI remount key seed, and the JSON filename. */
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Operation path, e.g. `/pet`. */
  path: string;
  /** Human summary from the spec, shown next to the method badge. */
  summary: string;
  /**
   * How GolemUI's form data turns into a request:
   * - `body`  → JSON request body (POST/PUT).
   * - `query` → URL query string (GET, from the operation's parameters).
   */
  paramStyle: 'body' | 'query';
  /** A trimmed slice of the OpenAPI spec that produced the form (the "OpenAPI" tab). */
  specSnippet: string;
  /** Seed data so the form + live request preview look alive on load. */
  sampleData: Record<string, unknown>;
}

/** Base URL of the live Petstore v3 sandbox (used only to render the request line). */
export const PETSTORE_BASE = 'https://petstore3.swagger.io/api/v3';

/** URL of the form-definition JSON for an endpoint (respects Vite's base path). */
export const formUrl = (id: string) => `${import.meta.env.BASE_URL}forms/${id}.json`;

export const ENDPOINTS: EndpointDef[] = [
  {
    id: 'addPet',
    method: 'POST',
    path: '/pet',
    summary: 'Add a new pet to the store',
    paramStyle: 'body',
    specSnippet: `POST /pet
operationId: addPet
requestBody (application/json) → schema: Pet

Pet:
  required: [name, photoUrls]
  properties:
    id:        { type: integer, format: int64 }
    name:      { type: string, example: doggie }
    category:  { $ref: Category }      # { id: integer, name: string }
    photoUrls: { type: array, items: { type: string } }
    tags:      { type: array, items: { $ref: Tag } }   # Tag = { id, name }
    status:    { type: string, enum: [available, pending, sold] }`,
    sampleData: {
      id: 10,
      name: 'Rex',
      category: { id: 1, name: 'Dogs' },
      photoUrls: ['https://example.com/rex.jpg'],
      tags: [{ id: 1, name: 'good-boy' }],
      status: 'available',
    },
  },
  {
    id: 'placeOrder',
    method: 'POST',
    path: '/store/order',
    summary: 'Place an order for a pet',
    paramStyle: 'body',
    specSnippet: `POST /store/order
operationId: placeOrder
requestBody (application/json) → schema: Order

Order:
  properties:
    id:       { type: integer, format: int64 }
    petId:    { type: integer, format: int64 }
    quantity: { type: integer, format: int32 }
    shipDate: { type: string, format: date-time }
    status:   { type: string, enum: [placed, approved, delivered] }
    complete: { type: boolean }`,
    sampleData: {
      id: 1,
      petId: 10,
      quantity: 1,
      status: 'placed',
      complete: false,
    },
  },
  {
    id: 'createUser',
    method: 'POST',
    path: '/user',
    summary: 'Create user',
    paramStyle: 'body',
    specSnippet: `POST /user
operationId: createUser
requestBody (application/json) → schema: User

User:
  properties:
    id:         { type: integer, format: int64 }
    username:   { type: string }
    firstName:  { type: string }
    lastName:   { type: string }
    email:      { type: string }
    password:   { type: string }
    phone:      { type: string }
    userStatus: { type: integer, format: int32, description: User Status }`,
    sampleData: {
      id: 1,
      username: 'jane',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '555-0100',
      userStatus: 1,
    },
  },
  {
    id: 'findByStatus',
    method: 'GET',
    path: '/pet/findByStatus',
    summary: 'Find pets by status',
    paramStyle: 'query',
    specSnippet: `GET /pet/findByStatus
operationId: findPetsByStatus
(no requestBody → form generated from parameters)

parameters:
  - name: status
    in: query
    required: true
    schema:
      type: string
      default: available
      enum: [available, pending, sold]`,
    sampleData: {
      status: 'available',
    },
  },
];

export const DEFAULT_ENDPOINT = ENDPOINTS[0];
