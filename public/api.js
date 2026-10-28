// Shared API client plus a small local store.

const STORE_KEY = 'pantryshop:v1';

export const store = {
  load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  },
  save(patch) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...store.load(), ...patch })); } catch { /* private mode */ }
  },
};

export function codeFromUrl() {
  const h = new URLSearchParams(location.search).get('h');
  return h ? h.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : '';
}

export function currentCode() {
  const fromUrl = codeFromUrl();
  if (fromUrl) { store.save({ code: fromUrl }); return fromUrl; }
  return store.load().code || '';
}

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  createHousehold: (name) => call('POST', '/api/household', { name }),
  household: (code) => call('GET', `/api/h/${code}`),
  rename: (code, name) => call('POST', `/api/h/${code}/rename`, { name }),

  lists: (code) => call('GET', `/api/h/${code}/lists`),
  createList: (code, name, icon) => call('POST', `/api/h/${code}/lists`, { name, icon }),
  updateList: (code, id, patch) => call('PATCH', `/api/h/${code}/lists/${id}`, patch),
  deleteList: (code, id) => call('DELETE', `/api/h/${code}/lists/${id}`),

  items: (code) => call('GET', `/api/h/${code}/items`),
  add: (code, item) => call('POST', `/api/h/${code}/items`, item),
  update: (code, id, patch) => call('PATCH', `/api/h/${code}/items/${id}`, patch),
  remove: (code, id) => call('DELETE', `/api/h/${code}/items/${id}`),
  clearChecked: (code, list_id) => call('POST', `/api/h/${code}/clear-checked`, { list_id }),

  suggest: (code, q) => call('GET', `/api/h/${code}/suggest?q=${encodeURIComponent(q)}`),
  memory: (code) => call('GET', `/api/h/${code}/memory`),
  setFlags: (code, name, flags) => call('POST', `/api/h/${code}/memory`, { name, ...flags }),
  recent: (code) => call('GET', `/api/h/${code}/recent`),
  favorites: (code) => call('GET', `/api/h/${code}/favorites`),
  setFavorite: (code, name, favorite) => call('POST', `/api/h/${code}/favorites`, { name, favorite }),
};

// ---------- offline queue (used by the phone app) ----------

export const queue = {
  all() { return store.load().queue || []; },
  push(op) { store.save({ queue: [...queue.all(), op] }); },
  clear() { store.save({ queue: [] }); },
  async flush(code) {
    const ops = queue.all();
    if (!ops.length) return 0;
    let done = 0;
    for (const op of ops) {
      try {
        if (op.kind === 'add') await api.add(code, op.item);
        else if (op.kind === 'update') await api.update(code, op.id, op.patch);
        else if (op.kind === 'remove') await api.remove(code, op.id);
        else if (op.kind === 'clear') await api.clearChecked(code, op.list_id);
        else if (op.kind === 'favorite') await api.setFavorite(code, op.name, op.favorite);
        done++;
      } catch (err) {
        if (err.status && err.status >= 400 && err.status < 500) { done++; continue; }
        break;
      }
    }
    store.save({ queue: ops.slice(done) });
    return done;
  },
};

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// "2 milk" -> { name: "milk", qty: "2" }. Also "milk x2" and "milk (2)".
export function splitQty(raw) {
  let s = String(raw || '').trim();
  let qty = '';
  let m = s.match(/^(\d+(?:\.\d+)?\s*(?:x|lb|lbs|oz|kg|g|pk|pack|dozen|doz|bag|bags|box|boxes|can|cans|bottle|bottles)?)\s+(.+)$/i);
  if (m) { qty = m[1].trim(); s = m[2].trim(); }
  else if ((m = s.match(/^(.+?)\s*(?:x\s*(\d+)|\((\d+)\))$/i))) { s = m[1].trim(); qty = m[2] || m[3]; }
  return { name: s, qty };
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
