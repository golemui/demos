import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { JsonPipe } from '@angular/common';
import type { AgentSession } from '../agent/agent-session';

/**
 * What happens behind the chat: everything that crossed the wire — the A2UI
 * the agent wrote (with its size), the actions sent back with what the guest
 * typed, and the server tools through which the agent called the hotel API.
 */
@Component({
  selector: 'inspector-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe],
  template: `
    <aside class="inspector">
      <div class="inspector__tabs" role="tablist">
        <button role="tab" class="is-active">
          Agent wire <span class="inspector__count">{{ session().wire().length }}</span>
        </button>
      </div>

      <div class="inspector__body">
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
              Messages between the browser and the Genkit agent show up here, including the
              hotel API calls the agent makes through its server tools ("agent → tool").
            </p>
          }
        </ol>
      </div>
    </aside>
  `,
})
export class InspectorComponent {
  readonly session = input.required<AgentSession>();

  protected readonly reversedWire = computed(() => [...this.session().wire()].reverse());
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
