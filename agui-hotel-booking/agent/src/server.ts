import './env.js'; // must stay the first import — populates process.env from .env/key files
import { createServer } from 'node:http';
import { EventEncoder } from '@ag-ui/encoder';
import { EventType, RunAgentInputSchema } from '@ag-ui/core';
import type { BaseEvent } from '@ag-ui/core';
import { runAgent } from './agent.js';
import { runMockAgent } from './mock.js';

const PORT = Number(process.env.PORT ?? 8000);
const MOCK = process.env.MOCK_AGENT === '1';

const server = createServer(async (req, res) => {
  // CORS — the Angular dev server runs on another origin (localhost:4200).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url?.split('?')[0] !== '/awp') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. POST AG-UI RunAgentInput to /awp.');
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let input;
  try {
    input = RunAgentInputSchema.parse(JSON.parse(body));
  } catch (error) {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Invalid RunAgentInput: ${String(error)}` }));
    return;
  }

  const encoder = new EventEncoder();
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const emit = (event: BaseEvent) => {
    res.write(encoder.encodeSSE(event));
  };

  console.log(`[server] run ${input.runId} (thread ${input.threadId}) — ${input.messages.length} messages`);

  emit({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId } as BaseEvent);
  try {
    await (MOCK ? runMockAgent(input, emit) : runAgent(input, emit));
    emit({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId } as BaseEvent);
  } catch (error) {
    console.error('[server] run failed:', error);
    emit({
      type: EventType.RUN_ERROR,
      message: error instanceof Error ? error.message : String(error),
    } as BaseEvent);
  }
  res.end();
});

server.listen(PORT, () => {
  const mode = MOCK ? 'mock agent (no LLM)' : `model: ${process.env.AGENT_MODEL ?? 'claude-sonnet-5'}`;
  console.log(`AG-UI agent server listening on http://localhost:${PORT}/awp (${mode})`);
  if (!MOCK && !process.env.ANTHROPIC_API_KEY) {
    console.warn(
      'ANTHROPIC_API_KEY is not set — the SDK will fall back to other credential sources if configured. ' +
        'Tip: run with MOCK_AGENT=1 to try the demo without an API key.',
    );
  }
});
