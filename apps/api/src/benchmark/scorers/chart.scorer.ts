export function scoreChart(
  chart_config: Record<string, unknown> | null,
): boolean {
  if (!chart_config) return false;
  if (!chart_config.series) return false;

  const series = chart_config.series;
  if (!Array.isArray(series) || series.length === 0) return false;

  const first = series[0] as Record<string, unknown>;
  if (first.data === undefined || first.data === null) return false;
  if (Array.isArray(first.data) && first.data.length === 0) return false;

  return true;
}
