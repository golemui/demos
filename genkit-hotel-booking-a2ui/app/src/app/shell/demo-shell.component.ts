import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FAVICON, WORDMARK_DARK, WORDMARK_LIGHT } from './brand';

type Theme = 'clay-auto' | 'clay' | 'clay-dark';
const ORDER: Theme[] = ['clay-auto', 'clay', 'clay-dark'];
const LABEL: Record<Theme, string> = { 'clay-auto': 'Auto', clay: 'Light', 'clay-dark': 'Dark' };
const ICON: Record<Theme, string> = { 'clay-auto': 'brightness_auto', clay: 'light_mode', 'clay-dark': 'dark_mode' };
const STORAGE_KEY = 'golemui-demo-theme';

/**
 * The GolemUI demo chrome, Angular edition of /shared/DemoShell.tsx: the
 * wordmark, the demo name, and the Clay theme switcher (data-theme on <html>).
 */
@Component({
  selector: 'demo-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="demo-shell">
      <header class="demo-shell__header">
        <a class="demo-shell__brand" href="https://golemui.com/" target="_blank" rel="noreferrer">
          <img class="demo-shell__logo demo-shell__logo--light" [src]="wordmarkLight" alt="GolemUI" width="142" height="28" />
          <img class="demo-shell__logo demo-shell__logo--dark" [src]="wordmarkDark" alt="" aria-hidden="true" width="142" height="28" />
        </a>
        <span class="demo-shell__demo-name">{{ demoName() }}</span>
        <button type="button" class="demo-shell__toggle" (click)="cycle()" [attr.aria-label]="'Switch theme (currently ' + label() + ')'">
          <span class="material-icons" aria-hidden="true">{{ icon() }}</span>
          <span class="demo-shell__toggle-label">{{ label() }}</span>
        </button>
      </header>
      <main class="demo-shell__main"><ng-content /></main>
    </div>
  `,
})
export class DemoShellComponent implements OnInit {
  readonly demoName = input.required<string>();
  protected readonly wordmarkLight = WORDMARK_LIGHT;
  protected readonly wordmarkDark = WORDMARK_DARK;
  private readonly theme = signal<Theme>('clay-auto');
  protected readonly label = () => LABEL[this.theme()];
  protected readonly icon = () => ICON[this.theme()];

  ngOnInit(): void {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage blocked
    }
    this.apply(ORDER.includes(stored as Theme) ? (stored as Theme) : 'clay-auto');
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.head.appendChild(document.createElement('link'));
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.href = FAVICON;
  }

  protected cycle(): void {
    const next = ORDER[(ORDER.indexOf(this.theme()) + 1) % ORDER.length];
    this.apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice just doesn't persist
    }
  }

  private apply(theme: Theme): void {
    this.theme.set(theme);
    document.documentElement.setAttribute('data-theme', theme);
  }
}
