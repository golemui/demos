import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ChatPanelComponent } from '../chat/chat-panel.component';
import { handleClaimFormEvent } from './claim-form-events';

@Component({
  selector: 'app-claims-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChatPanelComponent],
  template: `
    <div class="page">
      <header class="header">
        <div class="header__logo">☀️</div>
        <div>
          <h1>Solaria Insurance</h1>
          <p>File a claim by chatting with our assistant</p>
        </div>
      </header>
      <main class="panel">
        <app-chat-panel [formEventHandler]="onFormEvent" />
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
      background: #fff3d6;
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
export class ClaimsPageComponent {
  protected readonly onFormEvent = handleClaimFormEvent;
}
