import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConciergeService } from './agent/concierge.service';
import { HotelApiService } from './api/hotel-api.service';
import { ChatPanelComponent } from './chat/chat-panel.component';
import { InspectorComponent } from './inspector/inspector.component';
import { DemoShellComponent } from './shell/demo-shell.component';

const SUGGESTIONS = [
  'Book a room for 2 people next week, half board',
  'We are 6 people and travel with a baby, need parking',
  'I need a room',
];

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DemoShellComponent, ChatPanelComponent, InspectorComponent],
  template: `
    <demo-shell demoName="Hotel concierge · Genkit × A2UI × GolemUI">
      <div class="layout">
        <div class="layout__chat">
          <div class="layout__toolbar">
            <span>The agent picks what to ask; the forms come from the hotel’s OpenAPI.</span>
            <button type="button" class="hotel-button hotel-button--ghost" (click)="restart()">
              <span class="material-icons">restart_alt</span> New chat
            </button>
          </div>
          <chat-panel
            [session]="concierge.session"
            [suggestions]="suggestions"
            blurb="Tell me about your stay. I’ll ask with forms generated from our booking API."
          />
        </div>
        <inspector-panel [session]="concierge.session" />
      </div>
    </demo-shell>
  `,
})
export class App {
  protected readonly concierge = inject(ConciergeService);
  private readonly api = inject(HotelApiService);
  protected readonly suggestions = SUGGESTIONS;

  protected restart(): void {
    this.concierge.session.reset();
    this.api.calls.set([]);
  }
}
