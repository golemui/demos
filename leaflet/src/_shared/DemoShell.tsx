/* AUTO-GENERATED from shared/DemoShell.tsx — edit there and run `npm run sync`. Do not edit here. */
import { useEffect, type ReactNode } from 'react';
import { FAVICON, WORDMARK_DARK, WORDMARK_LIGHT } from './brand';
import { ThemeToggle } from './ThemeToggle';
import './shell.css';

interface DemoShellProps {
  /** Name of the specific demo, shown next to the logo. */
  demoName: string;
  children: ReactNode;
}

/**
 * Shared chrome for every GolemUI demo: the GolemUI wordmark, the demo name and
 * the theme switcher, over GolemUI's bundled Clay theme (terracotta on cream,
 * warm brown in dark mode). Drop the demo's content in as children.
 */
export function DemoShell({ demoName, children }: DemoShellProps) {
  useEffect(() => {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.appendChild(icon);
    }
    icon.type = 'image/svg+xml';
    icon.href = FAVICON;
  }, []);

  return (
    <div className="demo-shell">
      <header className="demo-shell__header">
        <a className="demo-shell__brand" href="https://golemui.com/" target="_blank" rel="noreferrer">
          {/* Two variants of the wordmark; shell.css shows the one that fits the theme. */}
          <img className="demo-shell__logo demo-shell__logo--light" src={WORDMARK_LIGHT} alt="GolemUI" width="142" height="28" />
          <img className="demo-shell__logo demo-shell__logo--dark" src={WORDMARK_DARK} alt="" aria-hidden="true" width="142" height="28" />
        </a>

        <span className="demo-shell__demo-name">{demoName}</span>

        <ThemeToggle />
      </header>

      <main className="demo-shell__main">{children}</main>
    </div>
  );
}
