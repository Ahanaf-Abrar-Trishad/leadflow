/** Builds an SVG polyline `points` string from a series of values, scaled to
 * fit a w×h viewBox. Flat (all-equal or single-value) series render as a
 * centered horizontal line rather than dividing by zero. */
export function sparklinePoints(values: number[], w = 120, h = 26): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `0,${h / 2} ${w},${h / 2}`;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
}

export function Sparkline({ values, width = 120, height = 26, stroke = "currentColor", className }: SparklineProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ width: "100%", height, display: "block" }}
      aria-hidden="true"
    >
      <polyline
        points={sparklinePoints(values, width, height)}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
