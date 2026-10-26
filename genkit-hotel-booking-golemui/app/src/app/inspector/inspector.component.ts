import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { JsonPipe } from '@angular/common';
import type { AgentSession } from '../agent/agent-session';
import { HotelApiService } from '../api/hotel-api.service';

/**
 * What happens behind the chat: everything that crossed the wire — the A2UI
 * the agent wrote (with its size), the actions sent back, the server tool the
 * LLM called — and what reached the hotel API from the browser.
 */
@Component({
  selector: 'inspector-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  template: `
    <aside class="inspector">
      <div class="inspector__tabs" role="tablist">
        <button role="tab" [class.is-active]="tab() === 'wire'" (click)="tab.set('wire')">
          Agent wire <span class="inspector__count">{{ session().wire().length }}</span>
        </button>
        <button role="tab" [class.is-active]="tab() === 'api'" (click)="tab.set('api')">
          Hotel API (browser) <span class="inspector__count">{{ api.calls().length }}</span>
        </button>
      </div>

      <div class="inspector__body">
        @if (tab() === 'wire') {
          <div class="inspector__summary">
            A2UI written by the agent: <strong>{{ a2uiBytes() }}</strong> bytes in
            {{ a2uiCount() }} batch(es)
          </div>
          <ol class="inspector__list">
            @for (entry of reversedWire(); track entry.id) {
              <li class="wire" [attr.data-direction]="entry.direction">
                <details>
                  <summary>
                    <span class="wire__dir">{{ entry.direction }}</span>
                    <span class="wire__label">{{ entry.label }}</span>
                    <span class="wire__bytes">{{ entry.bytes }} B</span>
                  </summary>
                  <pre>{{ entry.payload | json }}</pre>
                </details>
              </li>
            } @empty {
              <p class="inspector__empty">
                Messages between the browser and the Genkit agent show up here.
              </p>
            }
          </ol>
        } @else {
          <ol class="inspector__list">
            @for (call of reversedCalls(); track call.id) {
              <li class="api-call">
                <div class="api-call__line">
                  <span class="api-call__method">{{ call.method }}</span
                  ><code>{{ call.path }}</code>
                  <span class="api-call__status" [class.is-error]="(call.status ?? 0) >= 400">{{
                    call.status ?? '…'
                  }}</span>
                </div>
                <pre>{{ call.body | json }}</pre>
              </li>
            } @empty {
              <p class="inspector__empty">
                Calls the APP makes to the hotel API show up here: the BookingReview creates the
                booking and the Checkout charges it, with the contract's request bodies. The agent
                never calls the API to book or to pay.
              </p>
            }
          </ol>
        }
      </div>
    </aside>
  `,
})
export class InspectorComponent {
  readonly session = input.required<AgentSession>();
  protected readonly api = inject(HotelApiService);
  protected readonly tab = signal<'wire' | 'api'>('wire');

  protected readonly reversedWire = computed(() => [...this.session().wire()].reverse());
  protected readonly reversedCalls = computed(() => [...this.api.calls()].reverse());
  private readonly a2ui = computed(() =>
    this.session()
      .wire()
      .filter((e) => e.direction === 'agent → app'),
  );
  protected readonly a2uiBytes = computed(() =>
    this.a2ui()
      .reduce((sum, e) => sum + e.bytes, 0)
      .toLocaleString(),
  );
  protected readonly a2uiCount = computed(() => this.a2ui().length);
}
