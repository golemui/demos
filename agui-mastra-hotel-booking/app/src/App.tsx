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

/** The AG-UI endpoint (proxied by Vite to the Mastra server) + the tools the browser implements. */
const agent = createAgentStore('/agui', FRONTEND_TOOLS);

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
    agent.reset();
    apiLog.clear();
  }

  return (
    <DemoShell demoName="Hotel concierge · AG-UI × Mastra">
      <div className="layout">
        <div className="layout__chat">
          <div className="layout__toolbar">
            <span>Forms generated from the hotel's OpenAPI · the agent only decides what to ask</span>
            <button type="button" className="button button--ghost" onClick={restart}>
              <span className="material-icons">restart_alt</span> New chat
            </button>
          </div>
          <ChatPanel store={agent} surfaces={surfaces} suggestions={SUGGESTIONS} />
        </div>
        <Inspector store={agent} />
      </div>
    </DemoShell>
  );
}
