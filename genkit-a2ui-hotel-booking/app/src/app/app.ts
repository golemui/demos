import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { Variant } from '@hotel/shared';
import { SessionsService } from './agent/sessions.service';
import { ChatPanelComponent } from './chat/chat-panel.component';
import { InspectorComponent } from './inspector/inspector.component';
import { DemoShellComponent } from './shell/demo-shell.component';

const SUGGESTIONS = [
  'Book a room for 2 people next week, half board',
  'We are 6 people and travel with a baby, need parking',
  'I need a room',
];

const VARIANTS: Array<{ id: Variant; label: string; blurb: string }> = [
  { id: 'pure', label: 'A2UI', blurb: 'Pure A2UI: the agent composes every form from the basic catalog and relays the data to the API.' },
  {
    id: 'golem',
    label: 'A2UI + GolemUI',
    blurb: 'A2UI + GolemUI: the agent only picks the operation and the fields; the forms come from the hotel’s OpenAPI.',
  },
];

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DemoShellComponent, ChatPanelComponent, InspectorComponent],
  template: `
    <demo-shell demoName="Hotel concierge · Genkit × A2UI">
      <div class="layout">
        <div class="layout__chat">
          <div class="layout__toolbar">
            <div class="variant-tabs" role="tablist" aria-label="Variant">
              @for (variant of variants; track variant.id) {
                <button role="tab" [class.is-active]="active() === variant.id" [attr.aria-selected]="active() === variant.id" (click)="active.set(variant.id)">
                  {{ variant.label }}
                </button>
              }
            </div>
            <button type="button" class="hotel-button hotel-button--ghost" (click)="session().reset()">
              <span class="material-icons">restart_alt</span> New chat
            </button>
          </div>
          @for (variant of variants; track variant.id) {
            <chat-panel
              [hidden]="active() !== variant.id"
              [session]="sessions.sessions[variant.id]"
              [suggestions]="suggestions"
              [blurb]="variant.blurb"
            />
          }
        </div>
        <inspector-panel [session]="session()" />
      </div>
    </demo-shell>
  `,
})
export class App {
  protected readonly sessions = inject(SessionsService);
  protected readonly variants = VARIANTS;
  protected readonly suggestions = SUGGESTIONS;
  protected readonly active = signal<Variant>('golem');
  protected readonly session = computed(() => this.sessions.sessions[this.active()]);
}
