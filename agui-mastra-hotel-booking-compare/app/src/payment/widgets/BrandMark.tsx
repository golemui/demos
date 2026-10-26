import type { BrandId } from '../lib/cardBrands';

/** Compact, recognisable brand marks rendered as inline SVG. */
export function BrandMark({ brand, light = false }: { brand: BrandId; light?: boolean }) {
  switch (brand) {
    case 'visa':
      return (
        <svg className="brandmark" viewBox="0 0 48 16" aria-label="Visa">
          <text x="0" y="13" fontFamily="Arial, sans-serif" fontWeight="700" fontStyle="italic" fontSize="15" fill={light ? '#fff' : '#1a1f71'}>VISA</text>
        </svg>
      );
    case 'mastercard':
      return (
        <svg className="brandmark" viewBox="0 0 48 30" aria-label="Mastercard">
          <circle cx="19" cy="15" r="11" fill="#eb001b" />
          <circle cx="30" cy="15" r="11" fill="#f79e1b" />
          <path d="M24.5 6.4a11 11 0 0 0 0 17.2 11 11 0 0 0 0-17.2Z" fill="#ff5f00" />
        </svg>
      );
    case 'amex':
      return (
        <svg className="brandmark" viewBox="0 0 52 16" aria-label="American Express">
          <rect width="52" height="16" rx="2" fill={light ? 'rgba(255,255,255,.18)' : '#2e77bb'} />
          <text x="26" y="11.5" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="7" fill="#fff">AMEX</text>
        </svg>
      );
    case 'discover':
      return (
        <svg className="brandmark" viewBox="0 0 60 16" aria-label="Discover">
          <text x="0" y="12" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" fill={light ? '#fff' : '#1a1a1a'}>DISC</text>
          <circle cx="50" cy="8" r="6" fill="#f59e0b" />
        </svg>
      );
    case 'diners':
    case 'jcb':
    case 'unionpay':
    case 'maestro':
      return (
        <svg className="brandmark" viewBox="0 0 60 16" aria-label="Card">
          <text x="0" y="12" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="9" fill={light ? '#fff' : '#374151'}>
            {brand.toUpperCase()}
          </text>
        </svg>
      );
    default:
      return null;
  }
}
