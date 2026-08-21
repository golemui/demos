import { validateFormDefinition } from '@golemui/gui-mcp/json';

export interface ValidationOutcome {
  valid: boolean;
  /** LLM-readable report of every problem; empty string when valid. */
  report: string;
}

/**
 * Validates a GolemUI form definition (`{ form: [...widgets], states?: {...} }`)
 * using the same validator that backs the `json_validate_form_definition` MCP tool.
 *
 * Schema `errors` are blocking. `warnings` (likely-custom widget types) are also
 * treated as blocking here: the demo frontend only ships the built-in widgets, so
 * an unknown widget type would render nothing. Expression/interpolation warnings
 * are advisory and reported without failing validation.
 */
export function validateFormDef(formDef: unknown): ValidationOutcome {
  if (formDef === null || typeof formDef !== 'object' || Array.isArray(formDef)) {
    return {
      valid: false,
      report:
        'render_form failed: `formDef` must be an object shaped { "form": [ ...widgets ], "states"?: { ... } }.',
    };
  }

  const result = validateFormDefinition({ formDefinition: formDef });
  const problems: string[] = [];

  for (const e of result.errors) {
    problems.push(`- ${e.path || '(root)'}: ${e.message}${e.suggestion ? ` Fix: ${e.suggestion}` : ''}`);
  }
  for (const w of result.warnings) {
    problems.push(
      `- ${w.path || '(root)'}: ${w.message}${w.suggestion ? ` Fix: ${w.suggestion}` : ''} ` +
        '(only built-in widget types are available in this app)',
    );
  }

  if (problems.length > 0) {
    return {
      valid: false,
      report:
        'The GolemUI form definition is INVALID. Fix every problem below, then call render_form again with the corrected definition:\n' +
        problems.join('\n'),
    };
  }

  return { valid: true, report: '' };
}
