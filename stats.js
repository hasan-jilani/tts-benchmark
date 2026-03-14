/**
 * Statistical helpers for benchmark analysis.
 */

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1));
}

function min(arr) {
  return arr.length ? Math.min(...arr) : 0;
}

function max(arr) {
  return arr.length ? Math.max(...arr) : 0;
}

function summarize(values) {
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    stdev: stdev(values),
    min: min(values),
    max: max(values),
  };
}

module.exports = { mean, median, percentile, stdev, min, max, summarize };
