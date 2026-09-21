// Canvas renderer for the terminal-style candle chart: gridded plot, volume histogram along the
// bottom, right-hand price gutter, crosshair with axis tags, and an in-plot OHLC legend.
import { formatChartValue } from "@/components/rh/chart/chartScale";
import { AXIS_W, TIME_H, VOL_FRAC, clamp, fmtTime, makeScales, niceTicks, palette } from "@/lib/chart/geometry";
import { drawCandles } from "@/lib/chart/drawCandles";

const LEGEND_H = 18;

function timeStep(barW) {
  return Math.max(1, Math.ceil(96 / barW));
}

function drawFrame(ctx, s, domain, colors, mode) {
  // Price gutter background so the axis reads as its own column.
  ctx.fillStyle = colors.gutter;
  ctx.fillRect(s.plotW, 0, AXIS_W, s.plotH + TIME_H);
  ctx.fillRect(0, s.plotH, s.plotW, TIME_H);

  ctx.lineWidth = 1;
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (const v of niceTicks(domain[0], domain[1])) {
    const yy = Math.round(s.y(v)) + 0.5;
    if (yy < 0 || yy > s.plotH) continue;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(s.plotW, yy);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.fillText(formatChartValue(v, mode), s.plotW + 7, clamp(yy, 8, s.plotH - 8));
  }

  ctx.strokeStyle = colors.axis;
  ctx.beginPath();
  ctx.moveTo(s.plotW + 0.5, 0);
  ctx.lineTo(s.plotW + 0.5, s.plotH + TIME_H);
  ctx.moveTo(0, s.plotH + 0.5);
  ctx.lineTo(s.plotW + AXIS_W, s.plotH + 0.5);
  ctx.stroke();
}

function drawTimeAxis(ctx, s, rows, first, last, barW, colors, timeframe) {
  const step = timeStep(barW);
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = Math.ceil(first / step) * step; i <= last; i += step) {
    const x = Math.round(s.x(i)) + 0.5;
    if (x < 0 || x > s.plotW) continue;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, s.plotH);
    ctx.stroke();
    ctx.fillStyle = colors.text;
    ctx.fillText(fmtTime(rows[i].t, timeframe), x, s.plotH + TIME_H / 2);
  }
}

function drawVolume(ctx, s, rows, first, last, barW, colors) {
  let peak = 0;
  for (let i = first; i <= last; i++) peak = Math.max(peak, rows[i].volume_usd || 0);
  if (!peak) return;
  const h = s.plotH * VOL_FRAC;
  const bodyW = Math.max(Math.floor(barW * 0.7), 1);
  ctx.globalAlpha = 0.28;
  for (let i = first; i <= last; i++) {
    const v = rows[i].volume_usd || 0;
    if (!v) continue;
    const bh = Math.max((v / peak) * h, 1);
    ctx.fillStyle = rows[i].close >= rows[i].open ? colors.up : colors.down;
    ctx.fillRect(Math.round(s.x(i)) - bodyW / 2, s.plotH - bh, bodyW, bh);
  }
  ctx.globalAlpha = 1;
}

function drawLine(ctx, s, rows, first, last, key, color, dash = []) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false;
  for (let i = first; i <= last; i++) {
    const v = rows[i][key];
    if (!Number.isFinite(v)) continue;
    started ? ctx.lineTo(s.x(i), s.y(v)) : ctx.moveTo(s.x(i), s.y(v));
    started = true;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

// Shaded Bollinger channel, the way a terminal paints it.
function drawBand(ctx, s, rows, first, last, colors) {
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = colors.c4;
  ctx.beginPath();
  let started = false;
  for (let i = first; i <= last; i++) {
    const v = rows[i].bbUpper;
    if (!Number.isFinite(v)) continue;
    started ? ctx.lineTo(s.x(i), s.y(v)) : ctx.moveTo(s.x(i), s.y(v));
    started = true;
  }
  for (let i = last; i >= first; i--) {
    const v = rows[i].bbLower;
    if (Number.isFinite(v)) ctx.lineTo(s.x(i), s.y(v));
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
  drawLine(ctx, s, rows, first, last, "bbUpper", colors.c4);
  drawLine(ctx, s, rows, first, last, "bbLower", colors.c4);
  drawLine(ctx, s, rows, first, last, "bbMiddle", colors.c4, [3, 3]);
}

function tag(ctx, x, y, text, bg, fg, align = "left") {
  ctx.font = ctx.font;
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  ctx.fillRect(align === "center" ? x - w / 2 : x, y - 8, w, 16);
  ctx.fillStyle = fg;
  ctx.textAlign = align === "center" ? "center" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, align === "center" ? x : x + 6, y);
}

function drawPriceTag(ctx, s, value, color, colors, mode) {
  const yy = Math.round(s.y(value)) + 0.5;
  if (yy < 0 || yy > s.plotH) return;
  ctx.strokeStyle = color;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, yy);
  ctx.lineTo(s.plotW, yy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.fillRect(s.plotW + 1, yy - 8, AXIS_W - 2, 16);
  ctx.fillStyle = colors.bg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatChartValue(value, mode), s.plotW + 7, yy);
}

// O/H/L/C readout pinned to the top-left of the plot, like the reference terminal.
function drawLegend(ctx, s, row, colors, mode) {
  if (!row) return;
  const up = row.close >= row.open;
  const chg = row.open ? ((row.close - row.open) / row.open) * 100 : 0;
  const parts = [
    ["O", formatChartValue(row.open, mode)],
    ["H", formatChartValue(row.high, mode)],
    ["L", formatChartValue(row.low, mode)],
    ["C", formatChartValue(row.close, mode)],
    ["", `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`],
  ];
  let x = 10;
  const y = LEGEND_H / 2 + 4;
  for (const [label, value] of parts) {
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (label) {
      ctx.fillStyle = colors.text;
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 2;
    }
    ctx.fillStyle = up ? colors.up : colors.down;
    ctx.fillText(value, x, y);
    x += ctx.measureText(value).width + 10;
  }
}

export function renderChart(canvas, { width, height, rows, first, last, endIndex, barW, domain, active, mode, timeframe, hover }) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const colors = palette(canvas);
  ctx.font = colors.font;
  const s = makeScales({ width, height, endIndex, barW, domain });

  drawFrame(ctx, s, domain, colors, mode);
  if (last >= first && rows.length) {
    drawTimeAxis(ctx, s, rows, first, last, barW, colors, timeframe);
    drawVolume(ctx, s, rows, first, last, barW, colors);
    if (active.bb) drawBand(ctx, s, rows, first, last, colors);
    drawCandles(ctx, s, rows, first, last, barW, colors);
    if (active.ema) {
      drawLine(ctx, s, rows, first, last, "ema9", colors.primary);
      drawLine(ctx, s, rows, first, last, "ema21", colors.c5);
      drawLine(ctx, s, rows, first, last, "ema50", colors.c4);
    }
    if (active.vwap) drawLine(ctx, s, rows, first, last, "vwap", colors.fg, [5, 3]);
    const lastRow = rows[rows.length - 1];
    drawPriceTag(ctx, s, lastRow.close, lastRow.close >= lastRow.open ? colors.up : colors.down, colors, mode);
    drawLegend(ctx, s, hover ? rows[hover.index] : lastRow, colors, mode);
  }

  if (hover) {
    const cx = Math.round(s.x(hover.index)) + 0.5;
    ctx.strokeStyle = colors.crosshair;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, s.plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPriceTag(ctx, s, s.valAt(hover.y), colors.crosshair, colors, mode);
    if (rows[hover.index]) {
      tag(ctx, cx, s.plotH + TIME_H / 2, fmtTime(rows[hover.index].t, timeframe), colors.crosshair, colors.bg, "center");
    }
  }
}