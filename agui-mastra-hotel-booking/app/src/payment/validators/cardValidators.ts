import { z } from 'zod';
import valid from 'card-validator';
import type { CustomValidatorSchemaFn } from '@golemui/gui-validators';
import { digitsOnly } from '../lib/cardBrands';

/**
 * Custom validators. Each follows the GolemUI `CustomValidatorSchemaFn`
 * contract: take a config argument and return a Zod schema (a StandardSchemaV1).
 * They are registered by name under `config.customValidators` and referenced
 * from a widget with `validator: { type: 'custom', <name>: <config> }`.
 *
 * All the card intelligence comes from `card-validator` — we only wrap its
 * boolean results in friendly Zod issues.
 */

/** Card number: must be a complete, brand-valid PAN (Luhn + length). */
export const cardNumber: CustomValidatorSchemaFn = () =>
  z.string().check(
    z.superRefine((val: string, ctx) => {
      const number = digitsOnly(val);
      if (!number) {
        ctx.addIssue({ code: 'custom', message: 'Card number is required', input: val });
        return;
      }
      const result = valid.number(number);
      if (!result.card) {
        ctx.addIssue({ code: 'custom', message: 'Unrecognised card brand', input: val });
        return;
      }
      if (!result.isValid) {
        ctx.addIssue({ code: 'custom', message: 'This card number is incomplete or invalid', input: val });
      }
    }),
  );

/** Expiry MM/YY: must parse and not be in the past. */
export const cardExpiry: CustomValidatorSchemaFn = () =>
  z.string().check(
    z.superRefine((val: string, ctx) => {
      if (!val) {
        ctx.addIssue({ code: 'custom', message: 'Expiry date is required', input: val });
        return;
      }
      const result = valid.expirationDate(val);
      if (!result.isValid) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a valid, non-expired date (MM/YY)',
          input: val,
        });
      }
    }),
  );

/**
 * CVV: length depends on the brand (3 normally, 4 for Amex). The expected
 * size is fed in as config from a runtime function that reads the live card
 * number — a single-field validator can't see another field on its own.
 */
export const cardCvv: CustomValidatorSchemaFn = (size: number) => {
  const expected = size === 4 ? 4 : 3;
  return z.string().check(
    z.superRefine((val: string, ctx) => {
      if (!val) {
        ctx.addIssue({ code: 'custom', message: 'Security code is required', input: val });
        return;
      }
      const result = valid.cvv(val, expected);
      if (!result.isValid) {
        ctx.addIssue({
          code: 'custom',
          message: `Security code must be ${expected} digits`,
          input: val,
        });
      }
    }),
  );
};

export const cardValidators = { cardNumber, cardExpiry, cardCvv };
