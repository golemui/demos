import { useEffect, useRef } from 'react';
import type { DisplayWidget, WithWidget } from '@golemui/core';
import { useDisplayWidget } from '@golemui/react';
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
  const { uid, templateData } = useDisplayWidget<TemperatureChartProps>(widget);

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
            // Canvas can't resolve CSS vars, so use concrete colors here (Clay terracotta).
            borderColor: '#c25e4e',
            backgroundColor: 'rgba(194, 94, 78, 0.16)',
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#c25e4e',
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
          // Clay's muted ink: readable on both the light and the dark theme.
          y: {
            title: { display: true, text: '°C', color: '#8c7b6f' },
            ticks: { color: '#8c7b6f' },
            grid: { color: 'rgba(140, 123, 111, 0.22)' },
          },
          x: { ticks: { color: '#8c7b6f' }, grid: { display: false } },
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
