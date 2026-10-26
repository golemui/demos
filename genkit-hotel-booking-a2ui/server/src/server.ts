import './env.js'; // must stay the first import — populates process.env from .env/key files
import express, { type Request, type Response } from 'express';
import { expressHandler } from '@genkit-ai/express';
import { hotelApi } from '@hotel/shared';
import { concierge, MOCK, MODEL_ID } from './agents';
import { ApiError, checkAvailability, createBooking, createPayment, listBookings, updateBooking } from './hotel-service';

const PORT = Number(process.env.SERVER_PORT ?? 8000);

/**
 * One process, two faces (the Angular dev server proxies /api):
 *  - POST /api/agent — the Genkit agent, served as-is by @genkit-ai/express
 *    (the browser talks to it with `remoteAgent`).
 *  - /api/hotel/* — the (mocked) hotel REST API described by the OpenAPI contract.
 */
const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/api/agent', expressHandler(concierge));

const route = (handler: (req: Request) => unknown, status = 200) => (req: Request, res: Response) => {
  try {
    res.status(status).json(handler(req));
  } catch (error) {
    if (error instanceof ApiError) res.status(error.status).json({ problems: error.problems });
    else {
      console.error('[api]', error);
      res.status(500).json({ error: String(error) });
    }
  }
};

app.get('/api/hotel/openapi.json', route(() => hotelApi));
app.get('/api/hotel/bookings', route(() => listBookings()));
app.post('/api/hotel/bookings', route((req) => createBooking(req.body), 201));
app.patch('/api/hotel/bookings/:bookingId', route((req) => updateBooking(String(req.params['bookingId']), req.body)));
app.post('/api/hotel/availability', route((req) => checkAvailability(req.body)));
app.post('/api/hotel/payments', route((req) => createPayment(req.body), 201));

app.listen(PORT, () => {
  console.log(`Hotel Aurora server on http://localhost:${PORT} — /api/agent (Genkit), /api/hotel/* (mock API)`);
  console.log(MOCK ? 'Model: scripted mock (MOCK_AGENT=1)' : `Model: anthropic/${MODEL_ID}`);
  if (!MOCK && !process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY is not set — add it to .env, or run `npm run dev:mock` to try the demo without one.');
  }
});
