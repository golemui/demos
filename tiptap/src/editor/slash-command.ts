import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, {
  type SuggestionOptions,
  type SuggestionKeyDownProps,
} from '@tiptap/suggestion';
import { SlashMenu, type SlashMenuRef, type SlashMenuProps } from './SlashMenu';
import { TEMPLATES, cloneFormDef, type FormTemplate } from './templates';

/**
 * `/form` slash command. Typing `/` opens a menu of starter GolemUI form
 * templates; picking one deletes the `/query` text and inserts a `golemForm`
 * node seeded with that template's definition.
 *
 * Built on `@tiptap/suggestion` + Tiptap's `ReactRenderer`. The floating menu is
 * positioned with a plain fixed-position element from the caret rect — no popup
 * dependency (tippy/floating-ui) needed for a list this small.
 */

/** Position a floating element just below the current caret rect. */
function positionMenu(el: HTMLElement, rect: DOMRect | null) {
  if (!rect) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.position = 'fixed';
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.bottom + 6}px`;
  el.style.zIndex = '50';
}

const suggestion: Omit<SuggestionOptions<FormTemplate>, 'editor'> = {
  char: '/',

  items: ({ query }) => {
    const q = query.toLowerCase();
    return TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.id.includes(q) ||
        'form'.includes(q),
    );
  },

  command: ({ editor, range, props }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertGolemForm(cloneFormDef(props.formDef))
      .run();
  },

  render: () => {
    let component: ReactRenderer<SlashMenuRef, SlashMenuProps>;
    let popup: HTMLElement;

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashMenu, {
          editor: props.editor,
          props: { items: props.items, command: props.command },
        });

        popup = document.createElement('div');
        popup.className = 'slash-popup';
        popup.appendChild(component.element);
        document.body.appendChild(popup);
        positionMenu(popup, props.clientRect?.() ?? null);
      },

      onUpdate: (props) => {
        component.updateProps({ items: props.items, command: props.command });
        positionMenu(popup, props.clientRect?.() ?? null);
      },

      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === 'Escape') {
          popup.style.display = 'none';
          return true;
        }
        return component.ref?.onKeyDown(props.event) ?? false;
      },

      onExit: () => {
        popup.remove();
        component.destroy();
      },
    };
  },
};

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...suggestion,
      }),
    ];
  },
});
