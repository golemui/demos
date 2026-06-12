# GolemUI · Animated Credit Card Checkout

Demo estilo Stripe construida con **GolemUI** (programmatic `gui.*` API), **GSAP**
y **card-validator**.

## Arrancar

```bash
npm install
npm run dev
```

> Nota: el scaffolding inicial dejó un `src/main.tsx` vacío bloqueado y algún
> `.DS_Store`/`*.tsbuildinfo` residual. El entry real es `src/entry.tsx`
> (referenciado desde `index.html`). Puedes borrar `src/main.tsx` y los residuos
> sin problema.

## Qué hay dentro

- **Custom validators** (`src/validators/cardValidators.ts`): `cardNumber`,
  `cardExpiry` (no caducada) y `cardCvv` (3/4 dígitos según marca), delegando en
  card-validator y envueltos en Zod. Registrados en `config.customValidators`.
- **Custom widgets** (`src/widgets/`):
  - `CardPreview` — display widget. Datos en vivo vía props con runtime function
    que lee `$form`; flip 3D con GSAP.
  - `CardNumberInput` — formateo en vivo con espacios (4242 4242 …) + badge de marca.
  - `CardExpiryInput` — máscara MM/YY.
  - `CvvInput` — longitud y etiqueta según marca; al enfocar gira la tarjeta.
  - `PaymentSuccess` — check SVG dibujándose (stroke) + rebote con GSAP.
  - `TextField` — input genérico para el titular.
- **Form** (`src/form/checkoutForm.ts`): definición `gui.*`, botón submit
  desactivado hasta que todo es válido.
- **Flip store** (`src/lib/flipStore.ts`): GolemUI no expone `onFocus`, así que
  el giro al enfocar el CVV se comparte por un store externo mínimo.

## El flip al enfocar el CVV

GolemUI tiene hooks `onChange`/`onBlur`/`onClick`/`onLoad`/`onFilter` pero **no
`onFocus`**. Por eso `CvvInput` engancha el `focus` nativo y togglea un store
compartido que `CardPreview` consume para animar el giro. Los *datos* de la
tarjeta sí fluyen por el camino idiomático (props con runtime function leyendo
`$form`).
