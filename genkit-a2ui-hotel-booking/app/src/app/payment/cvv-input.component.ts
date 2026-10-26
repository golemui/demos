import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { InputWidgetAdapter } from '@golemui/angular';
import type { InputWidget } from '@golemui/core';
import { digitsOnly } from './card-brands';
import { cardFlipped } from './flip-store';

interface Props {
  /** Fed by a runtime function reading the live card brand: 3 or 4. */
  codeSize?: number;
}

/**
 * CVV input. Two brand-aware behaviours:
 *  - max length follows the brand (4 for Amex, 3 otherwise), passed in via a
 *    runtime-function prop;
 *  - focusing it flips the card to its back (front for Amex). GolemUI has no
 *    onFocus event hook, so we toggle the shared `cardFlipped` signal directly
 *    and still call the adapter's onBlur() for touched/validation.
 */
@Component({
  selector: 'app-cvv-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InputWidgetAdapter],
  template: `
    @let td = adapter.templateData();
    <div class="field" [style.flex]="td.size">
      <label class="field__label" [for]="widget.uid">{{ td.label ?? 'CVV' }}</label>
      <div class="field__control" [class.field__control--error]="showError()">
        <span class="material-icons field__icon">lock</span>
        <input
          [id]="widget.uid"
          class="field__input"
          inputmode="numeric"
          autocomplete="cc-csc"
          [placeholder]="dots()"
          [attr.maxlength]="size()"
          [value]="td.value ?? ''"
          (focus)="flip(true)"
          (input)="onInput($any($event.target))"
          (blur)="flip(false); adapter.onBlur()"
        />
      </div>
      @if (showError()) {
        <span class="field__error">{{ td.errors?.[0] }}</span>
      }
    </div>
  `,
})
export class CvvInputComponent implements OnInit {
  widget!: InputWidget<string>;
  protected readonly adapter = inject(InputWidgetAdapter<string, Props>);

  protected readonly size = computed(() =>
    this.adapter.templateData().codeSize === 4 ? 4 : 3,
  );
  protected readonly dots = computed(() => '•'.repeat(this.size()));

  ngOnInit(): void {
    this.adapter.init(this.widget);
  }

  protected flip(value: boolean): void {
    cardFlipped.set(value);
  }

  protected onInput(target: HTMLInputElement): void {
    const next = digitsOnly(target.value).slice(0, this.size());
    this.adapter.valueChanged(next);
    target.value = next;
  }

  protected showError(): boolean {
    const td = this.adapter.templateData();
    return Boolean(td.touched) && (td.errors?.length ?? 0) > 0;
  }
}
