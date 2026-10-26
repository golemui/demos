import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { InputWidgetAdapter } from '@golemui/angular';
import type { InputWidget } from '@golemui/core';
import { digitsOnly } from './card-brands';

interface Props {
  placeholder?: string;
}

/** Masks input as MM/YY while typing; stores the "MM/YY" string. */
function maskExpiry(raw: string): string {
  const d = digitsOnly(raw).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

@Component({
  selector: 'app-card-expiry-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InputWidgetAdapter],
  template: `
    @let td = adapter.templateData();
    <div class="field" [style.flex]="td.size">
      <label class="field__label" [for]="widget.uid">{{ td.label ?? 'Expiry' }}</label>
      <div class="field__control" [class.field__control--error]="showError()">
        <span class="material-icons field__icon">event</span>
        <input
          [id]="widget.uid"
          class="field__input"
          inputmode="numeric"
          autocomplete="cc-exp"
          [placeholder]="td.placeholder ?? 'MM/YY'"
          [value]="td.value ?? ''"
          (input)="onInput($any($event.target))"
          (blur)="adapter.onBlur()"
        />
      </div>
      @if (showError()) {
        <span class="field__error">{{ td.errors?.[0] }}</span>
      }
    </div>
  `,
})
export class CardExpiryInputComponent implements OnInit {
  widget!: InputWidget<string>;
  protected readonly adapter = inject(InputWidgetAdapter<string, Props>);

  ngOnInit(): void {
    this.adapter.init(this.widget);
  }

  protected onInput(target: HTMLInputElement): void {
    const masked = maskExpiry(target.value);
    this.adapter.valueChanged(masked);
    target.value = masked;
  }

  protected showError(): boolean {
    const td = this.adapter.templateData();
    return Boolean(td.touched) && (td.errors?.length ?? 0) > 0;
  }
}
