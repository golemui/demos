import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { GolemForm } from './editor/golem-form-node';
import { SlashCommand } from './editor/slash-command';
import { TEMPLATES, cloneFormDef } from './editor/templates';
import { ViewJsonPanel } from './view-json-panel';
import { DemoShell } from './_shared/DemoShell';

/** A starting document: prose + a live, prefilled Contact form node. */
function initialContent() {
  const contact = TEMPLATES.find((t) => t.id === 'contact')!;
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Event briefing' }],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text:
              'This is a normal Tiptap document — edit this text. But it also contains a live, validated GolemUI form as a native block. Fill it in and watch the document JSON on the right capture your answers.',
          },
        ],
      },
      {
        type: 'golemForm',
        attrs: {
          formDef: cloneFormDef(contact.formDef),
          value: { name: 'Ada Lovelace', email: 'ada@example.com' },
          formId: 'demo-contact',
        },
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Type "/" on a new line to insert another form — Contact, RSVP or Feedback.',
          },
        ],
      },
    ],
  };
}

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render the toolbar on every transaction so active states stay in sync.
  const [, force] = useState(0);
  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    editor.on('transaction', rerender);
    return () => {
      editor.off('transaction', rerender);
    };
  }, [editor]);

  const btn = (active: boolean) =>
    `tb__btn${active ? ' tb__btn--active' : ''}`;

  return (
    <div className="tb">
      <button
        type="button"
        className={btn(editor.isActive('heading', { level: 2 }))}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="Heading"
      >
        H2
      </button>
      <button
        type="button"
        className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic"
      >
        <em>I</em>
      </button>
      <button
        type="button"
        className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet list"
      >
        <span className="material-icons">format_list_bulleted</span>
      </button>

      <span className="tb__sep" />
      <span className="tb__label">Insert form:</span>
      {TEMPLATES.map((t) => (
        <button
          type="button"
          key={t.id}
          className="tb__btn tb__btn--ghost"
          onClick={() =>
            editor.chain().focus().insertGolemForm(cloneFormDef(t.formDef)).run()
          }
          title={t.description}
        >
          <span className="material-icons">{t.icon}</span>
          {t.title}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const [status, setStatus] = useState<string | null>(null);
  const reloadTimer = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      GolemForm,
      SlashCommand,
    ],
    content: initialContent(),
    autofocus: false,
  });

  useEffect(
    () => () => {
      if (reloadTimer.current) window.clearTimeout(reloadTimer.current);
    },
    [],
  );

  // Persistence proof: serialize the document to JSON, tear the editor's content
  // down, then rebuild it purely from that JSON. Forms, their validation, and
  // every captured value must come back exactly.
  function roundTrip() {
    if (!editor) return;
    const snapshot = editor.getJSON();
    editor.commands.clearContent();
    setStatus('Cleared — rebuilding from editor.getJSON()…');
    reloadTimer.current = window.setTimeout(() => {
      editor.commands.setContent(snapshot);
      setStatus('Restored from JSON — forms and captured values are intact.');
    }, 450);
  }

  return (
    <DemoShell demoName="Live forms as Tiptap blocks">
      <div className="tt">
        <header className="tt__header">
          <h1 className="tt__title">Turn a Tiptap document into a database</h1>
          <p className="tt__subtitle">
            Each form below is a native Tiptap block backed by a GolemUI form
            definition. Prose, forms and the data you enter are one serializable
            document — the same <code>{'{ form: [...] }'}</code> JSON GolemUI
            renders in React, Angular, Vue, Lit and vanilla.
          </p>
          <div className="tt__actions">
            <button type="button" className="tt__roundtrip" onClick={roundTrip}>
              <span className="material-icons" aria-hidden="true">
                sync
              </span>
              Save &amp; reload from JSON
            </button>
            {status && (
              <span className="tt__status" aria-live="polite">
                {status}
              </span>
            )}
          </div>
        </header>

        <div className="tt__columns">
          <section className="tt__editor-pane">
            {editor && <Toolbar editor={editor} />}
            <EditorContent editor={editor} className="tt__editor" />
          </section>

          {editor && <ViewJsonPanel editor={editor} />}
        </div>
      </div>
    </DemoShell>
  );
}
