// Terminal-grade candle geometry.
//
// Every edge lands on a half-pixel so nothing blurs, up bars are hollow and down bars solid
// (the convention every trading terminal uses), and a bar whose body is thinner than a pixel
// draws as a flat open==close line instead of a fat block.

const MIN_BODY_W = 3; // a body never collapses into the wick, however far you zoom out
const WICK_W = 1;
const DOJI_PX = 1; // bodies thinner than this render as a single line

// Snaps a coordinate to a crisp 1px stroke centre.
const snap = (n) => Math.round(n) + 0.5;

function bodyWidth(barW) {
  // Leave a gap between neighbours, but never below the readable minimum.
  return Math.max(Math.round(barW * 0.7), MIN_BODY_W);
}

function drawWick(ctx, cx, yHigh, yLow, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = WICK_W;
  ctx.beginPath();
  ctx.moveTo(cx, Math.round(yHigh));
  ctx.lineTo(cx, Math.round(yLow));
  ctx.stroke();
}

function drawBody(ctx, cx, w, yOpen, yClose, color, bg) {
  const top = Math.min(yOpen, yClose);
  const bot = Math.max(yOpen, yClose);
  const left = snap(cx - w / 2);
  const right = snap(cx + w / 2);
  const width = right - left;
  const height = bot - top;

  // Doji: no measurable body, so the open/close level is the whole bar.
  if (height < DOJI_PX) {
    const y = snap((top + bot) / 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    return;
  }

  const yTop = snap(top);
  const h = Math.max(snap(bot) - yTop, 1);

  if (yClose <= yOpen) {
    // Up bar — hollow: knock the background out, then outline it.
    ctx.fillStyle = bg;
    ctx.fillRect(left, yTop, width, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(left, yTop, width, h);
  } else {
    // Down bar — solid.
    ctx.fillStyle = color;
    ctx.fillRect(left, yTop, width, h);
  }
}

/**
 * Paints the visible slice of the series as candles.
 * `s` is the scale object from makeScales; `colors` the canvas palette.
 */
export function drawCandles(ctx, s, rows, first, last, barW, colors) {
  const w = bodyWidth(barW);
  for (let i = first; i <= last; i++) {
    const r = rows[i];
    if (!Number.isFinite(r.close)) continue;
    const color = r.close >= r.open ? colors.up : colors.down;
    const cx = snap(s.x(i));
    drawWick(ctx, cx, s.y(r.high), s.y(r.low), color);
    drawBody(ctx, cx, w, s.y(r.open), s.y(r.close), color, colors.bg);
  }
  ctx.lineWidth = 1;
}