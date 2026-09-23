import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { TypeSafeClient } from '@typesafe-ai/sdk';
import { validateFormDefinition } from '@golemui/gui-mcp/json';

/**
 * The demo's entire backend, served by Vite's dev server:
 *
 *   POST /api/systemone  → forwards { state, questions } to TypeSafe (keeps the key server-side)
 *   POST /api/validate   → runs the GolemUI MCP server's JSON validator on a definition
 */
export function typesafeEndpoint(apiKey: string | undefined): Plugin {
  return {
    name: 'typesafe-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/systemone', async (req, res) => {
        if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' });
        if (!apiKey) {
          return reply(res, 500, { error: 'TYPESAFE_API_KEY is not set. Copy .env.example to .env and add your key.' });
        }
        try {
          const { state, questions } = JSON.parse(await readBody(req));
          const client = new TypeSafeClient({ apiKey });
          reply(res, 200, await client.systemOne({ state, questions }));
        } catch (error) {
          reply(res, 502, { error: error instanceof Error ? error.message : String(error) });
        }
      });

      server.middlewares.use('/api/validate', async (req, res) => {
        if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' });
        try {
          const formDefinition = JSON.parse(await readBody(req));
          reply(res, 200, validateFormDefinition({ formDefinition }));
        } catch (error) {
          reply(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      });
    },
  };
}

function reply(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
  });
}
