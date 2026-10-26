import { useState } from 'react';
import { FRONTEND_TOOLS, type Variant } from '@hotel/shared';
import { DemoShell } from './_shared/DemoShell';
import { createAgentStore } from './agui/agentStore';
import { ChatPanel } from './agui/ChatPanel';
import type { ToolSurfaceRegistry } from './agui/toolSurfaces';
import { apiLog } from './api/hotelApi';
import { Inspector } from './inspector/Inspector';
import { AskUserSurface } from './tools/AskUserSurface';
import { ConfirmBookingSurface } from './tools/ConfirmBookingSurface';
import { PaymentSurface } from './tools/PaymentSurface';

/**
 * One AG-UI endpoint per variant (proxied by Vite to the Mastra server). Only
 * the GolemUI variant declares frontend tools; the pure variant's only UI tool
 * is render_a2ui, which the server-side A2UI middleware adds.
 */
const stores = {
  pure: createAgentStore('/agui/pure', []),
  golem: createAgentStore('/agui/golem', FRONTEND_TOOLS),
};

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

const VARIANTS: Array<{ id: Variant; label: string; blurb: string }> = [
  { id: 'pure', label: 'A2UI', blurb: 'Pure A2UI: the agent designs every form with the basic catalog and relays the data to the API.' },
  { id: 'golem', label: 'GolemUI', blurb: 'GolemUI: the agent only decides what to ask; the forms come from the hotel’s OpenAPI.' },
];

export default function App() {
  const [active, setActive] = useState<Variant>('golem');

  function restart() {
    stores[active].reset();
    if (active === 'golem') apiLog.clear();
  }

  return (
    <DemoShell demoName="Hotel concierge · AG-UI × Mastra">
      <div className="layout">
        <div className="layout__chat">
          <div className="layout__toolbar">
            <div className="variant-tabs" role="tablist" aria-label="Variant">
              {VARIANTS.map((variant) => (
                <button
                  key={variant.id}
                  role="tab"
                  aria-selected={active === variant.id}
                  className={active === variant.id ? 'is-active' : ''}
                  onClick={() => setActive(variant.id)}
                >
                  {variant.label}
                </button>
              ))}
            </div>
            <button type="button" className="button button--ghost" onClick={restart}>
              <span className="material-icons">restart_alt</span> New chat
            </button>
          </div>
          {VARIANTS.map((variant) => (
            <ChatPanel
              key={variant.id}
              hidden={active !== variant.id}
              store={stores[variant.id]}
              surfaces={surfaces}
              suggestions={SUGGESTIONS}
              blurb={variant.blurb}
            />
          ))}
        </div>
        <Inspector store={stores[active]} variant={active} />
      </div>
    </DemoShell>
  );
}
