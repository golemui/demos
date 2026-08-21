import type { Tool } from '@ag-ui/core';
import type { HarnessToolRegistry } from '../agui/harness';

/**
 * The business half of the harness: one supervised tool.
 *
 * Note the division of labour — this file only declares WHAT the tool is
 * (a plain JSON Schema, no GolemUI anywhere) and what runs once a human
 * approves. The generic bridge in app/agui/ turns the schema into the
 * approval form automatically. Adding another supervised action to your
 * product is: write a schema, write an execute function, register it.
 *
 * The schema is also the policy: `amount.maximum` caps what the agent can
 * propose AND what the human can approve, in the same place.
 */
export const ISSUE_PAYOUT_TOOL: Tool = {
  name: 'issue_payout',
  description: `Issue a payout for an approved insurance claim via bank transfer.

This action is NOT executed directly: the application shows your proposed arguments to the customer as an editable approval form. The tool result reports what happened:
- { "status": "approved", "humanChanges": [...], "result": { "transferId": ... } } — the transfer ran. humanChanges lists every field the customer edited before approving (empty if approved as-is).
- { "status": "rejected" } — the customer declined. Do not call the tool again with the same proposal; ask how they'd like to proceed.`,
  parameters: {
    type: 'object',
    properties: {
      claimId: {
        type: 'string',
        title: 'Claim',
        description: 'The claim being settled, e.g. CLM-2026-1234',
      },
      beneficiary: {
        type: 'string',
        title: 'Beneficiary',
        description: 'Name of the account holder receiving the transfer',
      },
      amount: {
        type: 'number',
        title: 'Amount (EUR)',
        minimum: 1,
        maximum: 5000,
      },
      note: {
        type: 'string',
        title: 'Transfer note',
        description: 'Reference shown on the bank statement',
        maxLength: 140,
      },
    },
    required: ['claimId', 'beneficiary', 'amount'],
  },
};

/** Pretend to run the transfer. In a real product this calls your backend. */
function executePayout(data: Record<string, unknown>): Record<string, unknown> {
  const transferId = `TRF-${String(Math.floor(100000 + Math.random() * 900000))}`;
  console.log(`[claims] payout executed: ${transferId}`, data);
  return { transferId, status: 'completed', executedAt: new Date().toISOString() };
}

/** Every tool the harness supervises in this app. */
export const CLAIMS_HARNESS_TOOLS: HarnessToolRegistry = {
  [ISSUE_PAYOUT_TOOL.name]: { tool: ISSUE_PAYOUT_TOOL, execute: executePayout },
};
