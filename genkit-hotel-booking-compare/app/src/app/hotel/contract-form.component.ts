import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { FormComponent } from '@golemui/gui-angular';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import { ActionSchema, type ComponentApi } from '@a2ui/web_core/v0_9';
import { z } from 'zod';
import { CONTRACT_FORM, formForOperation, type AskableOperation } from '@hotel/shared';
import { handleBookingFormEvent } from './booking-form-events';
import { pickPaths } from './contract-labels';
import { HotelComponent } from './hotel-component';

export const ContractFormApi = {
  name: CONTRACT_FORM,
  schema: z
    .object({
      operation: z.enum(['createBooking', 'updateBooking']),
      fields: z.array(z.string()),
      prefill: z.record(z.string(), z.any()).optional(),
      submitLabel: z.string().optional(),
      action: ActionSchema,
    })
    .strict(),
} satisfies ComponentApi;

/**
 * `ContractForm` — the agent names an operation and the fields it still needs;
 * this renders the GolemUI form GENERATED from the hotel's OpenAPI (sliced to
 * those fields), with the contract's validation and the host's business rules.
 * On submit it fires the agent's event with `{ values }` in the API's shape.
 */
@Component({
  selector: 'hotel-contract-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormComponent],
  template: `
    @if (config(); as c) {
      <div class="hotel-surface">
        <gui-form [config]="c" (formSubmit)="submit($event)" (formEvent)="onFormEvent($event)" />
      </div>
    }
  `,
})
export class ContractFormComponent extends HotelComponent<typeof ContractFormApi> {
  private readonly operation = computed(() => this.prop<AskableOperation>('operation') ?? 'createBooking');
  private readonly fields = computed(() => this.prop<string[]>('fields') ?? []);

  /** Built once per (operation, fields, prefill): rebuilding re-initialises the GolemUI form. */
  protected readonly config = computed(
    () => ({
      formDef: formForOperation({ operation: this.operation(), fields: this.fields(), submitLabel: this.prop<string>('submitLabel') ?? 'Continue' }),
      data: structuredClone(this.prop<Record<string, unknown>>('prefill') ?? {}),
      formName: `contract-${this.surfaceId()}-${this.componentId()}`,
    }),
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  protected submit(event: FormSubmitEvent): void {
    const name = this.prop<{ event?: { name?: string } }>('action')?.event?.name ?? 'submit';
    this.fire(name, { values: pickPaths(event.data, this.fields()) });
  }

  protected onFormEvent(event: FormEvent): void {
    handleBookingFormEvent(event); // both operations are bookings: same dates cap and rules
  }
}
