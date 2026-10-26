/**
 * `npm run forms` — OpenAPI → GolemUI form definitions, at build time.
 *
 * Runs the same generator the GolemUI MCP serves as `json_generate_from_openapi`
 * over every askable operation of the hotel contract, validates the result, and
 * writes one JSON file per operation to `shared/forms/`. Those files are checked
 * in: the browser never ships the generator, and a contract change shows up as a
 * reviewable diff of the generated forms.
 *
 * `overrides` are the only hand-written UI decisions — keyed by field path, they
 * pick a different widget or props than the generator's default. Everything else
 * (labels, options, hints, required, min/max, maxLength) comes from the contract.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateFromOpenapi, validateFormDefinition } from '@golemui/gui-mcp/json';
import { ASKABLE_OPERATIONS, hotelApi } from '../src/hotel-api.ts';

type Overrides = NonNullable<Parameters<typeof generateFromOpenapi>[0]['overrides']>;

const BOOKING_OVERRIDES: Overrides = {
  // Arrival and departure side by side, as calendar pickers; the 30-night cap
  // and the departure-after-arrival rule are applied live by the app.
  dates: { props: { direction: 'row' } },
  'dates.start': { widget: 'datePicker' },
  'dates.end': { widget: 'datePicker' },
  'specialRequests.notes': { props: { placeholder: 'A quiet room, a birthday surprise…' } },
};

// updateBooking's body has the same fields (all optional), so the same UI decisions.
const OVERRIDES: Record<string, Overrides> = { createBooking: BOOKING_OVERRIDES, updateBooking: BOOKING_OVERRIDES };

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../forms');
mkdirSync(outDir, { recursive: true });

let failed = false;
for (const operation of ASKABLE_OPERATIONS) {
  const result = await generateFromOpenapi({
    document: hotelApi as never,
    operation,
    overrides: OVERRIDES[operation],
  });

  if (!result.validation.valid || result.unmapped.length > 0) {
    failed = true;
    console.error(`✗ ${operation}`, JSON.stringify({ errors: result.validation, unmapped: result.unmapped }, null, 2));
    continue;
  }

  const definition = { ...result.formDefinition, form: (result.formDefinition.form as Widget[]).map(withMessages) };
  const check = validateFormDefinition({ formDefinition: definition });
  if (!check.valid) {
    failed = true;
    console.error(`✗ ${operation} (after messages)`, JSON.stringify(check, null, 2));
    continue;
  }

  const file = resolve(outDir, `${operation}.json`);
  writeFileSync(file, `${JSON.stringify(definition, null, 2)}\n`);
  console.log(`✓ ${operation} → forms/${operation}.json`);
}

process.exit(failed ? 1 : 0);

/**
 * Human validation messages from the field's own label and limits — otherwise
 * an empty required field shows the validator's default ("Invalid input:
 * expected string, received null"). Note: only string validators accept a
 * `required` message key; every type accepts `invalid`.
 */
type Widget = { [key: string]: unknown; children?: Widget[]; validator?: Record<string, unknown> };

function withMessages(widget: Widget): Widget {
  if (widget.children) return { ...widget, children: widget.children.map(withMessages) };
  const validator = widget.validator;
  if (!validator) return widget;

  const label = typeof widget.label === 'string' ? widget.label : 'This field';
  const messages: Record<string, string> = {};
  if (validator.required) {
    messages.invalid = `${label} is required`;
    if (validator.type === 'string') messages.required = messages.invalid;
  }
  if (validator.minimum !== undefined) messages.minimum = `${label} must be at least ${validator.minimum}`;
  if (validator.maximum !== undefined) messages.maximum = `${label} must be at most ${validator.maximum}`;
  if (validator.maxLength !== undefined)
    messages.maxLength = `${label} must be at most ${validator.maxLength} characters`;
  return Object.keys(messages).length > 0 ? { ...widget, validator: { ...validator, messages } } : widget;
}
