// Prepends older bars to a live series, keeping bars sorted by time and never
// overwriting a bar the live stream already owns.
export function prependBars(older, current) {
  if (!older?.length) return current;
  if (!current?.length) return [...older];
  const firstT = current[0].t;
  const head = older.filter((b) => b.t < firstT).sort((a, b) => a.t - b.t);
  return head.length ? [...head, ...current] : current;
}