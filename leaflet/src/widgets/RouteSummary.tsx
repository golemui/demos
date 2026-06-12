import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { WithWidget, DisplayWidget } from '@golemui/core';
import { useDisplayWdiget } from '@golemui/react';

interface RouteSummaryProps {
  md?: string;
}

/**
 * Custom DISPLAY widget that renders markdown to sanitized HTML.
 *
 * We render it ourselves (GFM via marked, sanitized with DOMPurify) because the
 * built-in `markdownText` shortcut emits a MARKDOWN_TEXTS item that the React
 * adapter (gui-react 0.17.0) has no handler for. CUSTOM_DISPLAY is supported,
 * so this is the robust path — and its `md` prop is reactive.
 */
export function RouteSummary(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as DisplayWidget;
  const { uid, templateData } = useDisplayWdiget<RouteSummaryProps>(widget);

  const md = templateData.md ?? '';
  const html = DOMPurify.sanitize(
    marked.parse(md, { async: false, gfm: true }) as string,
  );

  return (
    <div className="summary" style={{ flex: templateData.size }}>
      <div
        id={uid}
        className="summary__body"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
