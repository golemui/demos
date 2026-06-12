import type { FormEvent } from '@golemui/core';
import { GuiForm } from '@golemui/gui-react';
import { gui } from '@golemui/gui-shared';
import { customWidgetLoaders } from './widgets/customWidgetLoaders';
import { DemoShell } from './_shared/DemoShell';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const MONTH_KEYS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

// A seasonal curve (temperate northern-hemisphere city, °C) so the chart
// shows something meaningful on first load.
const INITIAL_TEMPS: Record<string, number> = {
  jan: 4, feb: 5, mar: 9, apr: 13, may: 17, jun: 21,
  jul: 24, aug: 23, sep: 19, oct: 14, nov: 8, dec: 5,
};

type FormShape = { temps?: Record<string, number | string | null> };

/** Pull the 12 monthly values out of the live form data, in calendar order. */
function readSeries($form: FormShape): (number | null)[] {
  return MONTH_KEYS.map((key) => {
    const raw = $form?.temps?.[key];
    if (raw === '' || raw == null) return null;
    const n = Number(raw);
    return Number.isNaN(n) ? null : n;
  });
}

// One number input per month, bound to `temps.<key>`.
const monthInputs = MONTH_KEYS.map((key, i) =>
  gui.inputs.numberInput(`temps.${key}`, {
    label: MONTHS[i],
    placeholder: '°C',
    step: 0.5,
    // For typed inputs the `type` is implied — supply just the rules.
    validator: { minimum: -60, maximum: 60 },
  }),
);

const formDef = [
  // Reactive stat line — recomputed on every keystroke via a runtime function.
  gui.displays.alert(({ $form }) => {
    const values = readSeries($form as FormShape).filter(
      (v): v is number => v != null,
    );
    if (values.length === 0) {
      return {
        level: 'info' as const,
        text: 'Enter the monthly averages to see the yearly curve.',
      };
    }
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return {
      level: 'info' as const,
      text: `Average ${avg.toFixed(1)} °C  ·  Min ${min} °C  ·  Max ${max} °C`,
    };
  }),

  // Inputs on the left, live chart on the right.
  gui.layouts.horizontalFlex(
    [
      gui.layouts.grid(monthInputs, {
        autoFit: true,
        columnGap: 12,
        rowGap: 4,
        size: 1,
      }),
      gui.displays.custom('temperatureChart', {
        size: 2,
        months: MONTHS,
        // Runtime function: re-evaluated by the engine on every data change,
        // so the chart stays in sync with the inputs.
        series: ({ $form }: { $form: FormShape }) => readSeries($form),
      }),
    ],
    { gap: 24, align: 'start' },
  ),
];

const config = {
  formDef,
  data: { temps: INITIAL_TEMPS },
  customWidgetLoaders,
  formConfig: { validateOn: 'change' as const },
};

function handleFormEvent(event: FormEvent) {
  // No submit flow in this demo, but the hook is here if you want one.
  console.log('form event:', event.name, event.data);
}

export function App() {
  return (
    <DemoShell demoName="Chart.js integration">
      <h1 className="demo-title">Monthly Temperatures</h1>
      <p className="subtitle">
        Type the average temperature for each month — the chart updates live.
      </p>
      <GuiForm config={config} formEvent={handleFormEvent} />
    </DemoShell>
  );
}
