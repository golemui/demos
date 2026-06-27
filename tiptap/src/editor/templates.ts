/**
 * Starter GolemUI form definitions, inserted by the `/form` slash command.
 *
 * Each is a plain JSON object in GolemUI's form-definition shape
 * (`{ $schema, form: [ ...widgets ] }`) — the exact value handed to
 * `config.formDef`. Nothing here is GolemUI-instance-specific: copy one into a
 * `golemForm` node's `formDef` attribute and it renders, validates, and submits.
 *
 * Widget `type`s used below are all part of GolemUI's registered set
 * (textinput, textarea, number, select, radiogroup, toggle, button, …).
 */

export const FORM_SCHEMA = 'https://golemui.com/schemas/form.schema.json';

/** A GolemUI form definition: the value passed to `config.formDef`. */
export interface FormDef {
  $schema: string;
  form: Record<string, unknown>[];
}

export interface FormTemplate {
  /** Stable key used by the slash menu. */
  id: string;
  /** Menu label. */
  title: string;
  /** One-line menu description. */
  description: string;
  /** Material Icons glyph name for the menu row. */
  icon: string;
  /** The GolemUI form definition this template inserts. */
  formDef: FormDef;
}

const contact: FormDef = {
  $schema: FORM_SCHEMA,
  form: [
    {
      kind: 'input',
      type: 'textinput',
      path: 'name',
      label: 'Full name',
      validator: { type: 'string', required: true },
      props: { placeholder: 'Ada Lovelace' },
    },
    {
      kind: 'input',
      type: 'textinput',
      path: 'email',
      label: 'Email',
      validator: { type: 'string', required: true },
      props: { placeholder: 'ada@example.com' },
    },
    {
      kind: 'input',
      type: 'textarea',
      path: 'message',
      label: 'Message',
      validator: { type: 'string', required: true },
      props: { placeholder: 'How can we help?', rows: 4 },
    },
    {
      kind: 'action',
      type: 'button',
      actionType: 'submit',
      label: 'Send message',
      props: { variant: 'filled' },
    },
  ],
};

const rsvp: FormDef = {
  $schema: FORM_SCHEMA,
  form: [
    {
      kind: 'input',
      type: 'textinput',
      path: 'guestName',
      label: 'Your name',
      validator: { type: 'string', required: true },
    },
    {
      kind: 'input',
      type: 'radiogroup',
      path: 'attending',
      label: 'Will you attend?',
      validator: { type: 'string', required: true, enum: ['yes', 'no'] },
      props: {
        options: [
          { label: 'Joyfully accepts', value: 'yes' },
          { label: 'Regretfully declines', value: 'no' },
        ],
      },
    },
    {
      kind: 'input',
      type: 'number',
      path: 'guests',
      label: 'Number of guests',
      validator: { type: 'number' },
      props: { min: 0, max: 6 },
    },
    {
      kind: 'input',
      type: 'select',
      path: 'meal',
      label: 'Meal preference',
      validator: { type: 'string', enum: ['meat', 'fish', 'vegetarian', 'vegan'] },
      props: {
        placeholder: 'Choose a meal',
        options: [
          { label: 'Meat', value: 'meat' },
          { label: 'Fish', value: 'fish' },
          { label: 'Vegetarian', value: 'vegetarian' },
          { label: 'Vegan', value: 'vegan' },
        ],
      },
    },
    {
      kind: 'action',
      type: 'button',
      actionType: 'submit',
      label: 'Send RSVP',
      props: { variant: 'filled' },
    },
  ],
};

const feedback: FormDef = {
  $schema: FORM_SCHEMA,
  form: [
    {
      kind: 'input',
      type: 'select',
      path: 'rating',
      label: 'How would you rate us? (1–5)',
      validator: { type: 'number', required: true, enum: [1, 2, 3, 4, 5] },
      props: {
        placeholder: 'Pick a rating',
        options: [
          { label: '1 — Poor', value: 1 },
          { label: '2 — Fair', value: 2 },
          { label: '3 — Good', value: 3 },
          { label: '4 — Great', value: 4 },
          { label: '5 — Excellent', value: 5 },
        ],
      },
    },
    {
      kind: 'input',
      type: 'textarea',
      path: 'comments',
      label: 'Anything else?',
      props: { placeholder: 'Tell us more…', rows: 3 },
    },
    {
      kind: 'input',
      type: 'toggle',
      path: 'contactMe',
      label: 'You can contact me about this feedback',
    },
    {
      kind: 'action',
      type: 'button',
      actionType: 'submit',
      label: 'Submit feedback',
      props: { variant: 'filled' },
    },
  ],
};

export const TEMPLATES: FormTemplate[] = [
  {
    id: 'contact',
    title: 'Contact form',
    description: 'Name, email and a message — required-field validation',
    icon: 'mail',
    formDef: contact,
  },
  {
    id: 'rsvp',
    title: 'RSVP',
    description: 'Attendance, guest count and meal choice',
    icon: 'event_available',
    formDef: rsvp,
  },
  {
    id: 'feedback',
    title: 'Feedback',
    description: '1–5 rating, comments and a contact toggle',
    icon: 'reviews',
    formDef: feedback,
  },
];

/** Clone a template's definition so each inserted node owns its own object. */
export function cloneFormDef(def: FormDef): FormDef {
  return structuredClone(def);
}
