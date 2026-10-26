import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { InputWidgetAdapter } from '@golemui/angular';
import type { InputWidget } from '@golemui/core';

interface Props {
  placeholder?: string;
  icon?: string;
  autocomplete?: string;
}

/**
 * Generic custom text input matching the look of the card-specific fields.
 *
 * The custom-widget contract in Angular: the host assigns `widget`, the
 * component injects `InputWidgetAdapter` and calls `init(widget)`; from there
 * `templateData()` is a live signal and `valueChanged`/`onBlur` report back.
 */
@Component({
  selector: 'app-pay-text-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [InputWidgetAdapter],
  template: `
    @let td = adapter.templateData();
    <div class="field" [style.flex]="td.size">
      <label class="field__label" [for]="widget.uid">{{ td.label ?? '' }}</label>
      <div class="field__control" [class.field__control--error]="showError()">
        @if (td.icon) {
          <span class="material-icons field__icon">{{ td.icon }}</span>
        }
        <input
          [id]="widget.uid"
          class="field__input"
          [autocomplete]="td.autocomplete ?? 'on'"
          [placeholder]="td.placeholder ?? ''"
          [value]="td.value ?? ''"
          (input)="adapter.valueChanged($any($event.target).value)"
          (blur)="adapter.onBlur()"
        />
      </div>
      @if (showError()) {
        <span class="field__error">{{ td.errors?.[0] }}</span>
      }
    </div>
  `,
})
export class TextFieldComponent implements OnInit {
  widget!: InputWidget<string>;
  protected readonly adapter = inject(InputWidgetAdapter<string, Props>);

  ngOnInit(): void {
    this.adapter.init(this.widget);
  }

  protected showError(): boolean {
    const td = this.adapter.templateData();
    return Boolean(td.touched) && (td.errors?.length ?? 0) > 0;
  }
}
