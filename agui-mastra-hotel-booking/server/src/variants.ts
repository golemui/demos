import type { BaseEvent, RunAgentInput } from '@ag-ui/core';
import { getLocalAgent } from '@ag-ui/mastra';
import { A2UIMiddleware, RENDER_A2UI_TOOL, RENDER_A2UI_TOOL_GUIDELINES } from '@ag-ui/a2ui-middleware';
import type { Variant } from '@hotel/shared';
import type { Observable } from 'rxjs';
import { basicCatalogSchema, BASIC_CATALOG_ID } from './a2ui-catalog';
import { mastra } from './agent';

const AGENT_IDS: Record<Variant, string> = { golem: 'concierge', pure: 'pureConcierge' };

/**
 * The AG-UI event stream of one run of a variant's agent. The whole Mastra ⇄
 * AG-UI bridge is `getLocalAgent` — a fresh wrapper per request.
 *
 * The pure variant goes through @ag-ui/a2ui-middleware, the AG-UI way to do
 * declarative generative UI: it injects the basic catalog's schema into every
 * run, turns render_a2ui calls into `a2ui-surface` ACTIVITY_SNAPSHOT events,
 * and hands UI actions (forwardedProps.a2uiAction) back to the agent as a
 * synthetic log_a2ui_event tool call. (`agent.use()` only wraps `runAgent()`;
 * this drives the raw `run()` stream, so the middleware wraps it explicitly.)
 */
export function variantEvents(variant: Variant, input: RunAgentInput, resourceId: string): Observable<BaseEvent> {
  const agent = getLocalAgent({ mastra, agentId: AGENT_IDS[variant], resourceId });
  if (variant === 'golem') return agent.run(input);
  return new A2UIMiddleware({ schema: basicCatalogSchema(), defaultCatalogId: BASIC_CATALOG_ID }).run(withRenderTool(input), agent);
}

/**
 * The render_a2ui tool and its usage guide are added here rather than with the
 * middleware's `injectA2UITool` flag: @ag-ui/mastra 2 reads that flag and swaps
 * render_a2ui for `generate_a2ui`, which hands the UI to a second LLM (a
 * subagent writing A2UI from a prose description). Here the concierge writes
 * the A2UI itself, like the pure variant of genkit-a2ui-hotel-booking (in this repo).
 */
function withRenderTool(input: RunAgentInput): RunAgentInput {
  return {
    ...input,
    tools: [...input.tools.filter((tool) => tool.name !== RENDER_A2UI_TOOL.name), RENDER_A2UI_TOOL],
    context: [...input.context, { description: `How to call ${RENDER_A2UI_TOOL.name}`, value: RENDER_A2UI_TOOL_GUIDELINES(RENDER_A2UI_TOOL.name) }],
  };
}
