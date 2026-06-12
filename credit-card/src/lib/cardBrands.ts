import valid from 'card-validator';

/**
 * Single source of truth for everything brand-related: detection,
 * gaps for live formatting, CVV length/label, gradient and logo.
 *
 * Brand detection is delegated to `card-validator` so we never hand-roll
 * the IIN ranges — the same library backs the validators.
 */

export type BrandId =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'diners'
  | 'jcb'
  | 'unionpay'
  | 'maestro'
  | 'unknown';

export interface BrandMeta {
  id: BrandId;
  label: string;
  /** Background gradient painted on the card front. */
  gradient: string;
  /** Where the digit groups break, e.g. [4,4,4,4] or amex [4,6,5]. */
  gaps: number[];
  /** Max card-number length (digits), used to cap typing. */
  maxLength: number;
  /** Security code length: 3 for most, 4 for Amex. */
  codeSize: number;
  /** Security code label: "CVV" / "CVC" / "CID". */
  codeLabel: string;
  /** Amex prints the code on the front; everyone else on the back. */
  codeOnFront: boolean;
}

const DEFAULT_GAPS = [4, 8, 12];

const BRANDS: Record<BrandId, Omit<BrandMeta, 'gaps' | 'maxLength' | 'codeSize' | 'codeLabel'>> = {
  visa: { id: 'visa', label: 'Visa', gradient: 'linear-gradient(135deg, #1a1f71 0%, #2b3a9c 55%, #3b82f6 100%)', codeOnFront: false },
  mastercard: { id: 'mastercard', label: 'Mastercard', gradient: 'linear-gradient(135deg, #1a1a1a 0%, #44291f 45%, #f79e1b 120%)', codeOnFront: false },
  amex: { id: 'amex', label: 'American Express', gradient: 'linear-gradient(135deg, #0f7b9c 0%, #16a0c4 60%, #2dd4bf 120%)', codeOnFront: true },
  discover: { id: 'discover', label: 'Discover', gradient: 'linear-gradient(135deg, #2b2b2b 0%, #6b4d1e 60%, #f59e0b 120%)', codeOnFront: false },
  diners: { id: 'diners', label: 'Diners Club', gradient: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 120%)', codeOnFront: false },
  jcb: { id: 'jcb', label: 'JCB', gradient: 'linear-gradient(135deg, #0b3d2e 0%, #15803d 60%, #ef4444 130%)', codeOnFront: false },
  unionpay: { id: 'unionpay', label: 'UnionPay', gradient: 'linear-gradient(135deg, #0e1b3a 0%, #c0392b 130%)', codeOnFront: false },
  maestro: { id: 'maestro', label: 'Maestro', gradient: 'linear-gradient(135deg, #0a3d62 0%, #c0392b 130%)', codeOnFront: false },
  unknown: { id: 'unknown', label: '', gradient: 'linear-gradient(135deg, #2b2f36 0%, #4b5563 60%, #6b7280 120%)', codeOnFront: false },
};

/** Map a card-validator card-type string to our BrandId. */
function normalizeType(type?: string | null): BrandId {
  switch (type) {
    case 'visa': return 'visa';
    case 'mastercard': return 'mastercard';
    case 'american-express': return 'amex';
    case 'discover': return 'discover';
    case 'diners-club': return 'diners';
    case 'jcb': return 'jcb';
    case 'unionpay': return 'unionpay';
    case 'maestro': return 'maestro';
    default: return 'unknown';
  }
}

export function digitsOnly(value: string): string {
  return (value || '').replace(/\D/g, '');
}

/** Resolve full brand metadata from whatever the user has typed so far. */
export function getBrand(rawNumber: string): BrandMeta {
  const number = digitsOnly(rawNumber);
  const result = valid.number(number);
  const card = result.card;
  const id = normalizeType(card?.type);
  const base = BRANDS[id];

  return {
    ...base,
    gaps: card?.gaps && card.gaps.length ? card.gaps : DEFAULT_GAPS,
    maxLength: card?.lengths && card.lengths.length ? Math.max(...card.lengths) : 16,
    codeSize: card?.code?.size ?? 3,
    codeLabel: card?.code?.name ?? 'CVV',
    codeOnFront: base.codeOnFront,
  };
}

/** Format "4242424242424242" → "4242 4242 4242 4242" using brand gaps. */
export function formatCardNumber(rawNumber: string): string {
  const number = digitsOnly(rawNumber);
  const { gaps } = getBrand(number);
  if (!number) return '';
  const out: string[] = [];
  let prev = 0;
  for (const gap of gaps) {
    if (number.length > gap) {
      out.push(number.slice(prev, gap));
      prev = gap;
    }
  }
  out.push(number.slice(prev));
  return out.filter(Boolean).join(' ');
}

/** Mask for the masked preview when no number is typed yet. */
export function maskedDisplay(rawNumber: string, brand: BrandMeta): string {
  const formatted = formatCardNumber(rawNumber);
  if (formatted) return formatted;
  // amex pattern •••• •••••• •••••, otherwise four groups of four.
  return brand.id === 'amex' ? '•••• •••••• •••••' : '•••• •••• •••• ••••';
}
