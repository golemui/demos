import { useEffect, useRef } from 'react';
import type { DisplayWidget, WithWidget } from '@golemui/core';
// NOTE: in @golemui/react@0.17 the display hook is exported with a typo
// ("Wdiget"). The docs call it `useDisplayWidget`; the package ships
// `useDisplayWdiget`. We use the real exported name.
import { useDisplayWdiget } from '@golemui/react';
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

// Register only the pieces a line chart needs (tree-shaken build).
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Filler,
  Legend,
);

/**
 * Props authored on the form definition and flattened onto `templateData`.
 * `series` is supplied as a runtime function `({ $form }) => number[]`, so the
 * engine re-evaluates it on every form-data change and the chart stays live.
 */
interface TemperatureChartProps {
  months: string[];
  series: (number | null)[];
}

export function TemperatureChart(widgetInstance: WithWidget) {
  const widget = widgetInstance.widget as DisplayWidget;
  const { uid, templateData } = useDisplayWdiget<TemperatureChartProps>(widget);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);

  const months = templateData.months ?? [];
  const series = templateData.series ?? [];

  // Create the Chart.js instance once, then tear it down on unmount.
  useEffect(() => {
    if (!canvasRef.current) return;

    chartRef.current = new Chart<'line'>(canvasRef.current, {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Avg °C',
            data: series as number[],
            // Canvas can't resolve CSS vars, so use concrete colors here.
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.18)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#6366f1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => ` ${c.formattedValue} °C` } },
        },
        scales: {
          y: {
            title: { display: true, text: '°C' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' },
          },
          x: { grid: { display: false } },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // Create once — live updates are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push new values into the existing chart whenever the form data changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = months;
    chart.data.datasets[0].data = series as number[];
    chart.update();
  }, [months, series]);

  return (
    <div className="temperature-chart" style={{ flex: templateData.size }}>
      <h2 className="temperature-chart__title">Yearly temperature curve</h2>
      <div className="temperature-chart__canvas-wrap" id={uid}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
