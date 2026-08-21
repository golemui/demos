import { Injectable, signal } from '@angular/core';
import { HttpAgent } from '@ag-ui/client';
import type { Message } from '@ag-ui/core';
import { RENDER_FORM_TOOL } from './render-form-tool';

const AGENT_URL = 'http://localhost:8000/awp';

/**
 * Thin Angular wrapper around the AG-UI `HttpAgent`.
 *
 * The HttpAgent keeps the canonical conversation state (`agent.messages`) and
 * applies the streamed AG-UI events to it; this service mirrors that state into
 * Angular signals and adds the two operations the chat UI needs:
 * - send a user message and run the agent;
 * - send a frontend-tool result (the submitted form data) and run the agent.
 */
@Injectable({ providedIn: 'root' })
export class AguiClientService {
  private readonly agent = new HttpAgent({ url: AGENT_URL });

  readonly messages = signal<Message[]>([]);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    this.agent.subscribe({
      // Fires after each streamed event has been applied to agent.messages,
      // which gives us live-updating text while the assistant streams.
      onEvent: ({ messages }) => {
        this.messages.set([...messages]);
      },
      onRunFailed: ({ error }) => {
        this.error.set(error.message);
      },
    });
  }

  async sendUserMessage(text: string): Promise<void> {
    this.agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
    this.messages.set([...this.agent.messages]);
    await this.run();
  }

  /** Reports a completed frontend tool call back to the agent and continues the run. */
  async sendToolResult(toolCallId: string, result: unknown): Promise<void> {
    this.agent.addMessage({
      id: crypto.randomUUID(),
      role: 'tool',
      toolCallId,
      content: JSON.stringify(result),
    });
    this.messages.set([...this.agent.messages]);
    await this.run();
  }

  /** True once a tool result exists for the given tool call (form already submitted). */
  hasToolResult(toolCallId: string): boolean {
    return this.messages().some(
      (message) => message.role === 'tool' && message.toolCallId === toolCallId,
    );
  }

  private async run(): Promise<void> {
    this.running.set(true);
    this.error.set(null);
    try {
      await this.agent.runAgent({ tools: [RENDER_FORM_TOOL] });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.running.set(false);
      this.messages.set([...this.agent.messages]);
    }
  }
}
