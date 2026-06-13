# Animated Credit Card Checkout

> A Stripe-style payment form where the card flips, formats, and validates itself — built declaratively with GolemUI.

Type a card number and watch the brand badge appear, the digits group themselves
(`4242 4242 …`), and a 3D card preview flip when you reach the CVV. Every field
validates in real time, and submit stays locked until the whole form is valid.

**Built with GolemUI · GSAP · card-validator**

## What it shows off

- **Custom validators** — real payment rules (Luhn check, expiry, brand-aware
  CVV length) delegated to `card-validator`, wrapped in Zod, and registered in
  `config.customValidators`.
- **Custom widgets** — input *and* display widgets: a live-formatting card
  number field, MM/YY mask, animated card preview, and an SVG success check.
- **Reactive props** — the card preview reads live form data through a runtime
  function on `$form`, so it stays in sync with zero event wiring.
- **Validation-gated submit** — the pay button stays disabled until every field
  passes.

## Run it

```bash
npm install
npm run dev
```

## How it works

- **Validators** (`src/validators/cardValidators.ts`): `cardNumber`,
  `cardExpiry` (not expired) and `cardCvv` (3/4 digits depending on the brand).
- **Widgets** (`src/widgets/`):
  - `CardPreview` — display widget; live data via a runtime function reading
    `$form`, 3D flip with GSAP.
  - `CardNumberInput` — live spacing + brand badge.
  - `CardExpiryInput` — MM/YY mask.
  - `CvvInput` — brand-aware length and label; flips the card on focus.
  - `PaymentSuccess` — self-drawing SVG check + GSAP bounce.
  - `TextField` — generic input for the cardholder.
- **Form** (`src/form/checkoutForm.ts`): the `gui.*` definition, submit disabled
  until valid.
- **Flip store** (`src/lib/flipStore.ts`): GolemUI exposes
  `onChange`/`onBlur`/`onClick`/`onLoad`/`onFilter` but **not `onFocus`**, so the
  CVV-focus flip is shared through a minimal external store. The card *data*
  still flows the idiomatic way — props with a runtime function reading `$form`.

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Form definition API](https://golemui.com/dx/form-definition-api/)
- [Widgets reference](https://golemui.com/dx/widgets-reference/)
