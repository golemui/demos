import { ChangeDetectionStrategy, Component, ElementRef, effect, input, signal, viewChild } from '@angular/core';
import { SurfaceComponent } from '@a2ui/angular/v0_9';
import type { AgentSession } from '../agent/agent-session';

/**
 * A chat over one agent session: prose bubbles, the user's actions as chips,
 * and every A2UI surface the agent sends, rendered by @a2ui/angular. A surface
 * the user already acted on is frozen (inert) — the agent re-renders a new one
 * for the next step.
 */
@Component({
  selector: 'chat-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SurfaceComponent],
  template: `
    <section class="chat">
      <div class="chat__thread" #thread>
        @if (session().items().length === 0) {
          <div class="chat__welcome">
            <span class="material-icons chat__welcome-icon">room_service</span>
            <h2>Hotel Aurora concierge</h2>
            <p>{{ blurb() }}</p>
            <div class="chat__suggestions">
              @for (suggestion of suggestions(); track suggestion) {
                <button type="button" class="chip" (click)="send(suggestion)">{{ suggestion }}</button>
              }
            </div>
          </div>
        }

        @for (item of session().items(); track item.id) {
          @switch (item.kind) {
            @case ('user') {
              <div class="bubble bubble--user">{{ item.text }}</div>
            }
            @case ('assistant') {
              <div class="bubble bubble--assistant">{{ item.text }}</div>
            }
            @case ('action') {
              <div class="action-chip"><span class="material-icons">touch_app</span> <code>{{ item.name }}</code></div>
            }
            @case ('notice') {
              <div class="notice-chip"><span class="material-icons">build</span> {{ item.text }}</div>
            }
            @case ('surface') {
              <div class="surface-frame" [class.surface-frame--answered]="item.answered" [attr.inert]="item.answered ? '' : null">
                <a2ui-v09-surface [surfaceId]="item.surfaceId" />
              </div>
            }
          }
        }

        @if (session().running()) {
          <div class="chat__typing" aria-label="The concierge is typing"><span></span><span></span><span></span></div>
        }
        @if (session().error(); as error) {
          <div class="chat__error">⚠ {{ error }}</div>
        }
      </div>

      <form class="chat__composer" (submit)="onSubmit($event)">
        <input
          class="chat__input"
          placeholder="Message the concierge…"
          aria-label="Message"
          [value]="draft()"
          (input)="draft.set($any($event.target).value)"
          [disabled]="session().running()"
        />
        <button class="chat__send" type="submit" aria-label="Send" [disabled]="session().running()">
          <span class="material-icons">send</span>
        </button>
      </form>
    </section>
  `,
})
export class ChatPanelComponent {
  readonly session = input.required<AgentSession>();
  readonly suggestions = input<string[]>([]);
  readonly blurb = input('');
  protected readonly draft = signal('');
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');

  constructor() {
    // Keep the newest message in view while the agent streams.
    effect(() => {
      this.session().items();
      this.session().running();
      const el = this.thread()?.nativeElement;
      if (el) queueMicrotask(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    });
  }

  protected send(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || this.session().running()) return;
    this.draft.set('');
    void this.session().send(trimmed);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.send(this.draft());
  }
}
