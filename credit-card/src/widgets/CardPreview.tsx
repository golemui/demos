import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { WithWidget, DisplayWidget } from '@golemui/core';
import { useDisplayWdiget } from '@golemui/react';
import { getBrand, maskedDisplay } from '../lib/cardBrands';
import { useCardFlipped } from '../lib/flipStore';
import { BrandMark } from './BrandMark';

interface Props {
  number?: string;
  name?: string;
  expiry?: string;
  cvv?: string;
}

/**
 * Read-only display widget that draws the live card. Card *data* arrives via
 * runtime-function props (number/name/expiry/cvv read from $form), so it stays
 * in sync as the user types. The flip is driven by the shared flip store and
 * animated with GSAP — to the back for most brands, with a front-code pulse
 * for Amex (whose security code is printed on the front).
 */
export function CardPreview(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as DisplayWidget<string>;
  const { uid, templateData } = useDisplayWdiget<Props>(widget);

  const flipped = useCardFlipped();
  const innerRef = useRef<HTMLDivElement>(null);
  const frontCodeRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(false);

  const number = templateData.number ?? '';
  const name = (templateData.name ?? '').toString().toUpperCase();
  const expiry = templateData.expiry ?? '';
  const cvv = templateData.cvv ?? '';
  const brand = getBrand(number);

  // Entrance animation, once. Use fromTo with an explicit end state so React
  // StrictMode's double-invoke can't leave the card stuck at a low opacity.
  useEffect(() => {
    if (!rootRef.current || enteredRef.current) return;
    enteredRef.current = true;
    gsap.fromTo(
      rootRef.current,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', clearProps: 'opacity,transform' },
    );
  }, []);

  // Flip animation. Amex keeps its face and pulses the front code instead.
  useEffect(() => {
    if (!innerRef.current) return;
    if (brand.codeOnFront) {
      gsap.to(innerRef.current, { rotationY: 0, duration: 0.5, ease: 'power2.inOut' });
      if (frontCodeRef.current && flipped) {
        gsap.fromTo(
          frontCodeRef.current,
          { scale: 1, boxShadow: '0 0 0 rgba(255,255,255,0)' },
          { scale: 1.12, repeat: 1, yoyo: true, duration: 0.4, ease: 'sine.inOut' },
        );
      }
    } else {
      gsap.to(innerRef.current, {
        rotationY: flipped ? 180 : 0,
        duration: 0.6,
        ease: 'power2.inOut',
      });
    }
  }, [flipped, brand.codeOnFront]);

  return (
    <div className="cardpreview" style={{ flex: templateData.size }}>
      <div className="card" ref={rootRef}>
        <div className="card__inner" ref={innerRef}>
          {/* FRONT */}
          <div
            className="card__face card__face--front"
            style={{ backgroundImage: brand.gradient }}
          >
            <div className="card__sheen" />
            <div className="card__top">
              <div className="card__chip" />
              <div className="card__brand">
                <BrandMark brand={brand.id} light />
              </div>
            </div>

            <div className="card__number" id={uid}>
              {maskedDisplay(number, brand)}
            </div>

            <div className="card__bottom">
              <div className="card__holder">
                <span className="card__caption">Card holder</span>
                <span className="card__value">{name || 'YOUR NAME'}</span>
              </div>
              <div className="card__expiry">
                <span className="card__caption">Expires</span>
                <span className="card__value">{expiry || 'MM/YY'}</span>
              </div>
              {brand.codeOnFront && (
                <div className="card__frontcode" ref={frontCodeRef}>
                  <span className="card__caption">{brand.codeLabel}</span>
                  <span className="card__value">{cvv || '••••'}</span>
                </div>
              )}
            </div>
          </div>

          {/* BACK */}
          <div
            className="card__face card__face--back"
            style={{ backgroundImage: brand.gradient }}
          >
            <div className="card__magstripe" />
            <div className="card__signature">
              <span className="card__signature-band" />
              <span className="card__cvv">{cvv || '•'.repeat(brand.codeSize)}</span>
            </div>
            <span className="card__code-label">{brand.codeLabel}</span>
            <div className="card__brand card__brand--back">
              <BrandMark brand={brand.id} light />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
