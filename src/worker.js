import { AISLES, guessAisle, isAisle } from './aisles.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let migrated = false;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    try {
      await migrate(env);
      return await route(request, env, url);
    } catch (err) {
      return json({ error: err.message || 'Server error' }, 500);
    }
  },

  // Runs on the cron in wrangler.toml. Adds each household's weekly staples to its first list.
  async scheduled(event, env) {
    await migrate(env);
    await addWeeklyStaples(env);
  },
};

// ---------- schema upkeep ----------

async function migrate(env) {
  if (migrated) return;
  const steps = [
    `CREATE TABLE IF NOT EXISTS lists (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '🛒', sort INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS lists_household ON lists(household_id, sort)`,
    `ALTER TABLE items ADD COLUMN list_id TEXT`,
    `ALTER TABLE items ADD COLUMN note TEXT NOT NULL DEFAULT ''`,
    `CREATE INDEX IF NOT EXISTS items_list ON items(list_id, checked)`,
    `ALTER TABLE memory ADD COLUMN weekly INTEGER NOT NULL DEFAULT 0`,
  ];
  for (const sql of steps) {
    try {
      await env.DB.prepare(sql).run();
    } catch (err) {
      if (!/duplicate column|already exists/i.test(err.message)) throw err;
    }
  }
  migrated = true;
}

async function route(request, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]
  const method = request.method;

  if (parts[1] === 'aisles' && method === 'GET') {
    return json({ aisles: AISLES });
  }

  if (parts[1] === 'household' && method === 'POST') {
    const body = await readJson(request);
    return createHousehold(env, body.name);
  }

  if (parts[1] === 'h' && parts[2]) {
    const code = String(parts[2]).toUpperCase();
    const hh = await env.DB.prepare('SELECT id, code, name FROM households WHERE code = ?').bind(code).first();
    if (!hh) return json({ error: 'No household with that code' }, 404);
    await ensureDefaultList(env, hh);

    const rest = parts.slice(3);
    const body = method === 'GET' || method === 'DELETE' ? {} : await readJson(request);

    if (rest.length === 0 && method === 'GET') return json({ household: hh });
    if (rest[0] === 'rename' && method === 'POST') return renameHousehold(env, hh, body);

    if (rest[0] === 'lists' && rest.length === 1 && method === 'GET') return json({ lists: await getLists(env, hh) });
    if (rest[0] === 'lists' && rest.length === 1 && method === 'POST') return createList(env, hh, body);
    if (rest[0] === 'lists' && rest[1] && method === 'PATCH') return updateList(env, hh, rest[1], body);
    if (rest[0] === 'lists' && rest[1] && method === 'DELETE') return deleteList(env, hh, rest[1]);

    if (rest[0] === 'items' && rest.length === 1 && method === 'GET') return listItems(env, hh);
    if (rest[0] === 'items' && rest.length === 1 && method === 'POST') return addItem(env, hh, body);
    if (rest[0] === 'items' && rest[1] && method === 'PATCH') return updateItem(env, hh, rest[1], body);
    if (rest[0] === 'items' && rest[1] && method === 'DELETE') return deleteItem(env, hh, rest[1]);
    if (rest[0] === 'clear-checked' && method === 'POST') return clearChecked(env, hh, body);

    if (rest[0] === 'suggest' && method === 'GET') return suggest(env, hh, url.searchParams.get('q') || '');
    if (rest[0] === 'memory' && method === 'GET') return allMemory(env, hh);
    if (rest[0] === 'memory' && method === 'POST') return setMemoryFlags(env, hh, body);
    if (rest[0] === 'recent' && method === 'GET') return recent(env, hh);
    if (rest[0] === 'favorites' && method === 'GET') return favorites(env, hh);
    if (rest[0] === 'favorites' && method === 'POST') return setMemoryFlags(env, hh, body);
    if (rest[0] === 'run-weekly' && method === 'POST') {
      const added = await addWeeklyStaples(env, hh.id);
      return json({ ok: true, added });
    }
  }

  return json({ error: 'Not found' }, 404);
}

// ---------- households ----------

async function createHousehold(env, name) {
  const id = crypto.randomUUID();
  const hhName = cleanName(name) || 'Home';
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeCode(6);
    try {
      await env.DB.prepare('INSERT INTO households (id, code, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, code, hhName, Date.now()).run();
      const hh = { id, code, name: hhName };
      await ensureDefaultList(env, hh);
      return json({ household: hh }, 201);
    } catch (err) {
      if (!/UNIQUE/i.test(err.message)) throw err;
    }
  }
  return json({ error: 'Could not make a unique code. Try again.' }, 500);
}

async function renameHousehold(env, hh, body) {
  const name = cleanName(body.name) || 'Home';
  await env.DB.prepare('UPDATE households SET name = ? WHERE id = ?').bind(name, hh.id).run();
  return json({ household: { ...hh, name } });
}

function makeCode(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

// ---------- lists ----------

async function getLists(env, hh) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, icon, sort FROM lists WHERE household_id = ? ORDER BY sort ASC, created_at ASC'
  ).bind(hh.id).all();
  return results;
}

// Every household has at least one list. Items made before lists existed move into it.
async function ensureDefaultList(env, hh) {
  const first = await env.DB.prepare('SELECT id FROM lists WHERE household_id = ? ORDER BY sort ASC, created_at ASC LIMIT 1').bind(hh.id).first();
  let listId = first?.id;
  if (!listId) {
    listId = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO lists (id, household_id, name, icon, sort, created_at) VALUES (?, ?, ?, ?, 0, ?)')
      .bind(listId, hh.id, 'Grocery', '🛒', Date.now()).run();
  }
  await env.DB.prepare('UPDATE items SET list_id = ? WHERE household_id = ? AND list_id IS NULL').bind(listId, hh.id).run();
  return listId;
}

async function createList(env, hh, body) {
  const name = cleanName(body.name);
  if (!name) return json({ error: 'Name is required' }, 400);
  const icon = cleanIcon(body.icon) || '📝';
  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort), -1) AS m FROM lists WHERE household_id = ?').bind(hh.id).first();
  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO lists (id, household_id, name, icon, sort, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, hh.id, name, icon, (max?.m ?? -1) + 1, Date.now()).run();
  return json({ list: { id, name, icon, sort: (max?.m ?? -1) + 1 } }, 201);
}

async function updateList(env, hh, id, body) {
  const row = await env.DB.prepare('SELECT id FROM lists WHERE id = ? AND household_id = ?').bind(id, hh.id).first();
  if (!row) return json({ error: 'List not found' }, 404);
  const sets = []; const vals = [];
  if (cleanName(body.name)) { sets.push('name = ?'); vals.push(cleanName(body.name)); }
  if (cleanIcon(body.icon)) { sets.push('icon = ?'); vals.push(cleanIcon(body.icon)); }
  if (Number.isInteger(body.sort)) { sets.push('sort = ?'); vals.push(body.sort); }
  if (sets.length) {
    vals.push(id);
    await env.DB.prepare(`UPDATE lists SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  }
  return json({ list: await env.DB.prepare('SELECT id, name, icon, sort FROM lists WHERE id = ?').bind(id).first() });
}

async function deleteList(env, hh, id) {
  const lists = await getLists(env, hh);
  if (lists.length <= 1) return json({ error: 'Keep at least one list' }, 400);
  if (!lists.some((l) => l.id === id)) return json({ error: 'List not found' }, 404);
  await env.DB.prepare('DELETE FROM items WHERE list_id = ? AND household_id = ?').bind(id, hh.id).run();
  await env.DB.prepare('DELETE FROM lists WHERE id = ? AND household_id = ?').bind(id, hh.id).run();
  return json({ ok: true });
}

// ---------- items ----------

const ITEM_COLS = 'id, list_id, name, aisle, qty, note, checked, created_at, updated_at';

async function listItems(env, hh) {
  const lists = await getLists(env, hh);
  const { results } = await env.DB.prepare(
    `SELECT ${ITEM_COLS} FROM items WHERE household_id = ? ORDER BY checked ASC, created_at ASC`
  ).bind(hh.id).all();
  const items = results.map(rowToItem);
  return json({ household: hh, aisles: AISLES, lists, items, now: Date.now() });
}

async function addItem(env, hh, body) {
  const name = cleanName(body.name);
  if (!name) return json({ error: 'Name is required' }, 400);
  const lists = await getLists(env, hh);
  const listId = lists.some((l) => l.id === body.list_id) ? body.list_id : lists[0].id;
  const result = await insertItem(env, hh, listId, body);
  return json(result, result.duplicate ? 200 : 201);
}

// Shared by the API and the weekly cron.
async function insertItem(env, hh, listId, body) {
  const name = cleanName(body.name);
  const key = nameKey(name);
  const qty = cleanQty(body.qty);
  const note = cleanNote(body.note);
  const now = Date.now();

  // Already on this list and unchecked: bump the count if one was given, never duplicate.
  const existing = await env.DB.prepare(
    'SELECT id, qty FROM items WHERE list_id = ? AND name_key = ? AND checked = 0'
  ).bind(listId, key).first();
  if (existing) {
    const sets = ['updated_at = ?']; const vals = [now];
    if (qty && qty !== existing.qty) { sets.push('qty = ?'); vals.push(qty); }
    if (note) { sets.push('note = ?'); vals.push(note); }
    vals.push(existing.id);
    await env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return { item: await getItem(env, existing.id), duplicate: true };
  }

  const mem = await env.DB.prepare('SELECT aisle, qty FROM memory WHERE household_id = ? AND name_key = ?').bind(hh.id, key).first();
  const aisle = isAisle(body.aisle) ? body.aisle : (mem?.aisle || guessAisle(name));
  const finalQty = qty || mem?.qty || '';
  const id = body.id && /^[a-f0-9-]{8,64}$/i.test(body.id) ? body.id : crypto.randomUUID();

  // Checked off earlier this trip: un-check that row instead of adding a twin.
  const twin = await env.DB.prepare('SELECT id FROM items WHERE list_id = ? AND name_key = ? AND checked = 1').bind(listId, key).first();
  if (twin) {
    await env.DB.prepare(
      'UPDATE items SET checked = 0, qty = ?, aisle = ?, name = ?, note = ?, updated_at = ?, created_at = ? WHERE id = ?'
    ).bind(finalQty, aisle, name, note, now, now, twin.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO items (id, household_id, list_id, name, name_key, aisle, qty, note, checked, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
    ).bind(id, hh.id, listId, name, key, aisle, finalQty, note, now, now).run();
  }

  await env.DB.prepare(
    `INSERT INTO memory (household_id, name_key, name, aisle, qty, favorite, weekly, times_added, last_added)
     VALUES (?, ?, ?, ?, ?, 0, 0, 1, ?)
     ON CONFLICT(household_id, name_key) DO UPDATE SET
       name = excluded.name,
       aisle = excluded.aisle,
       qty = CASE WHEN excluded.qty != '' THEN excluded.qty ELSE memory.qty END,
       times_added = memory.times_added + 1,
       last_added = excluded.last_added`
  ).bind(hh.id, key, name, aisle, finalQty, now).run();

  return { item: await getItem(env, twin ? twin.id : id) };
}

async function updateItem(env, hh, id, body) {
  const row = await env.DB.prepare('SELECT * FROM items WHERE id = ? AND household_id = ?').bind(id, hh.id).first();
  if (!row) return json({ error: 'Item not found' }, 404);

  const sets = []; const vals = [];
  if (typeof body.checked === 'boolean') { sets.push('checked = ?'); vals.push(body.checked ? 1 : 0); }
  if (typeof body.qty === 'string') { sets.push('qty = ?'); vals.push(cleanQty(body.qty)); }
  if (typeof body.note === 'string') { sets.push('note = ?'); vals.push(cleanNote(body.note)); }
  if (typeof body.name === 'string' && cleanName(body.name)) {
    const name = cleanName(body.name);
    sets.push('name = ?', 'name_key = ?'); vals.push(name, nameKey(name));
  }
  if (typeof body.list_id === 'string') {
    const ok = await env.DB.prepare('SELECT id FROM lists WHERE id = ? AND household_id = ?').bind(body.list_id, hh.id).first();
    if (ok) { sets.push('list_id = ?'); vals.push(body.list_id); }
  }
  if (isAisle(body.aisle)) {
    sets.push('aisle = ?'); vals.push(body.aisle);
    await env.DB.prepare('UPDATE memory SET aisle = ? WHERE household_id = ? AND name_key = ?').bind(body.aisle, hh.id, row.name_key).run();
  }
  if (sets.length === 0) return json({ item: await getItem(env, id) });

  sets.push('updated_at = ?'); vals.push(Date.now());
  vals.push(id);
  await env.DB.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ item: await getItem(env, id) });
}

async function deleteItem(env, hh, id) {
  const res = await env.DB.prepare('DELETE FROM items WHERE id = ? AND household_id = ?').bind(id, hh.id).run();
  if (!res.meta.changes) return json({ error: 'Item not found' }, 404);
  return json({ ok: true });
}

async function clearChecked(env, hh, body) {
  const stmt = body.list_id
    ? env.DB.prepare('DELETE FROM items WHERE household_id = ? AND list_id = ? AND checked = 1').bind(hh.id, body.list_id)
    : env.DB.prepare('DELETE FROM items WHERE household_id = ? AND checked = 1').bind(hh.id);
  const res = await stmt.run();
  return json({ ok: true, removed: res.meta.changes });
}

async function getItem(env, id) {
  const r = await env.DB.prepare(`SELECT ${ITEM_COLS} FROM items WHERE id = ?`).bind(id).first();
  return r ? rowToItem(r) : null;
}

function rowToItem(r) {
  return { ...r, checked: !!r.checked };
}

// ---------- memory: suggestions, buy again, favorites, weekly ----------

const MEM_COLS = 'name, aisle, qty, favorite, weekly, times_added, last_added';

async function suggest(env, hh, q) {
  const key = nameKey(q);
  const stmt = key
    ? env.DB.prepare(`SELECT ${MEM_COLS} FROM memory WHERE household_id = ? AND name_key LIKE ? ORDER BY favorite DESC, times_added DESC, last_added DESC LIMIT 8`).bind(hh.id, `${key}%`)
    : env.DB.prepare(`SELECT ${MEM_COLS} FROM memory WHERE household_id = ? ORDER BY favorite DESC, times_added DESC, last_added DESC LIMIT 8`).bind(hh.id);
  const { results } = await stmt.all();
  return json({ suggestions: results.map(memRow) });
}

async function allMemory(env, hh) {
  const { results } = await env.DB.prepare(
    `SELECT ${MEM_COLS} FROM memory WHERE household_id = ? ORDER BY times_added DESC, last_added DESC LIMIT 400`
  ).bind(hh.id).all();
  return json({ memory: results.map(memRow) });
}

async function recent(env, hh) {
  const { results } = await env.DB.prepare(
    `SELECT ${MEM_COLS},
       EXISTS(SELECT 1 FROM items i WHERE i.household_id = m.household_id AND i.name_key = m.name_key AND i.checked = 0) AS on_list
     FROM memory m WHERE m.household_id = ? ORDER BY m.last_added DESC LIMIT 24`
  ).bind(hh.id).all();
  return json({ recent: results.map((r) => ({ ...memRow(r), on_list: !!r.on_list })) });
}

async function favorites(env, hh) {
  const { results } = await env.DB.prepare(
    `SELECT ${MEM_COLS},
       EXISTS(SELECT 1 FROM items i WHERE i.household_id = m.household_id AND i.name_key = m.name_key AND i.checked = 0) AS on_list
     FROM memory m WHERE m.household_id = ? AND (m.favorite = 1 OR m.weekly = 1) ORDER BY m.name ASC`
  ).bind(hh.id).all();
  return json({ favorites: results.map((r) => ({ ...memRow(r), on_list: !!r.on_list })) });
}

async function setMemoryFlags(env, hh, body) {
  const name = cleanName(body.name);
  if (!name) return json({ error: 'Name is required' }, 400);
  const key = nameKey(name);
  await env.DB.prepare(
    `INSERT INTO memory (household_id, name_key, name, aisle, qty, favorite, weekly, times_added, last_added)
     VALUES (?, ?, ?, ?, '', 0, 0, 0, ?)
     ON CONFLICT(household_id, name_key) DO NOTHING`
  ).bind(hh.id, key, name, guessAisle(name), Date.now()).run();
  const sets = []; const vals = [];
  if (typeof body.favorite === 'boolean') { sets.push('favorite = ?'); vals.push(body.favorite ? 1 : 0); }
  if (typeof body.weekly === 'boolean') { sets.push('weekly = ?'); vals.push(body.weekly ? 1 : 0); }
  if (sets.length) {
    vals.push(hh.id, key);
    await env.DB.prepare(`UPDATE memory SET ${sets.join(', ')} WHERE household_id = ? AND name_key = ?`).bind(...vals).run();
  }
  const row = await env.DB.prepare(`SELECT ${MEM_COLS} FROM memory WHERE household_id = ? AND name_key = ?`).bind(hh.id, key).first();
  return json({ ok: true, memory: memRow(row) });
}

function memRow(r) {
  return { ...r, favorite: !!r.favorite, weekly: !!r.weekly };
}

// Adds weekly staples to each household's first list. Skips anything already on it.
async function addWeeklyStaples(env, onlyHousehold) {
  const stmt = onlyHousehold
    ? env.DB.prepare('SELECT id, code, name FROM households WHERE id = ?').bind(onlyHousehold)
    : env.DB.prepare('SELECT id, code, name FROM households');
  const { results: households } = await stmt.all();
  let added = 0;
  for (const hh of households) {
    const listId = await ensureDefaultList(env, hh);
    const { results } = await env.DB.prepare('SELECT name, aisle, qty FROM memory WHERE household_id = ? AND weekly = 1').bind(hh.id).all();
    for (const m of results) {
      const r = await insertItem(env, hh, listId, { name: m.name, aisle: m.aisle, qty: m.qty });
      if (!r.duplicate) added++;
    }
  }
  return added;
}

// ---------- helpers ----------

function cleanName(s) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80); }
function cleanQty(s) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 24); }
function cleanNote(s) { return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120); }
function cleanIcon(s) { return String(s ?? '').trim().slice(0, 8); }

export function nameKey(s) {
  return cleanName(s).toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

async function readJson(request) {
  try { return (await request.json()) || {}; } catch { return {}; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
