import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { GuiForm } from '@golemui/gui-react';
import type { FormComponentHandle } from '@golemui/react';
import type { FormSubmitEvent } from '@golemui/core';
import { checkoutConfig, AMOUNT } from './form/checkoutForm';
import { PaymentSuccess } from './widgets/PaymentSuccess';
import { flipStore } from './lib/flipStore';
import { DemoShell } from './_shared/DemoShell';

export default function App() {
  const [paid, setPaid] = useState(false);
  const formRef = useRef<FormComponentHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // formSubmit only fires when the whole form passes validation.
  function handleSubmit(_event: FormSubmitEvent) {
    flipStore.set(false);
    const stage = stageRef.current;
    if (!stage) {
      setPaid(true);
      return;
    }
    // Pay transition: lift + fade the form, then reveal the success screen.
    gsap.to(stage, {
      y: -10,
      scale: 0.97,
      opacity: 0,
      duration: 0.4,
      ease: 'power2.in',
      onComplete: () => setPaid(true),
    });
  }

  function reset() {
    formRef.current?.setData({
      card: { number: '', expiry: '', cvv: '' },
      billing: { name: '' },
    });
    setPaid(false);
    // Bring the form back.
    requestAnimationFrame(() => {
      if (stageRef.current) {
        gsap.fromTo(
          stageRef.current,
          { y: -10, scale: 0.97, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'power3.out' },
        );
      }
    });
  }

  return (
    <DemoShell demoName="Credit card checkout">
      <div className="checkout">
        <div className="checkout__card">
          {!paid && (
            <div className="checkout__stage" ref={stageRef}>
              <GuiForm ref={formRef} config={checkoutConfig} formSubmit={handleSubmit} />
            </div>
          )}
          {paid && <PaymentSuccess amount={AMOUNT} onReset={reset} />}
        </div>

        <p className="checkout__footnote">
          Test cards: Visa 4242 4242 4242 4242 · Amex 3782 822463 10005 · any future date
        </p>
      </div>
    </DemoShell>
  );
}
