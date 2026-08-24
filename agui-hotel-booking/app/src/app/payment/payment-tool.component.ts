import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormComponent } from '@golemui/gui-angular';
import type { FormSubmitEvent } from '@golemui/core';
import type { ToolCall } from '@ag-ui/core';
import { buildCheckoutConfig } from './checkout-form';
import { digitsOnly, getBrand } from './card-brands';
import { PaymentSuccessComponent } from './payment-success.component';

export interface PaymentResult {
  status: 'paid';
  amount: number;
  brand: string;
  last4: string;
}

/**
 * Renders a `collect_payment` tool call as the animated card checkout.
 *
 * This is the third kind of tool surface in the demo, next to LLM-authored
 * forms (render_form) and schema-derived approval forms (confirm_booking):
 * a HAND-CRAFTED surface for a tool that deserves one. The form definition is
 * the same `gui.*` data used by the React credit-card demo; only the custom
 * widget loaders point at Angular components.
 *
 * Nothing sensitive reaches the agent: the tool result carries the brand and
 * last4 only — the PAN/CVV live and die in the browser (and in a real product
 * would go straight to your PSP).
 */
@Component({
  selector: 'app-payment-tool',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The checkout styles must reach the custom widgets rendered inside
  // <gui-form>, which are separate components — hence no encapsulation.
  encapsulation: ViewEncapsulation.None,
  imports: [FormComponent, PaymentSuccessComponent],
  template: `
    <div class="payment checkout">
      @if (paid(); as result) {
        <div class="checkout__card">
          <app-payment-success [amount]="amountLabel()" />
        </div>
      } @else if (completed()) {
        <div class="checkout__card payment__done">✓ Payment completed — {{ amountLabel() }}</div>
      } @else {
        <div class="checkout__card">
          <div class="payment__header">
            <span class="payment__badge">Secure payment</span>
            {{ reference() }} · <strong>{{ amountLabel() }}</strong>
          </div>
          <div class="checkout__stage">
            <gui-form [config]="config()" (formSubmit)="onPay($event)" />
          </div>
          <p class="checkout__footnote">
            Demo checkout — no real charge. Try 4242 4242 4242 4242, any future
            expiry, any CVC.
          </p>
        </div>
      }
    </div>
  `,
  styles: `
    /* ======= checkout chrome (scoped by .payment / .checkout) ======= */
    .payment {
      --surface: #fff;
      --ink: #1b1b22;
      --ink-soft: #5d5d66;
      --line: #e3e3e8;
      --line-strong: #c9c9d4;
      --brand-color: #2f5cff;
      --brand-press: #2449cc;
      --danger: #b42318;
      --field-bg: #fafafc;
      --muted: #8a8a94;
      --radius: 12px;
      margin-top: 0.5rem;
    }

    .checkout__card {
      position: relative;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 20px;
      overflow: hidden;
    }

    .payment__header {
      margin-bottom: 14px;
      color: var(--ink-soft);
    }
    .payment__done { color: #1a7f37; font-weight: 500; }
    .payment__badge {
      display: inline-block;
      background: #e8f5ee;
      color: #1a7f37;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-radius: 999px;
      padding: 0.15rem 0.6rem;
      margin-right: 0.5rem;
    }

    .checkout__stage form,
    .checkout__stage > div {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .checkout__footnote {
      margin: 14px 4px 0;
      text-align: center;
      font-size: 11.5px;
      color: var(--muted);
      line-height: 1.5;
    }

    /* ======= fields ======= */
    .payment .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .payment .field__label { font-size: 12.5px; font-weight: 600; color: var(--ink-soft); }
    .payment .field__control {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--field-bg);
      border: 1.5px solid var(--line);
      border-radius: 11px;
      padding: 0 12px;
      height: 46px;
      transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    }
    .payment .field__control:focus-within {
      border-color: var(--brand-color);
      background: var(--surface);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-color) 16%, transparent);
    }
    .payment .field__control--error {
      border-color: var(--danger);
      box-shadow: 0 0 0 4px rgba(229, 72, 77, 0.12);
    }
    .payment .field__icon { color: var(--muted); font-size: 19px; }
    .payment .field__input {
      flex: 1;
      min-width: 0;
      border: none;
      outline: none;
      background: transparent;
      font-size: 15px;
      font-family: inherit;
      color: var(--ink);
      letter-spacing: 0.01em;
    }
    .payment .field__input::placeholder { color: var(--muted); letter-spacing: 0.06em; }
    .payment .field__brand { display: flex; align-items: center; height: 20px; }
    .payment .field__error { font-size: 12px; color: var(--danger); font-weight: 500; }
    .payment .brandmark { height: 18px; width: auto; display: block; }

    /* ======= pay button (GolemUI built-in) ======= */
    .payment .checkout__stage .gui-button button.gui-button {
      position: relative;
      width: 100%;
      margin-top: 4px;
      min-height: 50px;
      border: none;
      border-radius: 12px;
      background: var(--brand-color);
      color: #fff;
      font-family: inherit;
      font-size: 15.5px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.15s ease, transform 0.08s ease, opacity 0.2s ease;
      box-shadow: 0 10px 24px -10px rgba(47, 92, 255, 0.7);
    }
    .payment .checkout__stage .gui-button button.gui-button:hover:not(:disabled) { background: var(--brand-press); }
    .payment .checkout__stage .gui-button button.gui-button:active:not(:disabled) { transform: translateY(1px); }
    .payment .checkout__stage .gui-button button.gui-button:disabled {
      background: #c7cbe0;
      color: #fff;
      box-shadow: none;
      cursor: not-allowed;
      opacity: 0.85;
    }
    .payment .gui-widget-icon[data-icon]::before {
      font-family: 'Material Icons';
      content: attr(data-icon);
      font-size: 18px;
      line-height: 1;
      font-weight: normal;
    }
    .payment .checkout__stage .gui-button button.gui-button .gui-widget-icon { color: #fff; }

    /* ======= card preview ======= */
    .payment .cardpreview {
      margin-bottom: 6px;
      perspective: 1400px;
      display: flex;
      justify-content: center;
    }
    .payment .card { width: 70%; aspect-ratio: 1.586 / 1; position: relative; }
    .payment .card__inner { position: absolute; inset: 0; transform-style: preserve-3d; will-change: transform; }
    .payment .card__face {
      position: absolute;
      inset: 0;
      border-radius: 16px;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
      color: #fff;
      overflow: hidden;
      box-shadow: 0 18px 40px -16px rgba(8, 12, 30, 0.7);
      background-size: cover;
    }
    .payment .card__face--front { padding: 20px 22px; display: flex; flex-direction: column; }
    .payment .card__face--back { transform: rotateY(180deg); }
    .payment .card__sheen {
      position: absolute;
      inset: 0;
      background: linear-gradient(125deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 38%);
      pointer-events: none;
    }
    .payment .card__top { display: flex; align-items: center; justify-content: space-between; }
    .payment .card__chip {
      width: 44px; height: 33px; border-radius: 7px;
      background: linear-gradient(135deg, #f7d77b 0%, #e0b04a 50%, #f7d77b 100%);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12);
      position: relative;
    }
    .payment .card__chip::after {
      content: ''; position: absolute; inset: 6px 10px;
      border: 1px solid rgba(120, 84, 12, 0.5); border-radius: 3px;
    }
    .payment .card__brand { height: 26px; display: flex; align-items: center; }
    .payment .card__brand .brandmark { height: 24px; }
    .payment .card__brand--back { position: absolute; bottom: 16px; right: 18px; height: 22px; }
    .payment .card__number {
      margin-top: auto;
      font-size: clamp(18px, 3vw, 23px);
      font-weight: 500;
      letter-spacing: 0.12em;
      font-variant-numeric: tabular-nums;
      text-shadow: 0 1px 3px rgba(0,0,0,0.35);
      padding-bottom: 14px;
    }
    .payment .card__bottom { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
    .payment .card__caption {
      display: block; font-size: 8.5px; letter-spacing: 0.12em;
      text-transform: uppercase; opacity: 0.7; margin-bottom: 3px;
    }
    .payment .card__value {
      font-size: 13.5px; font-weight: 600; letter-spacing: 0.04em;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .payment .card__holder { min-width: 0; flex: 1; }
    .payment .card__frontcode { text-align: right; }
    .payment .card__magstripe { position: absolute; top: 22px; left: 0; right: 0; height: 42px; background: #1b1b1f; }
    .payment .card__signature { position: absolute; top: 82px; left: 18px; right: 18px; display: flex; align-items: center; }
    .payment .card__signature-band {
      flex: 1; height: 34px; border-radius: 4px;
      background: repeating-linear-gradient(-50deg, #f4f4f4 0 8px, #e7e7ea 8px 16px);
    }
    .payment .card__cvv {
      min-width: 56px; height: 34px; margin-left: 8px; border-radius: 4px;
      background: #fff; color: #1a1a1a; font-weight: 700; letter-spacing: 0.16em;
      display: flex; align-items: center; justify-content: center;
      font-variant-numeric: tabular-nums;
    }
    .payment .card__code-label {
      position: absolute; top: 122px; right: 18px; font-size: 9px;
      letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.8;
    }

    /* ======= success ======= */
    .payment .success { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 26px 10px 14px; }
    .payment .success__badge { margin-bottom: 18px; }
    .payment .success__ring { fill: none; stroke: #29b46e; stroke-width: 5; opacity: 0.28; }
    .payment .success__check { stroke: #1aa45a; stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; }
    .payment .success__title { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--ink); }
    .payment .success__amount { margin: 0; color: var(--ink-soft); font-size: 14px; }
  `,
})
export class PaymentToolComponent {
  readonly toolCall = input.required<ToolCall>();
  readonly completed = input(false);

  readonly done = output<PaymentResult>();

  /** amount + reference proposed by the agent's tool call. */
  protected readonly args = computed<{ amount: number; reference: string }>(() => {
    try {
      const parsed = JSON.parse(this.toolCall().function.arguments || '{}');
      return { amount: Number(parsed.amount) || 0, reference: String(parsed.reference ?? '') };
    } catch {
      return { amount: 0, reference: '' };
    }
  });

  protected readonly amountLabel = computed(() => `€${this.args().amount.toFixed(2)}`);
  protected readonly reference = computed(() => this.args().reference || 'Booking');
  protected readonly config = computed(() => buildCheckoutConfig(this.amountLabel()));

  protected readonly paid = signal<PaymentResult | null>(null);

  protected onPay(event: FormSubmitEvent): void {
    // Submit only fires when the whole form passes the card validators.
    const data = event.data as { card?: { number?: string } };
    const number = digitsOnly(data.card?.number ?? '');
    const result: PaymentResult = {
      status: 'paid',
      amount: this.args().amount,
      brand: getBrand(number).id,
      last4: number.slice(-4),
    };
    this.paid.set(result);
    this.done.emit(result);
  }
}
