import type { ReactNode } from 'react';
import { ThemeToggle } from './ThemeToggle';
import './shell.css';

interface DemoShellProps {
  /** Name of the specific demo, shown as the header subheading. */
  demoName: string;
  children: ReactNode;
}

/**
 * Shared chrome for every GolemUI demo: a common header (brand logo + product
 * line + theme switcher) and a fixed-width main container. Drop the demo's
 * content in as children.
 */
export function DemoShell({ demoName, children }: DemoShellProps) {
  return (
    <div className="demo-shell">
      <header className="demo-shell__header">
        <a
          className="demo-shell__brand"
          href="https://golemui.com/"
          target="_blank"
          rel="noreferrer"
        >
          {/* {gui.} lockup — the `gui.` glyph inherits `currentColor` (the header
              text color) so it flips black/white with the theme, while the
              braces keep the brand gradient. */}
          <svg
            className="demo-shell__logo"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 400 220"
            role="img"
            aria-label="GolemUI"
          >
            <defs>
              <linearGradient id="header-brand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#a855f7" />
              </linearGradient>
            </defs>
            <text
              x="200"
              y="170"
              fontFamily="Inter, system-ui, -apple-system, sans-serif"
              fontWeight="600"
              fontSize="160"
              textAnchor="middle"
              letterSpacing="-2"
            >
              <tspan fill="url(#header-brand)">{'{'}</tspan>
              <tspan fill="currentColor">gui.</tspan>
              <tspan fill="url(#header-brand)">{'}'}</tspan>
            </text>
          </svg>
          <span className="demo-shell__brand-title">
            GolemUI — The Declarative Form Engine
          </span>
        </a>

        <span className="demo-shell__demo-name">{demoName}</span>

        <ThemeToggle />
      </header>

      <main className="demo-shell__main">{children}</main>
    </div>
  );
}
