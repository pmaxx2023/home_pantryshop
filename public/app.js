import { api, queue, store, currentCode, uuid, splitQty } from '/api.js';

const $ = (id) => document.getElementById(id);
const AISLES_FALLBACK = ['Produce','Bakery','Deli','Meat & Seafood','Dairy & Eggs','Pantry','Snacks','Drinks','Frozen','Household','Personal Care','Baby & Pet','Other'];

const state = {
  code: '',
  household: null,
  aisles: AISLES_FALLBACK,
  items: [],
  favorites: [],
  online: navigator.onLine,
  editing: null,
  pollTimer: null,
};

// ---------- boot ----------

boot();

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  state.code = currentCode();
  const cached = store.load();
  if (cached.items && cached.code === state.code) {
    state.items = cached.items;
    state.household = cached.household || null;
    state.favorites = cached.favorites || [];
  }
  wireStart();
  wireMain();
  if (!state.code) return showStart();
  showMain();
  render();
  await refresh();
  startPolling();
}

function showStart() {
  $('start').classList.remove('hidden');
  $('main').classList.add('hidden');
}
function showMain() {
  $('start').classList.add('hidden');
  $('main').classList.remove('hidden');
}

function wireStart() {
  $('startNew').onclick = async () => {
    try {
      const { household } = await api.createHousehold('Home');
      state.code = household.code;
      state.household = household;
      store.save({ code: household.code, household });
      history.replaceState(null, '', `/?h=${household.code}`);
      showMain();
      await refresh();
      startPolling();
    } catch (err) {
      toast(err.message);
    }
  };
  $('joinBtn').onclick = () => join($('joinCode').value);
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join($('joinCode').value); });
}

async function join(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4) return toast('Enter the 6-character code.');
  try {
    const { household } = await api.household(code);
    state.code = code;
    state.household = household;
    state.items = [];
    store.save({ code, household, items: [], queue: [] });
    history.replaceState(null, '', `/?h=${code}`);
    showMain();
    await refresh();
    startPolling();
  } catch (err) {
    toast(err.status === 404 ? 'No list with that code.' : err.message);
  }
}

// ---------- data ----------

async function refresh() {
  if (!state.code) return;
  try {
    await queue.flush(state.code);
    const data = await api.items(state.code);
    state.household = data.household;
    state.aisles = data.aisles || state.aisles;
    state.items = data.items;
    const favs = await api.favorites(state.code).catch(() => ({ favorites: state.favorites }));
    state.favorites = favs.favorites;
    setOnline(true);
    store.save({ code: state.code, household: state.household, items: state.items, favorites: state.favorites });
  } catch (err) {
    if (err.status === 404) {
      store.save({ code: '', items: [], queue: [] });
      state.code = '';
      return showStart();
    }
    setOnline(false);
  }
  render();
}

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => { if (!document.hidden) refresh(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => setOnline(false));
}

function setOnline(on) {
  state.online = on;
  const el = $('status');
  if (on) {
    el.hidden = true;
  } else {
    el.hidden = false;
    const n = queue.all().length;
    el.textContent = n ? `Offline. ${n} change${n === 1 ? '' : 's'} will sync when you're back.` : 'Offline. Showing the last list you saw.';
  }
}

// Try the server. If it fails, queue it and apply the change locally.
async function mutate(op, localApply) {
  localApply();
  render();
  try {
    if (op.kind === 'add') await api.add(state.code, op.item);
    else if (op.kind === 'update') await api.update(state.code, op.id, op.patch);
    else if (op.kind === 'remove') await api.remove(state.code, op.id);
    else if (op.kind === 'clear') await api.clearChecked(state.code);
    else if (op.kind === 'favorite') await api.setFavorite(state.code, op.name, op.favorite);
    refresh();
  } catch (err) {
    if (err.status && err.status >= 400 && err.status < 500) return toast(err.message);
    queue.push(op);
    setOnline(false);
    store.save({ items: state.items });
  }
}

function addItem(raw, extra = {}) {
  const { name, qty } = splitQty(raw);
  if (!name) return;
  const existing = state.items.find((i) => !i.checked && i.name.toLowerCase() === name.toLowerCase());
  if (existing) { toast(`${existing.name} is already on the list.`); return; }
  const item = { id: uuid(), name, qty: extra.qty || qty, aisle: extra.aisle || guessAisleClient(name), checked: false, created_at: Date.now() };
  mutate({ kind: 'add', item: { id: item.id, name: item.name, qty: item.qty, aisle: extra.aisle } }, () => {
    const twin = state.items.find((i) => i.checked && i.name.toLowerCase() === name.toLowerCase());
    if (twin) { twin.checked = false; twin.created_at = Date.now(); }
    else state.items.push(item);
  });
}

function toggle(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const checked = !it.checked;
  mutate({ kind: 'update', id, patch: { checked } }, () => { it.checked = checked; });
}

function clearChecked() {
  if (!state.items.some((i) => i.checked)) return;
  mutate({ kind: 'clear' }, () => { state.items = state.items.filter((i) => !i.checked); });
}

// ---------- render ----------

function render() {
  if (!state.code) return;
  $('hhName').textContent = state.household?.name || 'Home';
  $('hhCode').textContent = state.code;
  const open = state.items.filter((i) => !i.checked);
  $('count').textContent = `${open.length} to get`;

  // favorites row
  const onList = new Set(open.map((i) => i.name.toLowerCase()));
  $('favs').innerHTML = state.favorites.map((f) => {
    const on = onList.has(f.name.toLowerCase());
    return `<button class="chip ${on ? 'on' : ''}" data-fav="${esc(f.name)}" data-aisle="${esc(f.aisle)}" data-qty="${esc(f.qty || '')}">${on ? '✓ ' : '+ '}${esc(f.name)}</button>`;
  }).join('');

  // groups by aisle in store order
  const groups = [];
  for (const aisle of state.aisles) {
    const rows = open.filter((i) => i.aisle === aisle);
    if (rows.length) groups.push({ title: aisle, rows });
  }
  const stray = open.filter((i) => !state.aisles.includes(i.aisle));
  if (stray.length) groups.push({ title: 'Other', rows: stray });
  const done = state.items.filter((i) => i.checked).sort((a, b) => b.updated_at - a.updated_at);
  if (done.length) groups.push({ title: `In the cart (${done.length})`, rows: done });

  const favNames = new Set(state.favorites.map((f) => f.name.toLowerCase()));
  $('groups').innerHTML = groups.map((g) => `
    <section class="group">
      <h2>${esc(g.title)}</h2>
      <div class="list">
        ${g.rows.map((i) => `
          <div class="row ${i.checked ? 'checked' : ''}" data-id="${i.id}">
            <button class="box" data-toggle="${i.id}" aria-label="Check off"><span>${i.checked ? '✓' : ''}</span></button>
            <div class="name" data-toggle="${i.id}">${esc(i.name)}${favNames.has(i.name.toLowerCase()) ? '<span class="star">★</span>' : ''}</div>
            <div class="qty" data-toggle="${i.id}">${esc(i.qty || '')}</div>
            <button class="more" data-edit="${i.id}" aria-label="Edit">⋯</button>
          </div>`).join('')}
      </div>
    </section>`).join('');
  $('empty').classList.toggle('hidden', state.items.length > 0);
}

// ---------- wiring ----------

function wireMain() {
  const input = $('addInput');
  $('addBtn').onclick = () => submitAdd();
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitAdd(); } });
  input.addEventListener('input', debounce(showSuggestions, 120));
  input.addEventListener('focus', showSuggestions);
  input.addEventListener('blur', () => setTimeout(() => { $('suggest').innerHTML = ''; }, 150));

  $('suggest').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    addItem(b.dataset.name, { aisle: b.dataset.aisle, qty: b.dataset.qty });
    input.value = '';
    $('suggest').innerHTML = '';
    input.focus();
  });

  $('favs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fav]');
    if (!b) return;
    if (b.classList.contains('on')) {
      const it = state.items.find((i) => !i.checked && i.name.toLowerCase() === b.dataset.fav.toLowerCase());
      if (it) toggle(it.id);
      return;
    }
    addItem(b.dataset.fav, { aisle: b.dataset.aisle, qty: b.dataset.qty });
  });

  $('groups').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return openSheet(edit.dataset.edit);
    const t = e.target.closest('[data-toggle]');
    if (t) toggle(t.dataset.toggle);
  });

  $('clearBtn').onclick = clearChecked;
  $('shareBtn').onclick = share;

  $('sCancel').onclick = closeSheet;
  $('sheetBg').addEventListener('click', (e) => { if (e.target === $('sheetBg')) closeSheet(); });
  $('sSave').onclick = saveSheet;
  $('sDelete').onclick = () => {
    const id = state.editing;
    closeSheet();
    mutate({ kind: 'remove', id }, () => { state.items = state.items.filter((i) => i.id !== id); });
  };
  $('sFav').onclick = () => {
    const it = state.items.find((i) => i.id === state.editing);
    if (!it) return;
    const isFav = state.favorites.some((f) => f.name.toLowerCase() === it.name.toLowerCase());
    mutate({ kind: 'favorite', name: it.name, favorite: !isFav }, () => {
      if (isFav) state.favorites = state.favorites.filter((f) => f.name.toLowerCase() !== it.name.toLowerCase());
      else state.favorites.push({ name: it.name, aisle: it.aisle, qty: it.qty });
      state.favorites.sort((a, b) => a.name.localeCompare(b.name));
    });
    $('sFav').textContent = !isFav ? '★ Favorite' : '☆ Favorite';
  };
}

function submitAdd() {
  const input = $('addInput');
  addItem(input.value);
  input.value = '';
  $('suggest').innerHTML = '';
  input.focus();
}

async function showSuggestions() {
  const q = $('addInput').value.trim();
  if (!state.online) { $('suggest').innerHTML = ''; return; }
  try {
    const { suggestions } = await api.suggest(state.code, q);
    const onList = new Set(state.items.filter((i) => !i.checked).map((i) => i.name.toLowerCase()));
    const rows = suggestions.filter((s) => !onList.has(s.name.toLowerCase()) && (q ? s.name.toLowerCase() !== q.toLowerCase() : true)).slice(0, 5);
    $('suggest').innerHTML = rows.map((s) =>
      `<button data-name="${esc(s.name)}" data-aisle="${esc(s.aisle)}" data-qty="${esc(s.qty || '')}"><span>${s.favorite ? '★ ' : ''}${esc(s.name)}</span><span class="aisle">${esc(s.aisle)}</span></button>`
    ).join('');
  } catch {
    $('suggest').innerHTML = '';
  }
}

function openSheet(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  state.editing = id;
  $('sheetTitle').textContent = it.name;
  $('sName').value = it.name;
  $('sQty').value = it.qty || '';
  $('sAisle').innerHTML = state.aisles.map((a) => `<option ${a === it.aisle ? 'selected' : ''}>${esc(a)}</option>`).join('');
  const isFav = state.favorites.some((f) => f.name.toLowerCase() === it.name.toLowerCase());
  $('sFav').textContent = isFav ? '★ Favorite' : '☆ Favorite';
  $('sheetBg').hidden = false;
}
function closeSheet() { $('sheetBg').hidden = true; state.editing = null; }
function saveSheet() {
  const it = state.items.find((i) => i.id === state.editing);
  if (!it) return closeSheet();
  const patch = {};
  const name = $('sName').value.trim();
  if (name && name !== it.name) patch.name = name;
  const qty = $('sQty').value.trim();
  if (qty !== (it.qty || '')) patch.qty = qty;
  const aisle = $('sAisle').value;
  if (aisle !== it.aisle) patch.aisle = aisle;
  closeSheet();
  if (!Object.keys(patch).length) return;
  mutate({ kind: 'update', id: it.id, patch }, () => Object.assign(it, patch));
}

async function share() {
  const url = `${location.origin}/?h=${state.code}`;
  const text = `Join our grocery list: ${url}`;
  if (navigator.share) {
    try { await navigator.share({ title: 'PantryShop', text, url }); return; } catch { /* user cancelled */ }
  }
  try { await navigator.clipboard.writeText(url); toast('Link copied.'); }
  catch { toast(`Share this code: ${state.code}`); }
}

// ---------- helpers ----------

let toastTimer;
function toast(msg) {
  const el = $('status');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (state.online) el.hidden = true; else setOnline(false); }, 2500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// A light client-side guess so an offline add lands in a sensible group until the server answers.
function guessAisleClient(name) {
  const n = name.toLowerCase();
  const map = [
    ['Produce', ['apple','banana','lettuce','tomato','onion','potato','carrot','avocado','berr','pepper','spinach','lemon','lime','grape','orange']],
    ['Bakery', ['bread','bagel','bun','tortilla']],
    ['Meat & Seafood', ['chicken','beef','pork','bacon','sausage','turkey','salmon','shrimp','steak']],
    ['Dairy & Eggs', ['milk','egg','cheese','butter','yogurt','cream']],
    ['Frozen', ['frozen','ice cream','pizza']],
    ['Drinks', ['water','soda','juice','coffee','tea','beer','wine']],
    ['Snacks', ['chip','cracker','cookie','candy','popcorn','pretzel']],
    ['Household', ['paper towel','toilet paper','trash','soap','detergent','foil']],
    ['Pantry', ['rice','pasta','flour','sugar','oil','sauce','cereal','bean','soup','can']],
  ];
  for (const [aisle, words] of map) if (words.some((w) => n.includes(w))) return aisle;
  return 'Other';
}
