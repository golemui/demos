import { Injectable, signal } from '@angular/core';
import type { BookingRequest, BookingUpdate, PaymentRequest, SpecialRequests } from '@hotel/shared';

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

/**
 * Browser client for the (mocked) hotel REST API, used by the GolemUI-backed
 * catalog components. Every call is recorded for the inspector: the body is
 * the contract's request, built by the app — not relayed by the LLM.
 */
@Injectable({ providedIn: 'root' })
export class HotelApiService {
  readonly calls = signal<ApiCall[]>([]);
  private nextId = 1;

  createBooking(body: BookingRequest): Promise<Booking> {
    return this.request('POST', '/api/hotel/bookings', body);
  }

  updateBooking(bookingId: string, body: BookingUpdate): Promise<Booking> {
    return this.request('PATCH', `/api/hotel/bookings/${encodeURIComponent(bookingId)}`, body);
  }

  createPayment(body: PaymentRequest): Promise<Booking> {
    return this.request('POST', '/api/hotel/payments', body);
  }

  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    const call: ApiCall = { id: this.nextId++, method, path, body };
    this.record(call);
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await response.json();
    this.record({ ...call, status: response.status, response: json });
    if (!response.ok) throw new ApiProblem(json.problems ?? [json.error ?? `HTTP ${response.status}`]);
    return json as T;
  }

  private record(call: ApiCall): void {
    this.calls.update((calls) => [...calls.filter((c) => c.id !== call.id), call]);
  }
}
