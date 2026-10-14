import type { WithWidget, InputWidget } from '@golemui/core';
import { useInputWidget } from '@golemui/react';

interface Props {
  label?: string;
  placeholder?: string;
  icon?: string;
  autocomplete?: string;
}

/** Generic text input that matches the look of the card-specific fields. */
export function TextField(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<string, string>;
  const { uid, value, errors, isTouched, templateData, onValueChanged, onBlur } =
    useInputWidget<string, Props>(widget);

  const showError = isTouched && errors.length > 0;

  return (
    <div className="field" style={{ flex: templateData.size }}>
      <label className="field__label" htmlFor={uid}>
        {templateData.label ?? ''}
      </label>
      <div className={`field__control ${showError ? 'field__control--error' : ''}`}>
        {templateData.icon && <span className="material-icons field__icon">{templateData.icon}</span>}
        <input
          id={uid}
          className="field__input"
          autoComplete={templateData.autocomplete}
          placeholder={templateData.placeholder ?? ''}
          value={value ?? ''}
          onChange={(e) => onValueChanged(e.target.value)}
          onBlur={onBlur}
        />
      </div>
      {showError && <span className="field__error">{errors[0]}</span>}
    </div>
  );
}
