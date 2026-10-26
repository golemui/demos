import { DemoShell } from './_shared/DemoShell';
import { createAgentStore } from './agui/agentStore';
import { ChatPanel } from './agui/ChatPanel';
import { Inspector } from './inspector/Inspector';

/**
 * The AG-UI endpoint (proxied by Vite to the Mastra server). The app declares
 * no tools: the only UI tool is render_a2ui, which the server-side A2UI
 * middleware adds to every run.
 */
const store = createAgentStore('/agui');

const SUGGESTIONS = [
  'Book a room for 2 people next week, half board',
  'We are 6 people and travel with a baby, need parking',
  'We are 2 people, a slider for guests please',
];

export default function App() {
  return (
    <DemoShell demoName="Hotel concierge · A2UI over AG-UI × Mastra">
      <div className="layout">
        <div className="layout__chat">
          <div className="layout__toolbar">
            <span>The agent designs every form with A2UI’s basic catalog.</span>
            <button type="button" className="button button--ghost" onClick={() => store.reset()}>
              <span className="material-icons">restart_alt</span> New chat
            </button>
          </div>
          <ChatPanel
            store={store}
            suggestions={SUGGESTIONS}
            blurb="Tell me about your stay. I’ll design the forms we need as we go."
          />
        </div>
        <Inspector store={store} />
      </div>
    </DemoShell>
  );
}
