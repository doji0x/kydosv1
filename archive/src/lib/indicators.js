// Technical indicators, computed client-side from a candle series.
// Every function returns an array aligned 1:1 with the input (null where undefined),
// so results can be merged straight onto the chart rows.

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function stddev(values, period) {
  const out = new Array(values.length).fill(null);
  const means = sma(values, period);
  for (let i = period - 1; i < values.length; i++) {
    const mean = means[i];
    let acc = 0;
    for (let j = i - period + 1; j <= i; j++) acc += (values[j] - mean) ** 2;
    out[i] = Math.sqrt(acc / period);
  }
  return out;
}

export function bollinger(values, period = 20, mult = 2) {
  const middle = sma(values, period);
  const dev = stddev(values, period);
  return {
    middle,
    upper: middle.map((m, i) => (m === null ? null : m + mult * dev[i])),
    lower: middle.map((m, i) => (m === null ? null : m - mult * dev[i])),
  };
}

// Wilder's RSI.
export function rsi(values, period = 14) {
  const out = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const line = values.map((_, i) =>
    fastLine[i] === null || slowLine[i] === null ? null : fastLine[i] - slowLine[i]
  );
  // The signal EMA only runs over the defined stretch of the MACD line.
  const firstDefined = line.findIndex((v) => v !== null);
  const signal = new Array(values.length).fill(null);
  if (firstDefined !== -1) {
    const sig = ema(line.slice(firstDefined), signalPeriod);
    sig.forEach((v, i) => (signal[firstDefined + i] = v));
  }
  return {
    macd: line,
    signal,
    hist: line.map((v, i) => (v === null || signal[i] === null ? null : v - signal[i])),
  };
}

// Cumulative VWAP over the loaded series, using each bar's typical price.
export function vwap(candles) {
  let pv = 0;
  let vol = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume_usd || 0;
    pv += typical * v;
    vol += v;
    return vol > 0 ? pv / vol : typical;
  });
}

export const INDICATORS = [
  { key: "ema", label: "EMA", kind: "overlay" },
  { key: "bb", label: "BB", kind: "overlay" },
  { key: "vwap", label: "VWAP", kind: "overlay" },
  { key: "rsi", label: "RSI", kind: "panel" },
  { key: "macd", label: "MACD", kind: "panel" },
];

/** Merges the enabled indicator series onto the candle rows the chart renders. */
export function buildRows(candles, active) {
  const closes = candles.map((c) => c.close);
  const rows = candles.map((c) => ({ ...c, hl: [c.low, c.high] }));

  if (active.ema) {
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const e50 = ema(closes, 50);
    rows.forEach((r, i) => {
      r.ema9 = e9[i];
      r.ema21 = e21[i];
      r.ema50 = e50[i];
    });
  }
  if (active.bb) {
    const b = bollinger(closes, 20, 2);
    rows.forEach((r, i) => {
      r.bbUpper = b.upper[i];
      r.bbMiddle = b.middle[i];
      r.bbLower = b.lower[i];
    });
  }
  if (active.vwap) {
    const v = vwap(candles);
    rows.forEach((r, i) => (r.vwap = v[i]));
  }
  if (active.rsi) {
    const r14 = rsi(closes, 14);
    rows.forEach((r, i) => (r.rsi = r14[i]));
  }
  if (active.macd) {
    const m = macd(closes, 12, 26, 9);
    rows.forEach((r, i) => {
      r.macd = m.macd[i];
      r.macdSignal = m.signal[i];
      r.macdHist = m.hist[i];
    });
  }
  return rows;
}