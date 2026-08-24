import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { FormEvent } from '@golemui/core';
import type { AssistantMessage, Message, ToolCall } from '@ag-ui/core';
import { AguiClientService } from '../agui/agui-client.service';
import { FormToolComponent } from '../agui/form-tool.component';
import { ToolApprovalComponent } from '../agui/tool-approval.component';
import type { ApprovalDecision, HarnessToolEntry, HarnessToolRegistry } from '../agui/harness';
// Scenario shortcut: the payment checkout is a hand-crafted tool surface. A
// future @golemui/ag-ui package needs a registry story for custom surfaces;
// for the demo the chat panel imports it directly.
import { PaymentToolComponent } from '../payment/payment-tool.component';
import type { PaymentResult } from '../payment/payment-tool.component';

@Component({
  selector: 'app-chat-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormToolComponent, ToolApprovalComponent, PaymentToolComponent],
  template: `
    <div class="chat" #scroller>
      @if (client.messages().length === 0) {
        <div class="chat__empty">
          <p>👋 Hi! I'm the Hotel Aurora concierge.</p>
          <p>Tell me about your trip — for example:</p>
          <button
            class="chat__suggestion"
            (click)="send('Book a room for 2 people next week')"
          >
            “Book a room for 2 people next week”
          </button>
        </div>
      }
      @for (message of client.messages(); track message.id) {
        @switch (message.role) {
          @case ('user') {
            <div class="bubble bubble--user">{{ message.content }}</div>
          }
          @case ('assistant') {
            @if (message.content) {
              <div class="bubble bubble--assistant">{{ message.content }}</div>
            }
            @for (call of renderFormCalls(message); track call.id) {
              <app-form-tool
                [toolCall]="call"
                [completed]="client.hasToolResult(call.id)"
                (submitted)="onFormSubmitted(call.id, $event)"
                (formEvent)="formEventHandler()($event)"
              />
            }
            @for (supervised of harnessCalls(message); track supervised.call.id) {
              <app-tool-approval
                [toolCall]="supervised.call"
                [tool]="supervised.entry.tool"
                [summary]="supervised.entry.summary"
                [submitLabel]="supervised.entry.submitLabel ?? 'Approve & execute'"
                [completed]="client.hasToolResult(supervised.call.id)"
                (decided)="onDecision(supervised, $event)"
              />
            }
            @for (call of paymentCalls(message); track call.id) {
              <app-payment-tool
                [toolCall]="call"
                [completed]="client.hasToolResult(call.id)"
                (done)="onPaid(call.id, $event)"
              />
            }
          }
        }
      }
      @if (client.running()) {
        <div class="bubble bubble--assistant bubble--typing">
          <span></span><span></span><span></span>
        </div>
      }
      @if (client.error(); as error) {
        <div class="chat__error">⚠️ {{ error }}</div>
      }
    </div>

    <form class="composer" (submit)="onComposerSubmit($event)">
      <input
        type="text"
        placeholder="Tell us about your trip…"
        [value]="draft()"
        (input)="draft.set(composerInput.value)"
        [disabled]="client.running()"
        #composerInput
      />
      <button type="submit" [disabled]="client.running() || !draft().trim()">Send</button>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    .chat {
      flex: 1;
      overflow-y: auto;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .chat__empty {
      margin: auto;
      text-align: center;
      color: #5d5d66;
    }
    .chat__suggestion {
      border: 1px solid #d4d4dd;
      background: #fff;
      border-radius: 999px;
      padding: 0.5rem 1rem;
      cursor: pointer;
      font: inherit;
      color: #3a3a44;
    }
    .chat__suggestion:hover {
      background: #f2f2f7;
    }
    .bubble {
      max-width: 78%;
      padding: 0.6rem 0.9rem;
      border-radius: 14px;
      line-height: 1.45;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }
    .bubble--user {
      align-self: flex-end;
      background: #2f6fed;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .bubble--assistant {
      align-self: flex-start;
      background: #ededf2;
      color: #1f1f26;
      border-bottom-left-radius: 4px;
    }
    .bubble--typing {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 0.8rem 0.9rem;
    }
    .bubble--typing span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #9a9aa6;
      animation: pulse 1.2s infinite ease-in-out;
    }
    .bubble--typing span:nth-child(2) { animation-delay: 0.2s; }
    .bubble--typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse {
      0%, 80%, 100% { opacity: 0.35; transform: scale(0.85); }
      40% { opacity: 1; transform: scale(1); }
    }
    .chat__error {
      align-self: center;
      color: #b42318;
      background: #fdecea;
      border-radius: 8px;
      padding: 0.4rem 0.9rem;
      font-size: 0.9rem;
    }
    .composer {
      display: flex;
      gap: 0.6rem;
      padding: 0.9rem 1.25rem;
      border-top: 1px solid #e3e3e8;
      background: #fff;
    }
    .composer input {
      flex: 1;
      border: 1px solid #d4d4dd;
      border-radius: 10px;
      padding: 0.65rem 0.9rem;
      font: inherit;
    }
    .composer input:focus {
      outline: 2px solid #2f6fed;
      outline-offset: -1px;
      border-color: transparent;
    }
    .composer button {
      border: none;
      border-radius: 10px;
      background: #2f6fed;
      color: #fff;
      font: inherit;
      font-weight: 600;
      padding: 0 1.2rem;
      cursor: pointer;
    }
    .composer button:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class ChatPanelComponent {
  protected readonly client = inject(AguiClientService);

  /** GolemUI form events are handled by the host application, not the chat. */
  readonly formEventHandler = input.required<(event: FormEvent) => void>();

  /** Tools the harness supervises (approval form + host-side execution). */
  readonly harnessTools = input<HarnessToolRegistry>({});

  protected readonly draft = signal('');
  private readonly scroller = viewChild.required<ElementRef<HTMLDivElement>>('scroller');

  constructor() {
    // Keep the newest message in view while responses stream in.
    effect(() => {
      this.client.messages();
      this.client.running();
      queueMicrotask(() => {
        const el = this.scroller().nativeElement;
        el.scrollTop = el.scrollHeight;
      });
    });
  }

  protected renderFormCalls(message: Message): ToolCall[] {
    return ((message as AssistantMessage).toolCalls ?? []).filter(
      (call) => call.function.name === 'render_form',
    );
  }

  protected paymentCalls(message: Message): ToolCall[] {
    return ((message as AssistantMessage).toolCalls ?? []).filter(
      (call) => call.function.name === 'collect_payment',
    );
  }

  protected onPaid(toolCallId: string, result: PaymentResult): void {
    void this.client.sendToolResult(toolCallId, result);
  }

  protected harnessCalls(message: Message): Array<{ call: ToolCall; entry: HarnessToolEntry }> {
    const registry = this.harnessTools();
    return ((message as AssistantMessage).toolCalls ?? [])
      .filter((call) => call.function.name in registry)
      .map((call) => ({ call, entry: registry[call.function.name] }));
  }

  protected send(text: string): void {
    void this.client.sendUserMessage(text);
  }

  protected onComposerSubmit(event: Event): void {
    event.preventDefault();
    const text = this.draft().trim();
    if (!text || this.client.running()) return;
    this.draft.set('');
    void this.client.sendUserMessage(text);
  }

  protected onFormSubmitted(toolCallId: string, data: Record<string, unknown>): void {
    void this.client.sendToolResult(toolCallId, data);
  }

  /**
   * The harness loop closes here: on approval, run the business action and
   * report the outcome — INCLUDING the human's edits — back to the agent.
   */
  protected onDecision(
    supervised: { call: ToolCall; entry: HarnessToolEntry },
    decision: ApprovalDecision,
  ): void {
    void (async () => {
      if (decision.status === 'rejected') {
        await this.client.sendToolResult(supervised.call.id, { status: 'rejected' });
        return;
      }
      const result = await supervised.entry.execute(decision.data);
      await this.client.sendToolResult(supervised.call.id, {
        status: 'approved',
        humanChanges: decision.humanChanges,
        result,
      });
    })();
  }
}
