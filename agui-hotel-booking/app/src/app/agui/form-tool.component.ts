import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormComponent } from '@golemui/gui-angular';
import type { FormEvent, FormSubmitEvent } from '@golemui/core';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import type { ToolCall } from '@ag-ui/core';

/**
 * Renders a `render_form` tool call as a live GolemUI form.
 *
 * Bridging detail: the tool argument `formDef` is the JSON form-definition
 * document `{ form: [...], states?: {...} }`. For JSON definitions the WHOLE
 * document is passed as `GuiFormInitConfig.formDef` (the "bare array" rule
 * only applies to the TS `gui.*` flavor — passing the bare array here makes
 * the engine fail with `form: Expected object literal, got "undefined"`).
 */
@Component({
  selector: 'app-form-tool',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormComponent],
  template: `
    @if (completed()) {
      <div class="form-tool form-tool--done">
        <span class="form-tool__check">✓</span> Form submitted — thanks!
      </div>
    } @else if (config(); as cfg) {
      <div class="form-tool">
        <gui-form
          [config]="cfg"
          (formSubmit)="onSubmit($event)"
          (formEvent)="formEvent.emit($event)"
        />
      </div>
    } @else {
      <div class="form-tool form-tool--error">This form could not be displayed.</div>
    }
  `,
  styles: `
    .form-tool {
      background: #fff;
      border: 1px solid #e3e3e8;
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
    }
    .form-tool--done {
      color: #1a7f37;
      font-weight: 500;
    }
    .form-tool__check {
      display: inline-flex;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 50%;
      background: #d7f5e0;
      align-items: center;
      justify-content: center;
      margin-right: 0.35rem;
    }
    .form-tool--error {
      color: #b42318;
    }
    .form-tool--hidden {
      display: none;
    }
  `,
})
export class FormToolComponent {
  readonly toolCall = input.required<ToolCall>();
  readonly completed = input(false);

  readonly submitted = output<Record<string, unknown>>();
  readonly formEvent = output<FormEvent>();

  protected readonly config = computed<GuiFormInitConfig | null>(() => {
    try {
      const args = JSON.parse(this.toolCall().function.arguments || '{}');
      const definition = args.formDef;
      if (!definition || !Array.isArray(definition.form)) return null;
      return {
        formDef: definition,
        data: args.data && typeof args.data === 'object' ? args.data : undefined,
        // Unique per tool call: several agent-rendered forms coexist in one
        // thread, and anonymous forms collide in the engine's registry.
        formName: `render_form:${this.toolCall().id}`,
      };
    } catch {
      return null;
    }
  });

  protected onSubmit(event: FormSubmitEvent): void {
    // Submit only fires when the whole form is valid — safe to report back.
    this.submitted.emit(event.data);
  }
}
