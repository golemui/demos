import { useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { GuiForm } from '@golemui/gui-react';
import type { FormSubmitEvent } from '@golemui/core';
import type { ToolSurfaceProps } from '../agui/toolSurfaces';
import { ApiProblem, hotelApi } from '../api/hotelApi';
import { buildCheckoutConfig } from '../payment/checkoutForm';
import { digitsOnly, getBrand } from '../payment/lib/cardBrands';
import { flipStore } from '../payment/lib/flipStore';
import { PaymentSuccess } from '../payment/widgets/PaymentSuccess';
import { euros } from './format';

interface PaymentArgs {
  bookingId: string;
  amount: number;
}

type PaymentResult = { status: 'paid'; amount: number; brand: string; last4: string } | { status: 'cancelled' };

/**
 * `collect_payment` — a HAND-CRAFTED surface for the one tool that deserves it:
 * the animated card checkout from the credit-card demo (gui.* API + custom React
 * widgets), reused as-is. The agent only decides when to charge and how much.
 *
 * Card data never leaves this component: the API gets brand + last4 (a real
 * app would hand the card to its PSP here), and so does the agent.
 */
export function PaymentSurface({ toolCallId, args, result, respond }: ToolSurfaceProps<PaymentArgs>) {
  const { bookingId, amount } = args;
  const [paid, setPaid] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const config = useMemo(() => ({ ...buildCheckoutConfig(euros(amount)), formName: `pay-${toolCallId}` }), [amount, toolCallId]);

  async function onPay(event: FormSubmitEvent) {
    const number = digitsOnly(String(event.data.card?.number ?? ''));
    const answer = { status: 'paid' as const, amount, brand: getBrand(number).id, last4: number.slice(-4) };
    flipStore.set(false);
    setProblem(null);
    try {
      await hotelApi.createPayment({ bookingId, amount, brand: answer.brand, last4: answer.last4 });
    } catch (error) {
      setProblem(error instanceof ApiProblem ? error.problems.join(' ') : String(error));
      return;
    }
    const finish = () => {
      setPaid(true);
      // Let the success animation play before the agent's next message arrives.
      window.setTimeout(() => respond(answer satisfies PaymentResult), 1400);
    };
    if (!stageRef.current) return finish();
    gsap.to(stageRef.current, { y: -10, scale: 0.97, opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: finish });
  }

  if (result !== undefined && !paid) {
    const done = result as PaymentResult;
    return (
      <div className={`surface surface--done ${done.status === 'paid' ? '' : 'surface--muted'}`}>
        {done.status === 'paid' ? `✓ Paid ${euros(done.amount)} · ${done.brand} •••• ${done.last4}` : '✕ Checkout closed'}
      </div>
    );
  }

  return (
    <div className="checkout checkout--inline">
      <div className="checkout__card">
        {paid ? (
          <PaymentSuccess amount={euros(amount)} />
        ) : (
          <>
            <div className="checkout__header">
              <span className="surface__badge">Secure payment</span>
              <span>
                {bookingId} · <strong>{euros(amount)}</strong>
              </span>
            </div>
            <div className="checkout__stage" ref={stageRef}>
              <GuiForm config={config} formSubmit={onPay} />
            </div>
            {problem && <div className="chat__error">⚠ {problem}</div>}
            <button type="button" className="button button--ghost checkout__cancel" onClick={() => respond({ status: 'cancelled' } satisfies PaymentResult)}>
              Cancel
            </button>
          </>
        )}
      </div>
      <p className="checkout__footnote">Demo checkout — no real charge. Try 4242 4242 4242 4242, any future expiry, any CVC.</p>
    </div>
  );
}
