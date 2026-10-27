import { AISLES, guessAisle, isAisle } from './aisles.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }
    try {
      return await route(request, env, url);
    } catch (err) {
      return json({ error: err.message || 'Server error' }, 500);
    }
  },
};

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

    const rest = parts.slice(3);

    if (rest.length === 0 && method === 'GET') {
      return json({ household: hh });
    }
    if (rest[0] === 'items' && rest.length === 1 && method === 'GET') {
      return listItems(env, hh);
    }
    if (rest[0] === 'items' && rest.length === 1 && method === 'POST') {
      return addItem(env, hh, await readJson(request));
    }
    if (rest[0] === 'items' && rest[1] && method === 'PATCH') {
      return updateItem(env, hh, rest[1], await readJson(request));
    }
    if (rest[0] === 'items' && rest[1] && method === 'DELETE') {
      return deleteItem(env, hh, rest[1]);
    }
    if (rest[0] === 'clear-checked' && method === 'POST') {
      return clearChecked(env, hh);
    }
    if (rest[0] === 'suggest' && method === 'GET') {
      return suggest(env, hh, url.searchParams.get('q') || '');
    }
    if (rest[0] === 'favorites' && method === 'GET') {
      return favorites(env, hh);
    }
    if (rest[0] === 'favorites' && method === 'POST') {
      return setFavorite(env, hh, await readJson(request));
    }
    if (rest[0] === 'rename' && method === 'POST') {
      const body = await readJson(request);
      const name = cleanName(body.name) || 'Home';
      await env.DB.prepare('UPDATE households SET name = ? WHERE id = ?').bind(name, hh.id).run();
      return json({ household: { ...hh, name } });
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
      return json({ household: { id, code, name: hhName } }, 201);
    } catch (err) {
      if (!/UNIQUE/i.test(err.message)) throw err;
    }
  }
  return json({ error: 'Could not make a unique code. Try again.' }, 500);
}

function makeCode(len) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

// ---------- items ----------

async function listItems(env, hh) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, aisle, qty, checked, created_at, updated_at FROM items WHERE household_id = ? ORDER BY checked ASC, created_at ASC'
  ).bind(hh.id).all();
  const items = results.map((r) => ({ ...r, checked: !!r.checked }));
  return json({ household: hh, aisles: AISLES, items, now: Date.now() });
}

async function addItem(env, hh, body) {
  const name = cleanName(body.name);
  if (!name) return json({ error: 'Name is required' }, 400);
  const key = nameKey(name);
  const qty = cleanQty(body.qty);
  const now = Date.now();

  // If the same item is already on the list and unchecked, don't duplicate it.
  const existing = await env.DB.prepare(
    'SELECT id, qty FROM items WHERE household_id = ? AND name_key = ? AND checked = 0'
  ).bind(hh.id, key).first();
  if (existing) {
    if (qty && qty !== existing.qty) {
      await env.DB.prepare('UPDATE items SET qty = ?, updated_at = ? WHERE id = ?').bind(qty, now, existing.id).run();
    }
    const item = await getItem(env, existing.id);
    return json({ item, duplicate: true });
  }

  // Aisle: explicit, then remembered, then guessed.
  const mem = await env.DB.prepare(
    'SELECT aisle, qty FROM memory WHERE household_id = ? AND name_key = ?'
  ).bind(hh.id, key).first();
  let aisle = isAisle(body.aisle) ? body.aisle : (mem?.aisle || guessAisle(name));
  const finalQty = qty || mem?.qty || '';

  const id = body.id && /^[a-f0-9-]{8,64}$/i.test(body.id) ? body.id : crypto.randomUUID();

  // Was it checked off earlier this trip? Then un-check that row instead of adding a twin.
  const checkedTwin = await env.DB.prepare(
    'SELECT id FROM items WHERE household_id = ? AND name_key = ? AND checked = 1'
  ).bind(hh.id, key).first();

  if (checkedTwin) {
    await env.DB.prepare(
      'UPDATE items SET checked = 0, qty = ?, aisle = ?, name = ?, updated_at = ?, created_at = ? WHERE id = ?'
    ).bind(finalQty, aisle, name, now, now, checkedTwin.id).run();
  } else {
    await env.DB.prepare(
      'INSERT INTO items (id, household_id, name, name_key, aisle, qty, checked, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)'
    ).bind(id, hh.id, name, key, aisle, finalQty, now, now).run();
  }

  await env.DB.prepare(
    `INSERT INTO memory (household_id, name_key, name, aisle, qty, favorite, times_added, last_added)
     VALUES (?, ?, ?, ?, ?, 0, 1, ?)
     ON CONFLICT(household_id, name_key) DO UPDATE SET
       name = excluded.name,
       aisle = excluded.aisle,
       qty = CASE WHEN excluded.qty != '' THEN excluded.qty ELSE memory.qty END,
       times_added = memory.times_added + 1,
       last_added = excluded.last_added`
  ).bind(hh.id, key, name, aisle, finalQty, now).run();

  const item = await getItem(env, checkedTwin ? checkedTwin.id : id);
  return json({ item }, 201);
}

async function updateItem(env, hh, id, body) {
  const row = await env.DB.prepare('SELECT * FROM items WHERE id = ? AND household_id = ?').bind(id, hh.id).first();
  if (!row) return json({ error: 'Item not found' }, 404);

  const sets = [];
  const vals = [];
  if (typeof body.checked === 'boolean') { sets.push('checked = ?'); vals.push(body.checked ? 1 : 0); }
  if (typeof body.qty === 'string') { sets.push('qty = ?'); vals.push(cleanQty(body.qty)); }
  if (typeof body.name === 'string' && cleanName(body.name)) {
    const name = cleanName(body.name);
    sets.push('name = ?', 'name_key = ?'); vals.push(name, nameKey(name));
  }
  if (isAisle(body.aisle)) {
    sets.push('aisle = ?'); vals.push(body.aisle);
    // Remember the aisle the household chose for this item.
    await env.DB.prepare('UPDATE memory SET aisle = ? WHERE household_id = ? AND name_key = ?')
      .bind(body.aisle, hh.id, row.name_key).run();
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

async function clearChecked(env, hh) {
  const res = await env.DB.prepare('DELETE FROM items WHERE household_id = ? AND checked = 1').bind(hh.id).run();
  return json({ ok: true, removed: res.meta.changes });
}

async function getItem(env, id) {
  const r = await env.DB.prepare('SELECT id, name, aisle, qty, checked, created_at, updated_at FROM items WHERE id = ?').bind(id).first();
  return r ? { ...r, checked: !!r.checked } : null;
}

// ---------- memory: suggestions and favorites ----------

async function suggest(env, hh, q) {
  const key = nameKey(q);
  const stmt = key
    ? env.DB.prepare(
        'SELECT name, aisle, qty, favorite, times_added FROM memory WHERE household_id = ? AND name_key LIKE ? ORDER BY favorite DESC, times_added DESC, last_added DESC LIMIT 8'
      ).bind(hh.id, `${key}%`)
    : env.DB.prepare(
        'SELECT name, aisle, qty, favorite, times_added FROM memory WHERE household_id = ? ORDER BY favorite DESC, times_added DESC, last_added DESC LIMIT 8'
      ).bind(hh.id);
  const { results } = await stmt.all();
  return json({ suggestions: results.map((r) => ({ ...r, favorite: !!r.favorite })) });
}

async function favorites(env, hh) {
  const { results } = await env.DB.prepare(
    `SELECT m.name, m.aisle, m.qty, m.times_added,
            EXISTS(SELECT 1 FROM items i WHERE i.household_id = m.household_id AND i.name_key = m.name_key AND i.checked = 0) AS on_list
     FROM memory m WHERE m.household_id = ? AND m.favorite = 1 ORDER BY m.name ASC`
  ).bind(hh.id).all();
  return json({ favorites: results.map((r) => ({ ...r, on_list: !!r.on_list })) });
}

async function setFavorite(env, hh, body) {
  const name = cleanName(body.name);
  if (!name) return json({ error: 'Name is required' }, 400);
  const key = nameKey(name);
  const fav = body.favorite === false ? 0 : 1;
  await env.DB.prepare(
    `INSERT INTO memory (household_id, name_key, name, aisle, qty, favorite, times_added, last_added)
     VALUES (?, ?, ?, ?, '', ?, 0, ?)
     ON CONFLICT(household_id, name_key) DO UPDATE SET favorite = excluded.favorite`
  ).bind(hh.id, key, name, guessAisle(name), fav, Date.now()).run();
  return json({ ok: true, name, favorite: !!fav });
}

// ---------- helpers ----------

function cleanName(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function cleanQty(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

export function nameKey(s) {
  return cleanName(s).toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
}

async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
