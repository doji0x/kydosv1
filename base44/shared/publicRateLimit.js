const windows = new Map();
export function limitPublicRequests(req, limit = 90) {
  const now = Date.now();
  if (windows.size > 5000) for (const [key, item] of windows) if (item.until <= now) windows.delete(key);
  const caller = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'anonymous';
  const item = windows.get(caller) || { count: 0, until: now + 60000 };
  if (item.until <= now) { item.count = 0; item.until = now + 60000; }
  item.count++;
  windows.set(caller, item);
  return item.count <= limit;
}