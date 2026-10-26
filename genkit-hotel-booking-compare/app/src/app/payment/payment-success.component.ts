import { ChangeDetectionStrategy, Component, input, viewChild } from '@angular/core';
import type { AfterViewInit, ElementRef } from '@angular/core';
import { gsap } from 'gsap';

/**
 * Terminal "payment completed" screen. The tick is a single SVG path whose
 * stroke is drawn on with GSAP (stroke-dashoffset) followed by a small bounce
 * on the badge.
 */
@Component({
  selector: 'app-payment-success',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="success">
      <div class="success__badge" #badge>
        <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
          <circle cx="50" cy="50" r="46" class="success__ring" />
          <path #check class="success__check" d="M28 51 L44 67 L73 35" fill="none" />
        </svg>
      </div>
      <div class="success__text" #text>
        <h2 class="success__title">Payment completed</h2>
        <p class="success__amount">{{ amount() }} charged successfully</p>
      </div>
    </div>
  `,
})
export class PaymentSuccessComponent implements AfterViewInit {
  readonly amount = input.required<string>();

  private readonly badge = viewChild<ElementRef<HTMLDivElement>>('badge');
  private readonly check = viewChild<ElementRef<SVGPathElement>>('check');
  private readonly text = viewChild<ElementRef<HTMLDivElement>>('text');

  ngAfterViewInit(): void {
    const check = this.check()?.nativeElement;
    const badge = this.badge()?.nativeElement;
    const text = this.text()?.nativeElement;
    if (!check || !badge || !text) return;

    const len = check.getTotalLength();
    gsap.set(check, { strokeDasharray: len, strokeDashoffset: len });
    gsap.set(badge, { scale: 0.6, opacity: 0 });
    gsap.set(text, { y: 14, opacity: 0 });

    const tl = gsap.timeline();
    tl.to(badge, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' })
      .to(check, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, '-=0.1')
      .to(badge, { scale: 1.08, duration: 0.16, yoyo: true, repeat: 1, ease: 'sine.inOut' })
      .to(text, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }, '-=0.2');
  }
}
