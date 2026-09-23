import { useEffect, useState } from 'react';
import type { InputWidget, WithWidget } from '@golemui/core';
import { useInputWidget } from '@golemui/react';

interface Props {
  title?: string;
  text: string;
  /** Milliseconds per character. */
  speed?: number;
}

/**
 * A story chapter that types itself out, Duolingo-style.
 *
 * It is an *input* widget on purpose: when the chapter has been fully shown it
 * writes `true` to its path (e.g. `read.chapter1`), and the definition reveals
 * the questions with `include: { when: "$form.read?.chapter1 === true" }`.
 * Reading progress is just form data — no wiring in the app.
 */
export function Typewriter(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as InputWidget<boolean, string>;
  const { uid, value, templateData, onValueChanged } = useInputWidget<boolean, Props>(widget);

  const text = templateData.text ?? '';
  const speed = templateData.speed ?? 30;
  const done = value === true;
  const [shown, setShown] = useState(done ? text.length : 0);

  useEffect(() => {
    if (done || shown >= text.length) return;
    const timer = setTimeout(() => setShown(shown + 1), speed);
    return () => clearTimeout(timer);
  }, [done, shown, text, speed]);

  // Typing finished → mark the chapter as read.
  useEffect(() => {
    if (!done && text.length > 0 && shown >= text.length) onValueChanged(true);
  }, [done, shown, text, onValueChanged]);

  function skip() {
    setShown(text.length);
  }

  return (
    <div className="typewriter" style={{ flex: templateData.size }} id={uid}>
      {templateData.title && <h3 className="typewriter__title">{templateData.title}</h3>}
      <p className="typewriter__text" onClick={skip} title="Click to show the whole chapter">
        {done ? text : text.slice(0, shown)}
        {!done && <span className="typewriter__cursor">▍</span>}
      </p>
    </div>
  );
}
