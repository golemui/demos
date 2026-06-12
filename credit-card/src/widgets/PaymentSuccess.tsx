import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface Props {
  amount: string;
  onReset: () => void;
}

/**
 * Terminal "payment completed" screen. The tick is a single SVG path whose
 * stroke is drawn on with GSAP (stroke-dashoffset) followed by a small bounce
 * on the badge.
 */
export function PaymentSuccess({ amount, onReset }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const checkRef = useRef<SVGPathElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = checkRef.current;
    if (!check || !badgeRef.current || !textRef.current) return;

    const len = check.getTotalLength();
    gsap.set(check, { strokeDasharray: len, strokeDashoffset: len });
    gsap.set(badgeRef.current, { scale: 0.6, opacity: 0 });
    gsap.set(textRef.current, { y: 14, opacity: 0 });

    const tl = gsap.timeline();
    tl.to(badgeRef.current, { scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(2.2)' })
      .to(check, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, '-=0.1')
      .to(badgeRef.current, { scale: 1.08, duration: 0.16, yoyo: true, repeat: 1, ease: 'sine.inOut' })
      .to(textRef.current, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }, '-=0.2');
  }, []);

  return (
    <div className="success" ref={rootRef}>
      <div className="success__badge" ref={badgeRef}>
        <svg viewBox="0 0 100 100" width="96" height="96" aria-hidden="true">
          <circle cx="50" cy="50" r="46" className="success__ring" />
          <path
            ref={checkRef}
            className="success__check"
            d="M28 51 L44 67 L73 35"
            fill="none"
          />
        </svg>
      </div>
      <div className="success__text" ref={textRef}>
        <h2 className="success__title">Payment completed</h2>
        <p className="success__amount">{amount} charged successfully</p>
        <button className="success__reset" onClick={onReset}>
          Make another payment
        </button>
      </div>
    </div>
  );
}
