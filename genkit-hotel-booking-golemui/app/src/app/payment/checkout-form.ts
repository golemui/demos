import { gui } from '@golemui/gui-shared';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import { cardValidators } from './card-validators';
import { getBrand } from './card-brands';
import { isPaymentValid } from './payment-valid';
import { CardPreviewComponent } from './card-preview.component';
import { CardNumberInputComponent } from './card-number-input.component';
import { CardExpiryInputComponent } from './card-expiry-input.component';
import { CvvInputComponent } from './cvv-input.component';
import { TextFieldComponent } from './text-field.component';

/**
 * The whole checkout, declared with the programmatic `gui.*` API — the same
 * definition as the React credit-card demo, loading Angular components as the
 * custom widgets. This is the "forms as portable data" pitch in one file: the
 * definition is data + functions returning data; only the widget loaders are
 * framework-specific.
 *
 *  - The card preview is a custom display widget whose props are a runtime
 *    function reading $form, so it mirrors the inputs live.
 *  - Card number / expiry / CVV are custom inputs (live formatting, MM/YY
 *    mask, brand-aware CVV). Their validators delegate to card-validator.
 *  - The CVV widget's label, max length and validator are all reactive: a
 *    runtime function reads the live brand and feeds the expected code size.
 *  - The Pay button is a submit button (validates the whole form first) and
 *    is disabled until every field is genuinely valid.
 */
export function buildCheckoutConfig(amountLabel: string): GuiFormInitConfig {
  return {
    data: {
      card: { number: '', expiry: '', cvv: '' },
      billing: { name: '' },
    },

    customValidators: cardValidators,

    customWidgetLoaders: {
      cardPreview: async () => CardPreviewComponent,
      cardNumber: async () => CardNumberInputComponent,
      cardExpiry: async () => CardExpiryInputComponent,
      cardCvv: async () => CvvInputComponent,
      textField: async () => TextFieldComponent,
    },

    formDef: [
      // Live animated card. Reactive props read from $form, nested under `props`.
      gui.displays.custom('cardPreview', ({ $form }) => ({
        props: {
          number: $form?.['card']?.number ?? '',
          name: $form?.['billing']?.name ?? '',
          expiry: $form?.['card']?.expiry ?? '',
          cvv: $form?.['card']?.cvv ?? '',
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
      gui.layouts.horizontalGrid(
        [
          gui.inputs.custom('cardExpiry', 'card.expiry', {
            label: 'Expiry date',
            size: 1,
            validator: { type: 'custom', cardExpiry: true },
            props: { placeholder: 'MM/YY' },
          }),

          gui.inputs.custom('cardCvv', 'card.cvv', ({ $form }) => {
            const brand = getBrand($form?.['card']?.number ?? '');
            return {
              label: brand.codeLabel,
              size: 1,
              validator: { type: 'custom', cardCvv: brand.codeSize },
              props: { codeSize: brand.codeSize },
            };
          }),
        ],
        { gap: 'md' },
      ),

      // Pay — submit button, disabled until the whole form is valid.
      gui.actions.button(({ $form }) => ({
        label: `Pay ${amountLabel}`,
        icon: 'lock',
        iconPosition: 'left',
        actionType: 'submit',
        disabled: !isPaymentValid($form ?? {}),
      })) as never,
    ],
  };
}
