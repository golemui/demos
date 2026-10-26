import valid from 'card-validator';
import { digitsOnly, getBrand } from './cardBrands';

interface FormShape {
  card?: { number?: string; expiry?: string; cvv?: string };
  billing?: { name?: string };
}

/**
 * Whole-form validity, used to gate the Pay button. Mirrors the per-field
 * custom validators so the button only enables when a real payment would pass.
 */
export function isPaymentValid($form: FormShape): boolean {
  const number = digitsOnly($form?.card?.number ?? '');
  const expiry = $form?.card?.expiry ?? '';
  const cvv = $form?.card?.cvv ?? '';
  const name = ($form?.billing?.name ?? '').trim();

  if (!valid.number(number).isValid) return false;
  if (!valid.expirationDate(expiry).isValid) return false;
  const size = getBrand(number).codeSize;
  if (!valid.cvv(cvv, size).isValid) return false;
  if (name.length < 2) return false;
  return true;
}
