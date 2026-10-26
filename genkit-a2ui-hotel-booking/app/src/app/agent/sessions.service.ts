import { Injectable, inject } from '@angular/core';
import { A2uiRendererService } from '@a2ui/angular/v0_9';
import type { ActionPayload } from '@a2ui/web_core/v0_9';
import type { Variant } from '@hotel/shared';
import { AgentSession } from './agent-session';

/**
 * The two conversations of the demo — same hotel, same model, different
 * catalogs — sharing one A2UI renderer. A user action is routed back to the
 * session that created the surface it came from.
 */
@Injectable({ providedIn: 'root' })
export class SessionsService {
  private readonly renderer = inject(A2uiRendererService);

  readonly sessions: Record<Variant, AgentSession> = {
    pure: new AgentSession('pure', '/api/agents/pure', this.renderer),
    golem: new AgentSession('golem', '/api/agents/golem', this.renderer),
  };

  dispatch(action: ActionPayload): void {
    const session = Object.values(this.sessions).find((s) => s.owns(action.surfaceId));
    if (session) void session.sendAction(action);
    else console.warn('[a2ui] action from an unknown surface', action);
  }
}
