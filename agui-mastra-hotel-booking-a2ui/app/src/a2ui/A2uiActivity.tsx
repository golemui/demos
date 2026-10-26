import { useEffect, useMemo, useRef } from 'react';
import { A2uiSurface, type ReactCatalogComponent } from '@a2ui/react/v0_9';
import { MessageProcessor, type ActionPayload } from '@a2ui/web_core/v0_9';
import { basicCatalog, injectBasicCatalogStyles, setMarkdownRenderer } from '@a2ui/web_core/v0_9/basic_catalog';
import { renderMarkdown } from '@a2ui/markdown-it';
import type { A2uiUserAction } from '../agui/agentStore';

injectBasicCatalogStyles();
setMarkdownRenderer(renderMarkdown); // `Text` renders markdown (e.g. **Total**) only with a renderer installed

/**
 * The content of an `a2ui-surface` ACTIVITY message, as @ag-ui/a2ui-middleware
 * streams it: a lifecycle status while the agent is still writing the
 * render_a2ui call, then the A2UI operations once the components are complete.
 */
export interface A2uiActivityContent {
  status?: 'building' | 'retrying' | 'failed';
  progressTokens?: number;
  error?: string;
  errors?: Array<{ message: string }>;
  a2ui_operations?: unknown[];
}

interface A2uiActivityProps {
  content: A2uiActivityContent;
  /** The guest already acted on it (or wrote in the chat): the surface is stale. */
  answered: boolean;
  onAction: (action: A2uiUserAction) => void;
  /** The renderer (or the middleware) refused what the agent wrote. */
  onRejected: (reason: string) => void;
}

/**
 * One A2UI surface the agent designed, rendered by Google's React renderer with
 * the basic catalog (web components). Each activity gets its own
 * MessageProcessor: a surface the agent re-sends replaces the old one whole.
 */
export function A2uiActivity({ content, answered, onAction, onRejected }: A2uiActivityProps) {
  const onActionRef = useRef(onAction);
  onActionRef.current = onAction;
  const operations = content.a2ui_operations;
  const key = useMemo(() => JSON.stringify(operations ?? null), [operations]);

  const rendered = useMemo(() => {
    if (!operations) return null;
    const processor = new MessageProcessor<ReactCatalogComponent>([basicCatalog], (action: ActionPayload) =>
      onActionRef.current({
        name: action.name,
        surfaceId: action.surfaceId,
        sourceComponentId: action.sourceComponentId,
        timestamp: action.timestamp,
        context: action.context,
      }),
    );
    try {
      processor.processMessages(operations as never);
      const surface = [...processor.getSurfaces().values()][0];
      return surface ? { processor, surface } : { processor, error: 'The agent sent no surface.' };
    } catch (error) {
      return { processor, error: error instanceof Error ? error.message : String(error) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // No dispose() on cleanup: StrictMode's simulated unmount would tear down the
  // surface it just mounted. The processor has no timers or sockets; it goes with the component.

  const rejection =
    rendered && 'error' in rendered
      ? rendered.error
      : content.status === 'failed'
        ? (content.error ?? 'The interface could not be rendered.')
        : undefined;
  useEffect(() => {
    if (rejection) onRejected(rejection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejection]);

  if (rejection) {
    return (
      <div className="surface surface--done surface--error">
        <span className="material-icons">error_outline</span> Renderer rejected the surface: <code>{rejection}</code>
      </div>
    );
  }
  if (!rendered || !('surface' in rendered) || !rendered.surface) {
    const detail = content.status === 'retrying' ? `retrying — ${content.errors?.map((e) => e.message).join('; ')}` : `${content.progressTokens ?? 0} tokens`;
    return (
      <div className="tool-chip">
        <span className="material-icons">hourglass_top</span>The agent is writing the UI… <code>{detail}</code>
      </div>
    );
  }

  return (
    <div className={`surface a2ui-frame ${answered ? 'a2ui-frame--answered' : ''}`} inert={answered}>
      <div className="surface__header">
        <span className="surface__badge surface__badge--warn">render_a2ui</span>
        <code className="surface__meta">{rendered.surface.id}</code>
      </div>
      <A2uiSurface surface={rendered.surface} />
    </div>
  );
}
