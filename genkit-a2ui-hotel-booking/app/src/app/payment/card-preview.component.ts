import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import type { AfterViewInit, ElementRef, OnInit } from '@angular/core';
import { gsap } from 'gsap';
import { DisplayWidgetAdapter } from '@golemui/angular';
import type { DisplayWidget } from '@golemui/core';
import { getBrand, maskedDisplay } from './card-brands';
import { cardFlipped } from './flip-store';
import { BrandMarkComponent } from './brand-mark.component';

interface Props {
  number?: string;
  name?: string;
  expiry?: string;
  cvv?: string;
}

/**
 * Read-only display widget that draws the live card. Card *data* arrives via
 * runtime-function props (number/name/expiry/cvv read from $form), so it stays
 * in sync as the user types — zero event wiring. The flip is driven by the
 * shared `cardFlipped` signal and animated with GSAP — to the back for most
 * brands, with a front-code pulse for Amex (whose code is on the front).
 */
@Component({
  selector: 'app-card-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DisplayWidgetAdapter],
  imports: [BrandMarkComponent],
  template: `
    @let td = adapter.templateData();
    <div class="cardpreview" [style.flex]="td.size">
      <div class="card" #root>
        <div class="card__inner" #inner>
          <!-- FRONT -->
          <div class="card__face card__face--front" [style.backgroundImage]="brand().gradient">
            <div class="card__sheen"></div>
            <div class="card__top">
              <div class="card__chip"></div>
              <div class="card__brand">
                <app-brand-mark [brand]="brand().id" [light]="true" />
              </div>
            </div>

            <div class="card__number" [id]="widget.uid">{{ displayNumber() }}</div>

            <div class="card__bottom">
              <div class="card__holder">
                <span class="card__caption">Card holder</span>
                <span class="card__value">{{ holder() || 'YOUR NAME' }}</span>
              </div>
              <div class="card__expiry">
                <span class="card__caption">Expires</span>
                <span class="card__value">{{ td.expiry || 'MM/YY' }}</span>
              </div>
              @if (brand().codeOnFront) {
                <div class="card__frontcode" #frontCode>
                  <span class="card__caption">{{ brand().codeLabel }}</span>
                  <span class="card__value">{{ td.cvv || '••••' }}</span>
                </div>
              }
            </div>
          </div>

          <!-- BACK -->
          <div class="card__face card__face--back" [style.backgroundImage]="brand().gradient">
            <div class="card__magstripe"></div>
            <div class="card__signature">
              <span class="card__signature-band"></span>
              <span class="card__cvv">{{ td.cvv || maskDots() }}</span>
            </div>
            <span class="card__code-label">{{ brand().codeLabel }}</span>
            <div class="card__brand card__brand--back">
              <app-brand-mark [brand]="brand().id" [light]="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CardPreviewComponent implements OnInit, AfterViewInit {
  widget!: DisplayWidget;
  protected readonly adapter = inject(DisplayWidgetAdapter<Props>);

  private readonly root = viewChild<ElementRef<HTMLDivElement>>('root');
  private readonly inner = viewChild<ElementRef<HTMLDivElement>>('inner');
  private readonly frontCode = viewChild<ElementRef<HTMLDivElement>>('frontCode');

  protected readonly brand = computed(() => getBrand(this.adapter.templateData().number ?? ''));
  protected readonly displayNumber = computed(() =>
    maskedDisplay(this.adapter.templateData().number ?? '', this.brand()),
  );
  protected readonly holder = computed(() =>
    (this.adapter.templateData().name ?? '').toString().toUpperCase(),
  );
  protected readonly maskDots = computed(() => '•'.repeat(this.brand().codeSize));

  constructor() {
    // Flip animation. Amex keeps its face and pulses the front code instead.
    effect(() => {
      const flipped = cardFlipped();
      const codeOnFront = this.brand().codeOnFront;
      const inner = this.inner()?.nativeElement;
      if (!inner) return;
      if (codeOnFront) {
        gsap.to(inner, { rotationY: 0, duration: 0.5, ease: 'power2.inOut' });
        const front = this.frontCode()?.nativeElement;
        if (front && flipped) {
          gsap.fromTo(
            front,
            { scale: 1 },
            { scale: 1.12, repeat: 1, yoyo: true, duration: 0.4, ease: 'sine.inOut' },
          );
        }
      } else {
        gsap.to(inner, { rotationY: flipped ? 180 : 0, duration: 0.6, ease: 'power2.inOut' });
      }
    });
  }

  ngOnInit(): void {
    this.adapter.init(this.widget);
  }

  ngAfterViewInit(): void {
    const root = this.root()?.nativeElement;
    if (!root) return;
    gsap.fromTo(
      root,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', clearProps: 'opacity,transform' },
    );
  }
}
