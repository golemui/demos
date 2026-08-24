import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ChatPanelComponent } from '../chat/chat-panel.component';
import { AguiClientService } from '../agui/agui-client.service';
import { handleBookingFormEvent } from './booking-form-events';
import { BOOKING_HARNESS_TOOLS } from './booking-tools';
import { COLLECT_PAYMENT_TOOL } from '../payment/payment-tool-def';

@Component({
  selector: 'app-booking-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatPanelComponent],
  template: `
    <div class="page">
      <header class="header">
        <div class="header__logo">🏨</div>
        <div>
          <h1>Hotel Aurora</h1>
          <p>Book your stay by chatting with our concierge</p>
        </div>
      </header>
      <main class="panel">
        <app-chat-panel [formEventHandler]="onFormEvent" [harnessTools]="harnessTools" />
      </main>
    </div>
  `,
  styles: `
    .page {
      max-width: 760px;
      margin: 0 auto;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      padding: 1.25rem;
      box-sizing: border-box;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding-bottom: 1rem;
    }
    .header__logo {
      font-size: 1.8rem;
      background: #e6efff;
      border-radius: 12px;
      width: 3rem;
      height: 3rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header h1 {
      margin: 0;
      font-size: 1.25rem;
    }
    .header p {
      margin: 0.1rem 0 0;
      color: #5d5d66;
      font-size: 0.9rem;
    }
    .panel {
      flex: 1;
      min-height: 0;
      background: #fafafc;
      border: 1px solid #e3e3e8;
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `,
})
export class BookingPageComponent {
  protected readonly onFormEvent = handleBookingFormEvent;
  protected readonly harnessTools = BOOKING_HARNESS_TOOLS;

  constructor() {
    // Declare the supervised tools to the agent — this is what lets the LLM
    // propose a confirm_booking call in the first place.
    const client = inject(AguiClientService);
    for (const { tool } of Object.values(BOOKING_HARNESS_TOOLS)) client.registerTool(tool);
    client.registerTool(COLLECT_PAYMENT_TOOL);
  }
}
