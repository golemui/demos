import './env.js'; // must stay the first import — populates process.env from .env/key files
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { EventEncoder } from '@ag-ui/encoder';
import { EventType, type BaseEvent } from '@ag-ui/core';
import { RunAgentInputSchema } from '@ag-ui/core/schemas';
import { getLocalAgent } from '@ag-ui/mastra';
import { A2UIMiddleware, RENDER_A2UI_TOOL, RENDER_A2UI_TOOL_GUIDELINES } from '@ag-ui/a2ui-middleware';
import type { RunAgentInput } from '@ag-ui/core';
import { hotelApi } from '@hotel/shared';
import { basicCatalogSchema, BASIC_CATALOG_ID } from './a2ui-catalog';
import { MOCK, MODEL_ID, mastra } from './agent';
import { ApiError, checkAvailability, createBooking, createPayment, listBookings, updateBooking } from './hotel-service';

const PORT = Number(process.env.SERVER_PORT ?? 8000);

/**
 * One process, two faces:
 *  - POST /agui — the Mastra agent, spoken over AG-UI (SSE), with A2UI surfaces as activity events.
 *  - /api/*     — the (mocked) hotel REST API described by the OpenAPI contract.
 * The Vite dev server proxies both, so the browser sees one origin.
 */
const server = createServer(async (req, res) => {
  const path = req.url?.split('?')[0] ?? '/';
  try {
    if (req.method === 'POST' && path === '/agui') return await runAgent(req, res);
    if (path.startsWith('/api/')) return await hotelRoute(req, res, path);
    send(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof ApiError) return send(res, error.status, { problems: error.problems });
    console.error('[server]', error);
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

// ---------------------------------------------------------------------------
// AG-UI endpoint
// ---------------------------------------------------------------------------

async function runAgent(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const parsed = RunAgentInputSchema.safeParse(await readJson(req));
  if (!parsed.success) return send(res, 422, { error: `Invalid RunAgentInput: ${parsed.error.message}` });
  const input = parsed.data;

  console.log(`[agui] run ${input.runId.slice(0, 8)} — ${input.messages.length} messages, tools: ${input.tools.map((tool) => tool.name).join(', ') || '—'}`);

  // The Mastra ⇄ AG-UI bridge is `getLocalAgent`, a fresh wrapper per request.
  // The browser owns the conversation, so the agent is stateless between runs.
  const agent = getLocalAgent({ mastra, agentId: 'concierge', resourceId: 'guest' });
  const events = a2ui.run(withRenderTool(input), agent);
  const encoder = new EventEncoder();
  res.writeHead(200, { 'Content-Type': encoder.getContentType(), 'Cache-Control': 'no-cache', Connection: 'keep-alive' });

  await new Promise<void>((resolve) => {
    const subscription = events.subscribe({
      next: (event: BaseEvent) => res.write(encoder.encodeSSE(event)),
      error: (error: unknown) => {
        console.error('[agui] run failed:', error);
        res.write(encoder.encodeSSE({ type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : String(error) } as BaseEvent));
        res.end();
        resolve();
      },
      complete: () => {
        res.end();
        resolve();
      },
    });
    req.on('close', () => {
      subscription.unsubscribe();
      resolve();
    });
  });
}

/**
 * @ag-ui/a2ui-middleware, the AG-UI way to do declarative generative UI: it
 * injects the basic catalog's schema into every run, turns render_a2ui calls
 * into `a2ui-surface` ACTIVITY_SNAPSHOT events, and hands UI actions
 * (forwardedProps.a2uiAction) back to the agent as a synthetic log_a2ui_event
 * tool call. (`agent.use()` only wraps `runAgent()`; this server streams the
 * raw `run()`, so the middleware wraps it explicitly.)
 */
const a2ui = new A2UIMiddleware({ schema: basicCatalogSchema(), defaultCatalogId: BASIC_CATALOG_ID });

/**
 * The render_a2ui tool and its usage guide are added here rather than with the
 * middleware's `injectA2UITool` flag: @ag-ui/mastra 2 reads that flag and swaps
 * render_a2ui for `generate_a2ui`, which hands the UI to a second LLM (a
 * subagent writing A2UI from a prose description). Here the concierge writes
 * the A2UI itself.
 */
function withRenderTool(input: RunAgentInput): RunAgentInput {
  return {
    ...input,
    tools: [...input.tools.filter((tool) => tool.name !== RENDER_A2UI_TOOL.name), RENDER_A2UI_TOOL],
    context: [...input.context, { description: `How to call ${RENDER_A2UI_TOOL.name}`, value: RENDER_A2UI_TOOL_GUIDELINES(RENDER_A2UI_TOOL.name) }],
  };
}

// ---------------------------------------------------------------------------
// Hotel REST API (mocked, in memory)
// ---------------------------------------------------------------------------

async function hotelRoute(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> {
  if (req.method === 'GET' && path === '/api/openapi.json') return send(res, 200, hotelApi);
  if (req.method === 'GET' && path === '/api/bookings') return send(res, 200, listBookings());
  if (req.method === 'POST' && path === '/api/bookings') return send(res, 201, createBooking(await readJson(req)));
  const bookingId = /^\/api\/bookings\/([^/]+)$/.exec(path)?.[1];
  if (req.method === 'PATCH' && bookingId) return send(res, 200, updateBooking(decodeURIComponent(bookingId), await readJson(req)));
  if (req.method === 'POST' && path === '/api/payments') return send(res, 201, createPayment(await readJson(req)));
  if (req.method === 'POST' && path === '/api/availability') return send(res, 200, checkAvailability(await readJson(req)));

  send(res, 404, { error: `No route for ${req.method} ${path}` });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = '';
  for await (const chunk of req) body += chunk;
  try {
    return JSON.parse(body || 'null');
  } catch {
    throw new ApiError(400, ['The request body is not valid JSON.']);
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`Hotel Aurora server on http://localhost:${PORT} — POST /agui (AG-UI + A2UI), /api/* (mock hotel API)`);
  console.log(MOCK ? 'Model: scripted mock (MOCK_AGENT=1)' : `Model: anthropic/${MODEL_ID}`);
  if (!MOCK && !process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY is not set — add it to .env, or run `npm run dev:mock` to try the demo without one.');
  }
});
