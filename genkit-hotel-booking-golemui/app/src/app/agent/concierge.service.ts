import { Injectable, inject } from '@angular/core';
import { A2uiRendererService } from '@a2ui/angular/v0_9';
import type { ActionPayload } from '@a2ui/web_core/v0_9';
import { AgentSession } from './agent-session';

/**
 * The conversation with the concierge, and where the A2UI renderer sends the
 * actions the guest takes on its surfaces.
 */
@Injectable({ providedIn: 'root' })
export class ConciergeService {
  readonly session = new AgentSession('/api/agent', inject(A2uiRendererService));

  dispatch(action: ActionPayload): void {
    if (this.session.owns(action.surfaceId)) void this.session.sendAction(action);
    else console.warn('[a2ui] action from an unknown surface', action);
  }
}
