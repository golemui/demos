import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { TypeSafeClient } from '@typesafe-ai/sdk';

/**
 * The demo's entire backend: `POST /api/systemone`, served by Vite's dev server.
 *
 * It exists for one reason — the TypeSafe API key must never reach the browser.
 * The page sends `{ state, questions }` (exactly the TypeSafe request shape) and
 * gets the TypeSafe response back untouched, so all the interesting logic stays
 * in `src/`, where you can read it.
 */
export function typesafeEndpoint(apiKey: string | undefined): Plugin {
  return {
    name: 'typesafe-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/systemone', async (req, res) => {
        if (req.method !== 'POST') return reply(res, 405, { error: 'POST only' });
        if (!apiKey) {
          return reply(res, 500, {
            error: 'TYPESAFE_API_KEY is not set. Copy .env.example to .env and add your key.',
          });
        }

        try {
          const { state, questions } = JSON.parse(await readBody(req));
          const client = new TypeSafeClient({ apiKey });
          const result = await client.systemOne({ state, questions });
          reply(res, 200, result);
        } catch (error) {
          reply(res, 502, { error: error instanceof Error ? error.message : String(error) });
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
