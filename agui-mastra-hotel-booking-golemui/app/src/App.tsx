import { FRONTEND_TOOLS } from '@hotel/shared';
import { DemoShell } from './_shared/DemoShell';
import { createAgentStore } from './agui/agentStore';
import { ChatPanel } from './agui/ChatPanel';
import type { ToolSurfaceRegistry } from './agui/toolSurfaces';
import { apiLog } from './api/hotelApi';
import { Inspector } from './inspector/Inspector';
import { AskUserSurface } from './tools/AskUserSurface';
import { ConfirmBookingSurface } from './tools/ConfirmBookingSurface';
import { PaymentSurface } from './tools/PaymentSurface';

/** The AG-UI endpoint (proxied by Vite to the Mastra server), with the frontend tools the app runs. */
const store = createAgentStore('/agui', FRONTEND_TOOLS);

/** Which component answers which frontend tool. Everything else is a server tool. */
const surfaces: ToolSurfaceRegistry = {
  ask_user: AskUserSurface,
  confirm_booking: ConfirmBookingSurface,
  collect_payment: PaymentSurface,
};

const SUGGESTIONS = [
  'Book a room for 2 people next week, half board',
  'We are 6 people and travel with a baby, need parking',
  'I need a room',
];

export default function App() {
  function restart() {
    store.reset();
    apiLog.clear();
  }

  return (
    <DemoShell demoName="Hotel concierge · AG-UI × Mastra × GolemUI">
      <div className="layout">
        <div className="layout__chat">
          <div className="layout__toolbar">
            <span>The agent decides what to ask; the forms come from the hotel’s OpenAPI.</span>
            <button type="button" className="button button--ghost" onClick={restart}>
              <span className="material-icons">restart_alt</span> New chat
            </button>
          </div>
          <ChatPanel
            store={store}
            surfaces={surfaces}
            suggestions={SUGGESTIONS}
            blurb="Tell me about your stay. I’ll ask with forms generated from our booking API."
          />
        </div>
        <Inspector store={store} />
      </div>
    </DemoShell>
  );
}
