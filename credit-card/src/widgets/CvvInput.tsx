import type { WithWidget, InputWidget } from '@golemui/core';
import { useInputWidget } from '@golemui/react';
import { digitsOnly } from '../lib/cardBrands';
import { flipStore } from '../lib/flipStore';

interface Props {
  label?: string;
  /** Fed by a runtime function reading the live card brand: 3 or 4. */
  codeSize?: number;
}

/**
 * CVV input. Two brand-aware behaviours:
 *  - max length follows the brand (4 for Amex, 3 otherwise), passed in via a
 *    runtime-function prop;
 *  - focusing it flips the card to its back (front for Amex). GolemUI has no
 *    onFocus event hook, so we toggle a shared flip store directly and still
 *    call the engine's onBlur() for touched/validation.
 */
export function CvvInput(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<string, string>;
  const { uid, value, errors, isTouched, templateData, onValueChanged, onBlur } =
    useInputWidget<string, Props>(widget);

  const size = templateData.codeSize === 4 ? 4 : 3;
  const showError = isTouched && errors.length > 0;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onValueChanged(digitsOnly(e.target.value).slice(0, size));
  }

  return (
    <div className="field" style={{ flex: templateData.size }}>
      <label className="field__label" htmlFor={uid}>
        {templateData.label ?? 'CVV'}
      </label>
      <div className={`field__control ${showError ? 'field__control--error' : ''}`}>
        <span className="material-icons field__icon">lock</span>
        <input
          id={uid}
          className="field__input"
          inputMode="numeric"
          autoComplete="cc-csc"
          placeholder={'•'.repeat(size)}
          maxLength={size}
          value={value ?? ''}
          onFocus={() => flipStore.set(true)}
          onChange={handleChange}
          onBlur={() => {
            flipStore.set(false);
            onBlur();
          }}
        />
      </div>
      {showError && <span className="field__error">{errors[0]}</span>}
    </div>
  );
}
