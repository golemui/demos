import type { ComponentType } from 'react';

/**
 * A tool surface: the UI that renders ONE frontend tool call in the chat and
 * answers it. The chat stays generic — it looks the component up by tool name
 * in a registry the app provides:
 *
 *   ask_user        → form sliced from the contract-generated form
 *   confirm_booking → editable review + live price (the harness)
 *   collect_payment → hand-crafted animated checkout
 */
export interface ToolSurfaceProps<Args = Record<string, unknown>> {
  toolCallId: string;
  args: Args;
  /** The submitted result once the call is answered (the surface shows its "done" state). */
  result: unknown;
  /** Answer the call: becomes the tool message, and the agent run continues. */
  respond: (result: unknown) => void;
}

export type ToolSurfaceRegistry = Record<string, ComponentType<ToolSurfaceProps<any>>>;
