import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { nanoid } from 'nanoid';
import { GolemFormNodeView } from './GolemFormNodeView';
import { FORM_SCHEMA, type FormDef } from './templates';

export interface GolemFormAttrs {
  /** GolemUI form definition — the source of truth for the rendered form. */
  formDef: FormDef;
  /** Captured form data, persisted into the document so the doc is self-contained. */
  value: Record<string, unknown> | null;
  /** Stable id (nanoid) — for collaboration / binding to external data later. */
  formId: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    golemForm: {
      /** Insert a GolemUI form node seeded with a form definition. */
      insertGolemForm: (formDef: FormDef) => ReturnType;
    };
  }
}

const EMPTY_DEF: FormDef = { $schema: FORM_SCHEMA, form: [] };

/**
 * `golemForm` — a leaf (atom) block node whose attributes hold a GolemUI form
 * definition and the values captured from it. Rendered via a React node view
 * that mounts a live `<GuiForm>`.
 *
 * Event isolation (the thing to get right when embedding an interactive widget
 * in ProseMirror) is handled on three levels:
 *   - `atom: true` + a `contentEditable={false}` wrapper in the node view, so PM
 *     never treats the form's DOM as editable content;
 *   - `stopEvent: () => true` on the node view, so keystrokes/clicks inside the
 *     form are never routed back into the editor (no selection jumps, no doc
 *     mutations from typing in a field);
 *   - `ignoreMutation: () => true`, so GolemUI re-rendering its own DOM never
 *     trips ProseMirror's mutation observer.
 */
export const GolemForm = Node.create({
  name: 'golemForm',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      formDef: {
        default: EMPTY_DEF,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-golem-form');
          if (!raw) return EMPTY_DEF;
          try {
            return JSON.parse(raw);
          } catch {
            return EMPTY_DEF;
          }
        },
        renderHTML: (attrs) => ({
          'data-golem-form': JSON.stringify(attrs.formDef),
        }),
      },
      value: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-golem-value');
          if (!raw) return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) =>
          attrs.value == null
            ? {}
            : { 'data-golem-value': JSON.stringify(attrs.value) },
      },
      formId: {
        default: null,
        // Generate a fresh id when one isn't provided (e.g. brand-new node).
        parseHTML: (el) => el.getAttribute('data-golem-id') || nanoid(),
        renderHTML: (attrs) => ({ 'data-golem-id': attrs.formId ?? nanoid() }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-golem-form]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'golem-form' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GolemFormNodeView, {
      // Keep every event raised inside the live form away from ProseMirror.
      stopEvent: () => true,
      ignoreMutation: () => true,
    });
  },

  addCommands() {
    return {
      insertGolemForm:
        (formDef) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { formDef, value: null, formId: nanoid() },
          }),
    };
  },
});
