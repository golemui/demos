import type { WithWidget, InputWidget } from '@golemui/core';
import { useInputWidget } from '@golemui/react';
import { digitsOnly } from '../lib/cardBrands';

interface Props {
  label?: string;
  placeholder?: string;
}

/** Masks input as MM/YY while typing; stores the "MM/YY" string. */
function maskExpiry(raw: string): string {
  const d = digitsOnly(raw).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export function CardExpiryInput(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<string, string>;
  const { uid, value, errors, isTouched, templateData, onValueChanged, onBlur } =
    useInputWidget<string, Props>(widget);

  const showError = isTouched && errors.length > 0;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onValueChanged(maskExpiry(e.target.value));
  }

  return (
    <div className="field" style={{ flex: templateData.size }}>
      <label className="field__label" htmlFor={uid}>
        {templateData.label ?? 'Expiry'}
      </label>
      <div className={`field__control ${showError ? 'field__control--error' : ''}`}>
        <span className="material-icons field__icon">event</span>
        <input
          id={uid}
          className="field__input"
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder={templateData.placeholder ?? 'MM/YY'}
          value={value ?? ''}
          onChange={handleChange}
          onBlur={onBlur}
        />
      </div>
      {showError && <span className="field__error">{errors[0]}</span>}
    </div>
  );
}
