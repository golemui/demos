import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { InputWidgetAdapter } from '@golemui/angular';
import type { InputWidget } from '@golemui/core';
import { digitsOnly, formatCardNumber, getBrand } from './card-brands';
import { BrandMarkComponent } from './brand-mark.component';

interface Props {
  placeholder?: string;
}

/**
 * Custom input that stores the raw digits in form data but renders them
 * grouped with spaces (4242 4242 4242 4242) live as you type, with the brand
 * badge appearing as soon as the number is recognisable. A built-in textinput
 * can't reformat mid-typing without fighting the caret, so this is the clean
 * place to own that behaviour.
 */
@Component({
  selector: 'app-card-number-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InputWidgetAdapter],
  imports: [BrandMarkComponent],
  template: `
    @let td = adapter.templateData();
    <div class="field" [style.flex]="td.size">
      <label class="field__label" [for]="widget.uid">{{ td.label ?? 'Card number' }}</label>
      <div class="field__control" [class.field__control--error]="showError()">
        <span class="material-icons field__icon">credit_card</span>
        <input
          [id]="widget.uid"
          class="field__input"
          inputmode="numeric"
          autocomplete="cc-number"
          [placeholder]="td.placeholder ?? '1234 1234 1234 1234'"
          [value]="formatted()"
          (input)="onInput($any($event.target))"
          (blur)="adapter.onBlur()"
        />
        <span class="field__brand">
          <app-brand-mark [brand]="brand().id" />
        </span>
      </div>
      @if (showError()) {
        <span class="field__error">{{ td.errors?.[0] }}</span>
      }
    </div>
  `,
})
export class CardNumberInputComponent implements OnInit {
  widget!: InputWidget<string>;
  protected readonly adapter = inject(InputWidgetAdapter<string, Props>);

  protected readonly brand = computed(() => getBrand(this.adapter.templateData().value ?? ''));
  protected readonly formatted = computed(() =>
    formatCardNumber(this.adapter.templateData().value ?? ''),
  );

  ngOnInit(): void {
    this.adapter.init(this.widget);
  }

  protected onInput(target: HTMLInputElement): void {
    const next = digitsOnly(target.value).slice(0, this.brand().maxLength);
    this.adapter.valueChanged(next);
    // Keep the visible text formatted even if the engine echoes the same raw
    // value (signal equality would skip the re-render otherwise).
    target.value = formatCardNumber(next);
  }

  protected showError(): boolean {
    const td = this.adapter.templateData();
    return Boolean(td.touched) && (td.errors?.length ?? 0) > 0;
  }
}
