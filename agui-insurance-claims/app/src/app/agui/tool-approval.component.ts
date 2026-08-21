import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormComponent } from '@golemui/gui-angular';
import type { FormSubmitEvent } from '@golemui/core';
import type { GuiFormInitConfig } from '@golemui/gui-shared';
import type { Tool, ToolCall } from '@ag-ui/core';
import { diffProposal, schemaToFormDef } from './harness';
import type { ApprovalDecision, HumanChange } from './harness';

/**
 * The human half of the agent harness: an approval surface for a tool call.
 *
 * Instead of a yes/no confirmation, the tool's JSON Schema is rendered as a
 * GolemUI form (see `harness.ts`) PRE-FILLED with the arguments the agent
 * proposed. The human can approve as-is, edit any field first (the schema's
 * constraints validate their edits too), or reject. The emitted decision
 * includes the diff between proposal and approval.
 *
 * Note what this component does NOT know: anything about payouts, claims, or
 * any specific tool. One component supervises every tool the host registers.
 */
@Component({
  selector: 'app-tool-approval',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormComponent],
  template: `
    @if (decision(); as made) {
      <div class="approval approval--done">
        @if (made.status === 'approved') {
          <div class="approval__result approval__result--ok">
            <span class="approval__check">✓</span>
            Approved — <code>{{ tool().name }}</code> executed
          </div>
          @if (made.humanChanges.length > 0) {
            <ul class="approval__changes">
              @for (change of made.humanChanges; track change.path) {
                <li>
                  <code>{{ change.path }}</code
                  >: {{ change.proposed }} <span class="approval__arrow">→</span>
                  {{ change.approved }}
                </li>
              }
            </ul>
          }
        } @else {
          <div class="approval__result approval__result--no">
            ✗ Rejected — <code>{{ tool().name }}</code> was not executed
          </div>
        }
      </div>
    } @else if (completed()) {
      <div class="approval approval--done">
        <div class="approval__result">This request was already handled.</div>
      </div>
    } @else if (config(); as cfg) {
      <div class="approval">
        <div class="approval__header">
          <span class="approval__badge">Approval required</span>
          The agent wants to run <code>{{ tool().name }}</code> — review and edit before it
          executes.
        </div>
        <gui-form [config]="cfg" (formSubmit)="onApprove($event)" />
        <div class="approval__footer">
          <button type="button" class="approval__reject" (click)="onReject()">Reject</button>
        </div>
      </div>
    } @else {
      <div class="approval approval--error">This tool call could not be displayed.</div>
    }
  `,
  styles: `
    .approval {
      background: #fffdf5;
      border: 1px solid #eadfae;
      border-left: 4px solid #d9a514;
      border-radius: 12px;
      padding: 1rem 1.25rem;
      margin-top: 0.5rem;
    }
    .approval--done {
      background: #fff;
      border-left-width: 1px;
      border-color: #e3e3e8;
    }
    .approval__header {
      margin-bottom: 0.75rem;
      color: #4a4a52;
      line-height: 1.5;
    }
    .approval__badge {
      display: inline-block;
      background: #fdf0c9;
      color: #8a6a0b;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-radius: 999px;
      padding: 0.15rem 0.6rem;
      margin-right: 0.5rem;
    }
    .approval__footer {
      margin-top: 0.5rem;
      display: flex;
      justify-content: flex-end;
    }
    .approval__reject {
      border: 1px solid #d4d4dd;
      background: #fff;
      color: #b42318;
      border-radius: 10px;
      padding: 0.45rem 1rem;
      font: inherit;
      cursor: pointer;
    }
    .approval__reject:hover {
      background: #fdecea;
    }
    .approval__result {
      font-weight: 500;
    }
    .approval__result--ok {
      color: #1a7f37;
    }
    .approval__result--no {
      color: #b42318;
    }
    .approval__check {
      display: inline-flex;
      width: 1.4rem;
      height: 1.4rem;
      border-radius: 50%;
      background: #d7f5e0;
      align-items: center;
      justify-content: center;
      margin-right: 0.35rem;
    }
    .approval__changes {
      margin: 0.5rem 0 0;
      padding-left: 1.4rem;
      color: #5d5d66;
      font-size: 0.9rem;
    }
    .approval__arrow {
      color: #d9a514;
      font-weight: 700;
    }
    .approval--error {
      color: #b42318;
    }
    code {
      background: #f2f2f7;
      border-radius: 4px;
      padding: 0.05rem 0.3rem;
      font-size: 0.9em;
    }
  `,
})
export class ToolApprovalComponent {
  readonly toolCall = input.required<ToolCall>();
  readonly tool = input.required<Tool>();
  readonly completed = input(false);

  readonly decided = output<ApprovalDecision>();

  /** The arguments the agent proposed, parsed from the tool call. */
  protected readonly proposal = computed<Record<string, unknown>>(() => {
    try {
      return JSON.parse(this.toolCall().function.arguments || '{}');
    } catch {
      return {};
    }
  });

  /** Schema-derived form definition, pre-filled with the agent's proposal. */
  protected readonly config = computed<GuiFormInitConfig | null>(() => {
    const parameters = this.tool().parameters as Record<string, unknown> | undefined;
    if (!parameters || typeof parameters !== 'object') return null;
    return {
      formDef: schemaToFormDef(parameters),
      data: this.proposal(),
    };
  });

  protected readonly decision = signal<
    { status: 'approved'; humanChanges: HumanChange[] } | { status: 'rejected' } | null
  >(null);

  protected onApprove(event: FormSubmitEvent): void {
    // formSubmit only fires when the form is valid — the human's edits already
    // passed the same schema-derived validation the agent's proposal did.
    const humanChanges = diffProposal(this.proposal(), event.data);
    this.decision.set({ status: 'approved', humanChanges });
    this.decided.emit({ status: 'approved', data: event.data, humanChanges });
  }

  protected onReject(): void {
    this.decision.set({ status: 'rejected' });
    this.decided.emit({ status: 'rejected' });
  }
}
