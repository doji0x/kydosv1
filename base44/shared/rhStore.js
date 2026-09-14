// Entity helpers shared by the indexer, market engine and read API.

export async function getCursor(db, scope) {
  const rows = await db.entities.RhCursor.filter({ scope });
  return rows[0] || null;
}

export async function setCursor(db, scope, lastBlock) {
  const existing = await getCursor(db, scope);
  const data = { scope, last_block: lastBlock, updated_at: Date.now() };
  if (existing) return db.entities.RhCursor.update(existing.id, data);
  return db.entities.RhCursor.create(data);
}

export async function upsertByUid(db, entityName, uid, data) {
  const rows = await db.entities[entityName].filter({ uid });
  if (rows[0]) return db.entities[entityName].update(rows[0].id, data);
  return db.entities[entityName].create({ ...data, uid });
}

// Inserts only the records whose uid isn't already stored. Returns the inserted count.
export async function insertNewByUid(db, entityName, records) {
  if (!records.length) return 0;
  const uids = records.map((r) => r.uid);
  const existing = await db.entities[entityName].filter({ uid: { $in: uids } });
  const seen = new Set(existing.map((r) => r.uid));
  const fresh = [];
  const localSeen = new Set();
  for (const r of records) {
    if (seen.has(r.uid) || localSeen.has(r.uid)) continue;
    localSeen.add(r.uid);
    fresh.push(r);
  }
  if (!fresh.length) return 0;
  for (let i = 0; i < fresh.length; i += 200) {
    await db.entities[entityName].bulkCreate(fresh.slice(i, i + 200));
  }
  return fresh.length;
}

export async function getTokenRecord(db, address) {
  const rows = await db.entities.RhToken.filter({ address: address.toLowerCase() });
  return rows[0] || null;
}

export async function upsertToken(db, address, data) {
  const existing = await getTokenRecord(db, address);
  if (existing) {
    await db.entities.RhToken.update(existing.id, data);
    return { ...existing, ...data };
  }
  return db.entities.RhToken.create({ address: address.toLowerCase(), ...data });
}

export async function getPools(db, tokenAddress) {
  return db.entities.RhPool.filter({ token_address: tokenAddress.toLowerCase(), active: true });
}

export async function getRefPrice(db, symbol = "ETH") {
  const rows = await db.entities.RhRefPrice.filter({ symbol });
  return rows[0]?.price_usd || 0;
}

// Bounded read for large trade/candle sets — never loads an unbounded dataset.
export async function listBounded(db, entityName, query, sort = "-block_time", max = 3000) {
  return db.entities[entityName].filter(query, sort, max);
}