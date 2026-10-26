import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ConciergeService } from './agent/concierge.service';
import { ChatPanelComponent } from './chat/chat-panel.component';
import { InspectorComponent } from './inspector/inspector.component';
import { DemoShellComponent } from './shell/demo-shell.component';

const SUGGESTIONS = [
  'Book a room for 2 people next week, half board',
  'We are 6 people and travel with a baby, need parking',
  'We are 2 people, a slider for guests please',
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
            <span>The agent designs every form with A2UI’s basic catalog.</span>
            <button type="button" class="hotel-button hotel-button--ghost" (click)="concierge.session.reset()">
              <span class="material-icons">restart_alt</span> New chat
            </button>
          </div>
          <chat-panel
            [session]="concierge.session"
            [suggestions]="suggestions"
            blurb="Tell me about your stay. I’ll design the forms we need as we go."
          />
        </div>
        <inspector-panel [session]="concierge.session" />
      </div>
    </demo-shell>
  `,
})
export class App {
  protected readonly concierge = inject(ConciergeService);
  protected readonly suggestions = SUGGESTIONS;
}
