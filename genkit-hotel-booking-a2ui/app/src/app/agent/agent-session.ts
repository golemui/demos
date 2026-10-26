import { signal } from '@angular/core';
import { remoteAgent } from 'genkit/beta/client';
import { a2uiEnvelopesFromParts, actionToMessage, type A2uiServerEnvelope } from '@genkit-ai/a2ui/client';
import type { A2uiRendererService } from '@a2ui/angular/v0_9';
import type { ActionPayload } from '@a2ui/web_core/v0_9';
import { normalizeEnvelopes } from '@hotel/shared';

export type TranscriptItem =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'assistant'; id: number; text: string }
  | { kind: 'surface'; id: number; surfaceId: string; answered: boolean }
  | { kind: 'action'; id: number; name: string }
  | { kind: 'notice'; id: number; text: string };

/** One line of the inspector: what crossed the wire, in which direction. */
export interface WireEntry {
  id: number;
  direction: 'agent → app' | 'app → agent' | 'agent → tool' | 'tool → agent';
  label: string;
  payload: unknown;
  bytes: number;
}

let nextId = 1;

/** How many times the agent may re-send a surface the renderer rejected. */
const MAX_REPAIRS = 2;

/**
 * The conversation with the Genkit agent.
 *
 * `remoteAgent(...).chat()` keeps the whole session in the browser (the agents
 * have no store), streams each turn, and the `a2ui()` middleware's data parts
 * come out of the chunks as A2UI envelopes, which go straight into the A2UI
 * renderer. A user action on a surface becomes the next turn.
 */
export class AgentSession {
  readonly items = signal<TranscriptItem[]>([]);
  readonly wire = signal<WireEntry[]>([]);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);

  private chat: ReturnType<AgentSession['newChat']>;
  private readonly surfaces = new Set<string>();
  /** Why the renderer rejected the agent's last A2UI, if it did. */
  private rejected: string | null = null;

  constructor(
    private readonly url: string,
    private readonly renderer: A2uiRendererService,
  ) {
    // Not a field initializer: those run before parameter properties are assigned.
    this.chat = this.newChat();
  }

  owns(surfaceId: string): boolean {
    return this.surfaces.has(surfaceId);
  }

  send(text: string): Promise<void> {
    // A new chat message makes any open surface stale (e.g. the checkout while the
    // guest asks for a change): freeze them; the agent re-renders what's needed.
    this.items.update((items) => items.map((item) => (item.kind === 'surface' ? { ...item, answered: true } : item)));
    this.push({ kind: 'user', id: nextId++, text });
    this.log('app → agent', 'user message', text);
    return this.run(text);
  }

  sendAction(action: ActionPayload): Promise<void> {
    // The surface has done its job: freeze it and show what was sent.
    this.items.update((items) =>
      items.map((item) => (item.kind === 'surface' && item.surfaceId === action.surfaceId ? { ...item, answered: true } : item)),
    );
    this.push({ kind: 'action', id: nextId++, name: action.name });
    this.log('app → agent', `action "${action.name}"`, action);
    return this.run({ message: actionToMessage(action) } as never);
  }

  reset(): void {
    for (const surfaceId of this.surfaces) this.renderer.surfaceGroup.deleteSurface(surfaceId);
    this.surfaces.clear();
    this.chat = this.newChat();
    this.items.set([]);
    this.wire.set([]);
    this.error.set(null);
  }

  private newChat() {
    return remoteAgent({ url: this.url, stateManagement: 'client' }).chat();
  }

  private async run(input: Parameters<AgentSession['chat']['sendStream']>[0], retries = 0): Promise<void> {
    this.running.set(true);
    this.error.set(null);
    this.rejected = null;
    let answer: { kind: 'assistant'; id: number; text: string } | null = null;
    try {
      const turn = this.chat.sendStream(input);
      for await (const chunk of turn.stream) {
        if (chunk.text) {
          if (!answer) {
            answer = { kind: 'assistant', id: nextId++, text: '' };
            this.push(answer);
          }
          answer.text += chunk.text;
          this.items.update((items) => [...items]);
        }
        // Server-side tool calls stream by too: show what the LLM relays to the API.
        for (const part of (chunk.raw.modelChunk?.content ?? []) as Array<{ toolRequest?: { name: string; input?: unknown }; toolResponse?: { name: string; output?: unknown } }>) {
          if (part.toolRequest) this.log('agent → tool', part.toolRequest.name, part.toolRequest.input ?? {});
          if (part.toolResponse) this.log('tool → agent', part.toolResponse.name, part.toolResponse.output ?? null);
        }
        const envelopes = a2uiEnvelopesFromParts(chunk.raw.modelChunk?.content);
        if (envelopes.length > 0) {
          this.render(envelopes);
          answer = null; // later prose goes below the surface
        }
      }
      await turn.response;
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.running.set(false);
    }

    // The renderer rejected a surface: tell the agent (A2UI's renderer → agent
    // error path) and let it re-render, instead of leaving the guest stuck.
    const rejected = this.rejected;
    if (!rejected) return;
    if (retries >= MAX_REPAIRS) {
      this.error.set(`The agent sent invalid A2UI: ${rejected}`);
      return;
    }
    this.push({ kind: 'notice', id: nextId++, text: `Renderer rejected the surface (${rejected}) — asking the agent to fix it` });
    const report = `The A2UI surface you just sent was REJECTED by the renderer and is not shown to the guest: ${rejected}. Re-render the whole surface (createSurface + updateComponents) using only the props listed in the catalog.`;
    this.log('app → agent', 'renderer error', report);
    await this.run(report, retries + 1);
  }

  private render(raw: A2uiServerEnvelope[]): void {
    const { envelopes, repaired } = normalizeEnvelopes(raw);
    this.log('agent → app', `A2UI ×${envelopes.length}${repaired ? ` (fixed ${repaired} misplaced "version")` : ''}`, raw);
    try {
      this.renderer.processMessages(envelopes as never);
    } catch (error) {
      // processMessages throws on an invalid payload (bad catalog id, schema…).
      this.rejected = error instanceof Error ? error.message : String(error);
      return;
    }
    for (const envelope of envelopes) {
      const created = (envelope as { createSurface?: { surfaceId: string } }).createSurface;
      if (created && !this.surfaces.has(created.surfaceId)) {
        this.surfaces.add(created.surfaceId);
        this.push({ kind: 'surface', id: nextId++, surfaceId: created.surfaceId, answered: false });
      }
    }
  }

  private push(item: TranscriptItem): void {
    this.items.update((items) => [...items, item]);
  }

  private log(direction: WireEntry['direction'], label: string, payload: unknown): void {
    const bytes = new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload)).length;
    this.wire.update((entries) => [...entries, { id: nextId++, direction, label, payload, bytes }]);
  }
}
