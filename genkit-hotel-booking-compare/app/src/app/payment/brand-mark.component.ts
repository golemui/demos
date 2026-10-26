import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { BrandId } from './card-brands';

/** Compact, recognisable brand marks rendered as inline SVG. */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (brand()) {
      @case ('visa') {
        <svg class="brandmark" viewBox="0 0 48 16" aria-label="Visa">
          <text x="0" y="13" font-family="Arial, sans-serif" font-weight="700" font-style="italic" font-size="15" [attr.fill]="light() ? '#fff' : '#1a1f71'">VISA</text>
        </svg>
      }
      @case ('mastercard') {
        <svg class="brandmark" viewBox="0 0 48 30" aria-label="Mastercard">
          <circle cx="19" cy="15" r="11" fill="#eb001b" />
          <circle cx="30" cy="15" r="11" fill="#f79e1b" />
          <path d="M24.5 6.4a11 11 0 0 0 0 17.2 11 11 0 0 0 0-17.2Z" fill="#ff5f00" />
        </svg>
      }
      @case ('amex') {
        <svg class="brandmark" viewBox="0 0 52 16" aria-label="American Express">
          <rect width="52" height="16" rx="2" [attr.fill]="light() ? 'rgba(255,255,255,.18)' : '#2e77bb'" />
          <text x="26" y="11.5" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="7" fill="#fff">AMEX</text>
        </svg>
      }
      @case ('discover') {
        <svg class="brandmark" viewBox="0 0 60 16" aria-label="Discover">
          <text x="0" y="12" font-family="Arial, sans-serif" font-weight="700" font-size="11" [attr.fill]="light() ? '#fff' : '#1a1a1a'">DISC</text>
          <circle cx="50" cy="8" r="6" fill="#f59e0b" />
        </svg>
      }
      @case ('unknown') {}
      @default {
        <svg class="brandmark" viewBox="0 0 60 16" aria-label="Card">
          <text x="0" y="12" font-family="Arial, sans-serif" font-weight="700" font-size="9" [attr.fill]="light() ? '#fff' : '#374151'">
            {{ brand().toUpperCase() }}
          </text>
        </svg>
      }
    }
  `,
})
export class BrandMarkComponent {
  readonly brand = input.required<BrandId>();
  readonly light = input(false);
}
