import { gui } from '@golemui/gui-shared';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import { cardValidators } from '../validators/cardValidators';
import { getBrand } from '../lib/cardBrands';
import { isPaymentValid } from '../lib/paymentValid';

export const AMOUNT = '€49.00';

/**
 * The whole checkout form, declared with the programmatic `gui.*` API.
 *
 *  - The card preview is a custom display widget whose props are a runtime
 *    function reading $form, so it mirrors the inputs live. Custom data lives
 *    under `props` (the engine flattens it onto the widget's templateData).
 *  - Card number / expiry / CVV are custom inputs (live formatting, MM/YY mask,
 *    brand-aware CVV). Their validators delegate to card-validator.
 *  - The CVV widget's label, max length and validator are all reactive: a
 *    runtime function reads the live brand and feeds the expected code size.
 *  - The Pay button is a submit button (validates the whole form first) and is
 *    disabled until every field is genuinely valid.
 */
export const checkoutConfig: GuiFormInitConfig = {
  data: {
    card: { number: '', expiry: '', cvv: '' },
    billing: { name: '' },
  },

  customValidators: cardValidators,

  customWidgetLoaders: {
    cardPreview: async () => (await import('../widgets/CardPreview')).CardPreview,
    cardNumber: async () => (await import('../widgets/CardNumberInput')).CardNumberInput,
    cardExpiry: async () => (await import('../widgets/CardExpiryInput')).CardExpiryInput,
    cardCvv: async () => (await import('../widgets/CvvInput')).CvvInput,
    textField: async () => (await import('../widgets/TextField')).TextField,
  },

  formDef: [
    // Live animated card. Reactive props read from $form, nested under `props`.
    gui.displays.custom('cardPreview', ({ $form }) => ({
      props: {
        number: $form?.card?.number ?? '',
        name: $form?.billing?.name ?? '',
        expiry: $form?.card?.expiry ?? '',
        cvv: $form?.card?.cvv ?? '',
      },
    })),

    // Cardholder name (custom text field, matches the card-specific fields).
    gui.inputs.custom('textField', 'billing.name', {
      label: 'Cardholder name',
      validator: {
        type: 'string',
        required: true,
        minLength: 2,
        messages: {
          required: 'Cardholder name is required',
          minLength: 'Enter the full name on the card',
        },
      },
      props: { placeholder: 'Jane Doe', icon: 'person', autocomplete: 'cc-name' },
    }),

    // Card number (custom: live spacing + brand badge).
    gui.inputs.custom('cardNumber', 'card.number', {
      label: 'Card number',
      validator: { type: 'custom', cardNumber: true },
      props: { placeholder: '1234 1234 1234 1234' },
    }),

    // Expiry + CVV side by side.
    gui.layouts.flex(
      [
        gui.inputs.custom('cardExpiry', 'card.expiry', {
          label: 'Expiry date',
          size: 1,
          validator: { type: 'custom', cardExpiry: true },
          props: { placeholder: 'MM/YY' },
        }),

        gui.inputs.custom('cardCvv', 'card.cvv', ({ $form }) => {
          const brand = getBrand($form?.card?.number ?? '');
          return {
            label: brand.codeLabel,
            size: 1,
            validator: { type: 'custom', cardCvv: brand.codeSize },
            props: { codeSize: brand.codeSize },
          };
        }),
      ],
      { gap: 'md' } as any,
    ),

    // Pay — submit button, disabled until the whole form is valid.
    gui.actions.button(({ $form }) => ({
      label: `Pay ${AMOUNT}`,
      icon: 'lock',
      iconPosition: 'left',
      actionType: 'submit',
      disabled: !isPaymentValid($form),
    })) as any,
  ],
};
