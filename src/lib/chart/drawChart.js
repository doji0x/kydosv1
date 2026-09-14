import { formatChartValue } from "@/components/rh/chart/chartScale";
import { AXIS_W, clamp, fmtTime, makeScales, palette } from "@/lib/chart/geometry";

function drawGrid(ctx, s, domain, colors, mode) {
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  ctx.lineWidth = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  for (let k = 0; k <= 4; k++) {
    const v = domain[0] + ((domain[1] - domain[0]) * k) / 4;
    const yy = Math.round(s.y(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(s.plotW, yy);
    ctx.stroke();
    ctx.fillText(formatChartValue(v, mode), s.plotW + 6, clamp(yy, 6, s.plotH - 6));
  }
}

function drawTimeAxis(ctx, s, rows, first, last, barW, colors, timeframe) {
  const step = Math.max(1, Math.ceil(96 / barW));
  ctx.fillStyle = colors.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = Math.ceil(first / step) * step; i <= last; i += step) {
    ctx.fillText(fmtTime(rows[i].t, timeframe), s.x(i), s.plotH + 7);
  }
  ctx.strokeStyle = colors.grid;
  ctx.beginPath();
  ctx.moveTo(0, s.plotH + 0.5);
  ctx.lineTo(s.plotW, s.plotH + 0.5);
  ctx.stroke();
}

function drawCandles(ctx, s, rows, first, last, barW, colors, formingIndex) {
  const bodyW = Math.max(Math.floor(barW * 0.7), 1);
  ctx.lineWidth = 1;
  for (let i = first; i <= last; i++) {
    const r = rows[i];
    const c = r.close >= r.open ? colors.up : colors.down;
    const cx = Math.round(s.x(i));
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(cx + 0.5, s.y(r.high));
    ctx.lineTo(cx + 0.5, s.y(r.low));
    ctx.stroke();
    const top = s.y(Math.max(r.open, r.close));
    const bot = s.y(Math.min(r.open, r.close));
    ctx.fillRect(cx - bodyW / 2, top, bodyW, Math.max(bot - top, 1));
    if (i === formingIndex) {
      ctx.beginPath();
      ctx.arc(cx, s.y(r.close), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
  ctx.fillRect(s.plotW + 2, yy - 8, AXIS_W - 4, 16);
  ctx.fillStyle = colors.bg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatChartValue(value, mode), s.plotW + 6, yy);
}

export function renderChart(canvas, { width, height, rows, first, last, endIndex, barW, domain, active, mode, timeframe, formingIndex, hover }) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const colors = palette(canvas);
  ctx.font = colors.font;
  const s = makeScales({ width, height, endIndex, barW, domain });

  drawGrid(ctx, s, domain, colors, mode);
  if (last >= first && rows.length) {
    drawTimeAxis(ctx, s, rows, first, last, barW, colors, timeframe);
    if (active.bb) {
      drawLine(ctx, s, rows, first, last, "bbUpper", colors.c4, [3, 3]);
      drawLine(ctx, s, rows, first, last, "bbMiddle", colors.c4);
      drawLine(ctx, s, rows, first, last, "bbLower", colors.c4, [3, 3]);
    }
    drawCandles(ctx, s, rows, first, last, barW, colors, formingIndex);
    if (active.ema) {
      drawLine(ctx, s, rows, first, last, "ema9", colors.primary);
      drawLine(ctx, s, rows, first, last, "ema21", colors.c5);
      drawLine(ctx, s, rows, first, last, "ema50", colors.c4);
    }
    if (active.vwap) drawLine(ctx, s, rows, first, last, "vwap", colors.fg, [5, 3]);
    const lastRow = rows[rows.length - 1];
    drawPriceTag(ctx, s, lastRow.close, lastRow.close >= lastRow.open ? colors.up : colors.down, colors, mode);
  }

  if (hover) {
    const cx = Math.round(s.x(hover.index)) + 0.5;
    ctx.strokeStyle = colors.text;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, s.plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPriceTag(ctx, s, s.valAt(hover.y), colors.text, colors, mode);
  }
}