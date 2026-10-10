import { formatMoney } from "../utils/format";

/**
 * Lightweight SVG charts. No charting dependency — these render directly from
 * computed series so the dashboard stays inside the "no unnecessary
 * dependencies" rule.
 */

export type Series = { label: string; value: number };

/** Smoothed area + line chart used for revenue trends. */
export function TrendChart({ series, height = 190 }: { series: Series[]; height?: number }) {
  const values = series.map((point) => point.value);
  const max = Math.max(1, ...values);
  const width = 700;
  const step = series.length > 1 ? width / (series.length - 1) : width;

  const toY = (value: number) => height - 12 - (value / max) * (height - 34);
  const points = series.map((point, index) => ({ x: index * step, y: toY(point.value) }));

  // Catmull-Rom style smoothing via cubic segments between midpoints.
  const path = points.reduce((acc, point, index, all) => {
    if (index === 0) return `M${point.x} ${point.y}`;
    const previous = all[index - 1];
    const controlX = (previous.x + point.x) / 2;
    return `${acc} C${controlX} ${previous.y} ${controlX} ${point.y} ${point.x} ${point.y}`;
  }, "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="trend-svg" role="img" aria-label="Revenue trend">
      <defs>
        <linearGradient id="trend-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity=".26" />
          <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="chart-area" d={`${path} L${width} ${height} L0 ${height}Z`} />
      <path className="chart-line" d={path} />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={series.length > 40 ? 0 : 2.6} className="chart-dot" />
      ))}
    </svg>
  );
}

/** Status distribution donut with a centre total. */
export function DonutChart({ segments, total, centreLabel }: { segments: { label: string; value: number; color: string }[]; total: number; centreLabel: string }) {
  const sum = segments.reduce((acc, segment) => acc + segment.value, 0) || 1;
  let offset = 0;
  const gradient = segments
    .map((segment) => {
      const start = (offset / sum) * 100;
      offset += segment.value;
      const end = (offset / sum) * 100;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(",");

  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${gradient || "#cbd5e1 0 100%"})` }}>
        <div>
          <strong>{total}</strong>
          <span>{centreLabel}</span>
        </div>
      </div>
    </div>
  );
}

export function LegendList({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  return (
    <div className="status-list">
      {segments.map((segment) => (
        <div key={segment.label}>
          <span className="legend" style={{ background: segment.color }} />
          <span>{segment.label}</span>
          <strong>{segment.value}</strong>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bar comparison, used for branch performance. */
export function BarList({ series, currencySymbol }: { series: Series[]; currencySymbol: string }) {
  const max = Math.max(1, ...series.map((point) => point.value));
  return (
    <div className="bar-list">
      {series.map((point) => (
        <div key={point.label}>
          <span className="bar-label">{point.label}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(point.value / max) * 100}%` }} />
          </span>
          <strong>{formatMoney(point.value, currencySymbol, 0)}</strong>
        </div>
      ))}
    </div>
  );
}
