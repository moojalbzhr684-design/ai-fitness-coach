export function WeightChart({ points }: { points: Array<{ measuredAt: Date; weightKg: number }> }) {
  if (points.length < 2) return <div className="empty">At least two measurements are needed for a trend chart.</div>;
  const width = 760;
  const height = 210;
  const pad = 28;
  const weights = points.map((point) => point.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = Math.max(1, max - min);
  const coordinates = points.map((point, index) => ({
    x: pad + index * ((width - pad * 2) / Math.max(1, points.length - 1)),
    y: pad + ((max - point.weightKg) / range) * (height - pad * 2),
    point,
  }));
  const line = coordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  return <div className="chart" aria-label="Weight trend chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Weight changed from ${weights[0]} to ${weights.at(-1)} kilograms`}>
      {[0, 1, 2, 3].map((index) => <line className="chart-axis" x1={pad} x2={width - pad} y1={pad + index * ((height - pad * 2) / 3)} y2={pad + index * ((height - pad * 2) / 3)} key={index} />)}
      <polygon className="chart-area" points={area} />
      <polyline className="chart-line" points={line} />
      {coordinates.map(({ x, y, point }, index) => <g key={`${point.measuredAt.toISOString()}-${index}`}><circle className="chart-dot" cx={x} cy={y} r="4" /><text className="chart-label" x={x} y={y - 10} textAnchor="middle">{point.weightKg.toFixed(1)}</text></g>)}
    </svg>
  </div>;
}
