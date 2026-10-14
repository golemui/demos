import { useSyncExternalStore } from 'react';
import type { BookingRequest, PaymentRequest, SpecialRequests } from '@hotel/shared';

/**
 * Browser client for the (mocked) hotel REST API. Every call is recorded so the
 * inspector can show exactly what reached the API — the payload is the
 * contract's request body, untouched by any LLM.
 */

export interface ApiCall {
  id: number;
  method: string;
  path: string;
  body: unknown;
  status?: number;
  response?: unknown;
}

export interface Booking {
  id: string;
  total: number;
  nights: number;
  specialRequests?: SpecialRequests;
}

export class ApiProblem extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '));
  }
}

let calls: ApiCall[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function record(call: ApiCall) {
  calls = [...calls.filter((existing) => existing.id !== call.id), call].sort((a, b) => a.id - b.id);
  listeners.forEach((listener) => listener());
}

async function request<T>(method: string, path: string, body: unknown): Promise<T> {
  const call: ApiCall = { id: nextId++, method, path, body };
  record(call);
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  record({ ...call, status: response.status, response: json });
  if (!response.ok) throw new ApiProblem(json.problems ?? [json.error ?? `HTTP ${response.status}`]);
  return json as T;
}

export const hotelApi = {
  createBooking: (body: BookingRequest) => request<Booking>('POST', '/api/bookings', body),
  createPayment: (body: PaymentRequest) => request<Booking>('POST', '/api/payments', body),
};

export const apiLog = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => calls,
  clear() {
    calls = [];
    listeners.forEach((listener) => listener());
  },
};

export function useApiLog(): ApiCall[] {
  return useSyncExternalStore(apiLog.subscribe, apiLog.getSnapshot);
}
