import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import type { FormTemplate } from './templates';

export interface SlashMenuRef {
  /** Returns true if the key was handled (so the editor shouldn't act on it). */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface SlashMenuProps {
  items: FormTemplate[];
  command: (item: FormTemplate) => void;
}

/**
 * The floating menu shown after typing `/`. Arrow keys move the selection,
 * Enter inserts the highlighted template. Rendered by the suggestion plugin via
 * Tiptap's `ReactRenderer` (see slash-command.ts).
 */
export const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(
  ({ items, command }, ref) => {
    const [index, setIndex] = useState(0);

    useEffect(() => setIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (event) => {
        if (event.key === 'ArrowUp') {
          setIndex((i) => (i + items.length - 1) % items.length);
          return true;
        }
        if (event.key === 'ArrowDown') {
          setIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[index];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return <div className="slash-menu slash-menu--empty">No matching forms</div>;
    }

    return (
      <div className="slash-menu" role="listbox">
        <div className="slash-menu__heading">Insert a GolemUI form</div>
        {items.map((item, i) => (
          <button
            type="button"
            role="option"
            aria-selected={i === index}
            key={item.id}
            className={`slash-menu__item${i === index ? ' slash-menu__item--active' : ''}`}
            onMouseEnter={() => setIndex(i)}
            onClick={() => command(item)}
          >
            <span className="slash-menu__icon material-icons" aria-hidden="true">
              {item.icon}
            </span>
            <span className="slash-menu__text">
              <span className="slash-menu__title">{item.title}</span>
              <span className="slash-menu__desc">{item.description}</span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);

SlashMenu.displayName = 'SlashMenu';
