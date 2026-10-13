import type { WithWidget, InputWidget } from '@golemui/core';
import { useInputWidget } from '@golemui/react';
import { digitsOnly, formatCardNumber, getBrand } from '../lib/cardBrands';
import { BrandMark } from './BrandMark';

interface Props {
  label?: string;
  placeholder?: string;
}

/**
 * Custom input that stores the raw digits in form data but renders them
 * grouped with spaces (4242 4242 4242 4242) live as you type. A built-in
 * textInput can't reformat mid-typing without fighting the caret, so this is
 * the clean place to own that behaviour.
 */
export function CardNumberInput(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<string, string>;
  const { uid, value, errors, isTouched, templateData, onValueChanged, onBlur } =
    useInputWidget<string, Props>(widget);

  const raw = value ?? '';
  const brand = getBrand(raw);
  const showError = isTouched && errors.length > 0;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = digitsOnly(e.target.value).slice(0, brand.maxLength);
    onValueChanged(next);
  }

  return (
    <div className="field" style={{ flex: templateData.size }}>
      <label className="field__label" htmlFor={uid}>
        {templateData.label ?? 'Card number'}
      </label>
      <div className={`field__control ${showError ? 'field__control--error' : ''}`}>
        <span className="material-icons field__icon">credit_card</span>
        <input
          id={uid}
          className="field__input"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder={templateData.placeholder ?? '1234 1234 1234 1234'}
          value={formatCardNumber(raw)}
          onChange={handleChange}
          onBlur={onBlur}
        />
        <span className="field__brand">
          <BrandMark brand={brand.id} />
        </span>
      </div>
      {showError && <span className="field__error">{errors[0]}</span>}
    </div>
  );
}
