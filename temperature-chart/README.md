# Live Temperature Chart

> Type twelve numbers and watch a Chart.js line graph redraw on every keystroke — a declarative form wired straight to live data viz.

Enter the average temperature for each month and a yearly curve updates in real
time, alongside a reactive stat line showing the average, min, and max. It's a
tiny demo of how cleanly a third-party charting library drops into a GolemUI
form.

**Built with GolemUI · Chart.js**

## What it shows off

- **Reactive runtime functions** — the chart's `series` and the stat line are
  functions of `$form`, re-evaluated by the engine on every data change, so
  everything stays live with no manual subscriptions.
- **Custom display widget** — a Chart.js line chart wrapped as a GolemUI widget
  (`temperatureChart`), created once and updated in place.
- **Layouts** — a `horizontalFlex` splits an auto-fitting `grid` of month inputs
  on the left from the chart on the right.
- **Typed inputs with validators** — twelve `numberInput`s bound to `temps.<key>`
  with min/max rules.

## Run it

```bash
npm install
npm run dev
```

## How it works

- **Form** (`src/App.tsx`): twelve `numberInput`s (`temps.jan` … `temps.dec`), a
  reactive `alert` that recomputes avg/min/max from the live values, and a custom
  `temperatureChart` display whose `series` prop is a runtime function reading
  `$form`.
- **Chart widget** (`src/widgets/TemperatureChart.tsx`): registers only the
  tree-shaken Chart.js pieces a line chart needs, creates the chart once in an
  effect, then pushes new values in whenever the form data changes.

## Learn more

- [GolemUI docs](https://golemui.com/dx/getting-started/installation/)
- [Form definition API](https://golemui.com/dx/form-definition-api/)
- [Widgets reference](https://golemui.com/dx/widgets-reference/)
