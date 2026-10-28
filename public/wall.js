import { api, store, currentCode, splitQty, esc, debounce } from '/api.js';
import { CATALOG, AISLE_EMOJI, emojiFor } from '/catalog.js';

const $ = (id) => document.getElementById(id);
const LIST_ICONS = ['🛒', '🏬', '🔧', '🎉', '🐾', '👶', '💊', '🧺', '🌱', '🍖', '📦', '📝'];
const NIGHT_START = 22; // 10 PM
const NIGHT_END = 6;    // 6 AM
const NIGHT_WAKE_MS = 60 * 1000;

const state = {
  code: '',
  household: null,
  aisles: [],
  lists: [],
  listId: '',
  items: [],
  memory: [],
  recent: [],
  online: true,
  editing: null,
  editingList: null,
  undo: null,
  awakeUntil: 0,
  pantryQuery: '',
};

boot();

// ---------- boot ----------

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  state.code = currentCode();
  tickClock();
  setInterval(tickClock, 10000);
  wireStart();
  if (!state.code) {
    $('main').classList.add('hidden');
    $('start').classList.remove('hidden');
    return;
  }
  state.listId = store.load().listId || '';
  wire();
  await refresh();
  setInterval(() => { if (!sheetOpen()) refresh(); }, 5000);
  setInterval(nightCheck, 15000);
  nightCheck();
  // The frame's clock can be wrong right after a reboot. A daily reload clears any stale state.
  setTimeout(() => location.reload(), 24 * 60 * 60 * 1000);
}

function wireStart() {
  $('startNew').onclick = async () => {
    try {
      const { household } = await api.createHousehold('Home');
      store.save({ code: household.code, household });
      location.href = `/wall?h=${household.code}`;
    } catch (err) { flash(err.message); }
  };
  $('joinBtn').onclick = () => {
    const code = $('joinCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length >= 4) location.href = `/wall?h=${code}`;
  };
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
}

// ---------- data ----------

async function refresh() {
  try {
    const data = await api.items(state.code);
    state.household = data.household;
    state.aisles = data.aisles;
    state.lists = data.lists;
    state.items = data.items;
    if (!state.lists.some((l) => l.id === state.listId)) state.listId = state.lists[0]?.id || '';
    const [mem, rec] = await Promise.all([
      api.memory(state.code).catch(() => ({ memory: state.memory })),
      api.recent(state.code).catch(() => ({ recent: state.recent })),
    ]);
    state.memory = mem.memory;
    state.recent = rec.recent;
    store.save({ code: state.code, listId: state.listId });
    setOnline(true);
  } catch (err) {
    if (err.status === 404) {
      store.save({ code: '' });
      location.href = '/wall';
      return;
    }
    setOnline(false);
  }
  render();
}

function setOnline(on) {
  state.online = on;
  $('status').hidden = on;
  if (!on) $('status').textContent = 'No connection. Showing the last list.';
}

function currentList() { return state.lists.find((l) => l.id === state.listId); }
function listItems() { return state.items.filter((i) => i.list_id === state.listId); }
function onListKey(name) {
  const k = name.toLowerCase();
  return listItems().find((i) => !i.checked && i.name.toLowerCase() === k);
}

async function act(fn) {
  try { await fn(); } catch (err) {
    if (err.status && err.status < 500) flash(err.message); else setOnline(false);
  }
  await refresh();
}

// ---------- render ----------

function render() {
  if (!state.code) return;
  renderRail();
  renderHead();
  renderBoard();
  renderRecent();
  if (!$('pantry').hidden) renderPantry();
}

function renderRail() {
  $('code').textContent = state.code;
  $('lists').innerHTML = state.lists.map((l) => {
    const n = state.items.filter((i) => i.list_id === l.id && !i.checked).length;
    return `<button class="list ${l.id === state.listId ? 'on' : ''}" data-list="${l.id}">
      <span class="ico">${esc(l.icon)}</span><span class="n">${esc(l.name)}</span>${n ? `<span class="c">${n}</span>` : ''}
    </button>`;
  }).join('');
}

function renderHead() {
  const list = currentList();
  $('listName').textContent = list ? list.name : 'Grocery';
  const open = listItems().filter((i) => !i.checked).length;
  const done = listItems().filter((i) => i.checked).length;
  $('count').textContent = open === 0 ? (done ? 'all in the cart' : 'nothing to get') : `${open} to get${done ? `, ${done} in the cart` : ''}`;
  $('clear').disabled = done === 0;
  $('clear').textContent = done ? `Clear ${done} checked` : 'Clear checked';
}

function renderBoard() {
  const items = listItems();
  if (!items.length) {
    $('board').innerHTML = `<div class="empty">Nothing on this list.<small>Tap Add to put something on it.</small></div>`;
    return;
  }
  const groups = [];
  for (const aisle of state.aisles) {
    const rows = items.filter((i) => i.aisle === aisle && !i.checked);
    if (rows.length) groups.push({ title: aisle, rows });
  }
  const done = items.filter((i) => i.checked).sort((a, b) => b.updated_at - a.updated_at);
  if (done.length) groups.push({ title: 'In the cart', rows: done, done: true });

  $('board').innerHTML = groups.map((g) => `
    <section class="aisle ${g.done ? 'done' : ''}">
      <h2>${esc(g.title)}</h2>
      ${g.rows.map(rowHtml).join('')}
    </section>`).join('');
}

function rowHtml(i) {
  return `<div class="row ${i.checked ? 'checked' : ''}" data-id="${i.id}">
    <div class="emoji">${emojiFor(i.name, i.aisle)}</div>
    <div class="name" data-edit="${i.id}"><span class="word">${esc(i.name)}</span>${i.note ? `<span class="note">${esc(i.note)}</span>` : ''}</div>
    <div class="qty">${esc(i.qty || '')}</div>
  </div>`;
}

function renderRecent() {
  const onList = new Set(listItems().map((i) => i.name.toLowerCase()));
  const chips = state.recent.filter((r) => !onList.has(r.name.toLowerCase())).slice(0, 7);
  $('recent').innerHTML = chips.map((r) =>
    `<button class="chip" data-again="${esc(r.name)}" data-aisle="${esc(r.aisle)}" data-qty="${esc(r.qty || '')}"><span class="e">${emojiFor(r.name, r.aisle)}</span>${esc(r.name)}</button>`
  ).join('');
}

// ---------- pantry ----------

function openPantry() {
  state.pantryQuery = '';
  $('search').value = '';
  $('pantry').hidden = false;
  renderPantry();
  $('shelves').scrollTop = 0;
}
function closePantry() {
  $('pantry').hidden = true;
  $('search').blur();
}

function renderPantry() {
  const q = state.pantryQuery.trim().toLowerCase();
  const counts = new Map();
  for (const i of listItems()) if (!i.checked) counts.set(i.name.toLowerCase(), i);

  const catalogKeys = new Set(CATALOG.map(([n]) => n.toLowerCase()));
  const house = state.memory
    .filter((m) => !catalogKeys.has(m.name.toLowerCase()))
    .map((m) => [m.name, emojiFor(m.name, m.aisle), m.aisle]);

  const shelves = [];
  if (house.length) shelves.push({ title: 'Your usual', tiles: house });
  for (const aisle of state.aisles) {
    const tiles = CATALOG.filter((t) => t[2] === aisle);
    if (tiles.length) shelves.push({ title: aisle, tiles });
  }

  let anyExact = false;
  const html = shelves.map((s) => {
    const tiles = q ? s.tiles.filter(([n]) => n.toLowerCase().includes(q)) : s.tiles;
    if (!tiles.length) return '';
    return `<section class="shelf" id="shelf-${shelves.indexOf(s)}"><h2>${esc(s.title)}</h2><div class="tiles">${tiles.map(([n, e, a]) => {
      const on = counts.get(n.toLowerCase());
      if (n.toLowerCase() === q) anyExact = true;
      return `<button class="tile ${on ? 'on' : ''}" data-tile="${esc(n)}" data-aisle="${esc(a)}">
        <span class="e">${e}</span><span class="n">${esc(n)}</span>${on ? `<span class="b">${esc(on.qty || '✓')}</span>` : ''}
      </button>`;
    }).join('')}</div></section>`;
  }).join('');

  $('jump').innerHTML = q ? '' : shelves.map((sh, i) => `<button data-jump="${i}"><span>${AISLE_EMOJI[sh.title] || '⭐'}</span>${esc(sh.title)}</button>`).join('');
  $('shelves').innerHTML = html || `<div class="none">Nothing in the pantry matches. Tap the blue button to add it anyway.</div>`;
  const typed = $('addTyped');
  if (q && !anyExact) {
    const { name, qty } = splitQty(state.pantryQuery.trim());
    typed.textContent = `Add “${name}”${qty ? ` ×${qty}` : ''}`;
    typed.hidden = false;
  } else {
    typed.hidden = true;
  }
}

async function addByName(name, extra = {}) {
  const on = onListKey(name);
  if (on) {
    // Second tap on something already listed bumps the count.
    const n = parseInt(on.qty, 10);
    const qty = Number.isFinite(n) ? String(n + 1) : '2';
    await act(() => api.update(state.code, on.id, { qty }));
    return;
  }
  await act(() => api.add(state.code, { name, list_id: state.listId, ...extra }));
}

// ---------- item sheet ----------

function sheetOpen() { return !$('itemSheet').hidden || !$('listSheet').hidden || !$('pantry').hidden; }

function openItem(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  state.editing = id;
  const mem = state.memory.find((m) => m.name.toLowerCase() === it.name.toLowerCase()) || {};
  $('sTitle').textContent = it.name;
  $('sName').value = it.name;
  $('sQty').value = it.qty || '';
  $('sNote').value = it.note || '';
  $('sAisle').innerHTML = state.aisles.map((a) => `<option ${a === it.aisle ? 'selected' : ''}>${esc(a)}</option>`).join('');
  $('sList').innerHTML = state.lists.map((l) => `<option value="${l.id}" ${l.id === it.list_id ? 'selected' : ''}>${esc(l.icon)} ${esc(l.name)}</option>`).join('');
  setTog($('sFav'), !!mem.favorite, '★ Favorite', 'Favorite');
  setTog($('sWeekly'), !!mem.weekly, '✓ Every week', 'Every week');
  $('itemSheet').hidden = false;
}
function closeItem() { $('itemSheet').hidden = true; state.editing = null; }

function setTog(btn, on, onText, offText) {
  btn.classList.toggle('on', on);
  btn.dataset.on = on ? '1' : '';
  btn.textContent = on ? onText : offText;
}

async function saveItem() {
  const it = state.items.find((i) => i.id === state.editing);
  if (!it) return closeItem();
  const patch = {};
  const name = $('sName').value.trim();
  if (name && name !== it.name) patch.name = name;
  const qty = $('sQty').value.trim();
  if (qty !== (it.qty || '')) patch.qty = qty;
  const note = $('sNote').value.trim();
  if (note !== (it.note || '')) patch.note = note;
  if ($('sAisle').value !== it.aisle) patch.aisle = $('sAisle').value;
  if ($('sList').value !== it.list_id) patch.list_id = $('sList').value;
  const fav = $('sFav').dataset.on === '1';
  const weekly = $('sWeekly').dataset.on === '1';
  const mem = state.memory.find((m) => m.name.toLowerCase() === it.name.toLowerCase()) || {};
  closeItem();
  await act(async () => {
    if (Object.keys(patch).length) await api.update(state.code, it.id, patch);
    if (fav !== !!mem.favorite || weekly !== !!mem.weekly) await api.setFlags(state.code, name || it.name, { favorite: fav, weekly });
  });
}

// ---------- list sheet ----------

function openListSheet(list) {
  state.editingList = list ? list.id : null;
  $('lTitle').textContent = list ? list.name : 'New list';
  $('lName').value = list ? list.name : '';
  const icon = list ? list.icon : LIST_ICONS[0];
  $('lIcons').innerHTML = LIST_ICONS.map((e) => `<button data-icon="${e}" class="${e === icon ? 'on' : ''}">${e}</button>`).join('');
  $('lDelete').classList.toggle('hidden', !list || state.lists.length <= 1);
  $('listSheet').hidden = false;
  if (!list) setTimeout(() => $('lName').focus(), 50);
}
function closeListSheet() { $('listSheet').hidden = true; state.editingList = null; }

async function saveList() {
  const name = $('lName').value.trim();
  const icon = $('lIcons').querySelector('.on')?.dataset.icon || LIST_ICONS[0];
  if (!name) return flash('Give the list a name.');
  const id = state.editingList;
  closeListSheet();
  await act(async () => {
    if (id) await api.updateList(state.code, id, { name, icon });
    else {
      const { list } = await api.createList(state.code, name, icon);
      state.listId = list.id;
    }
  });
}

// ---------- undo ----------

let toastTimer;
function offerUndo(text, fn) {
  state.undo = fn;
  $('toastText').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; state.undo = null; }, 6000);
}

async function toggleChecked(id) {
  const it = state.items.find((i) => i.id === id);
  if (!it) return;
  const checked = !it.checked;
  it.checked = checked; it.updated_at = Date.now();
  render();
  await act(() => api.update(state.code, id, { checked }));
  if (checked) offerUndo(`${it.name} is in the cart`, () => act(() => api.update(state.code, id, { checked: false })));
}

async function clearChecked() {
  const gone = listItems().filter((i) => i.checked);
  if (!gone.length) return;
  await act(() => api.clearChecked(state.code, state.listId));
  offerUndo(`Cleared ${gone.length} item${gone.length === 1 ? '' : 's'}`, () => act(async () => {
    for (const g of gone) {
      const { item } = await api.add(state.code, { name: g.name, qty: g.qty, aisle: g.aisle, note: g.note, list_id: g.list_id });
      if (item) await api.update(state.code, item.id, { checked: true });
    }
  }));
}

// ---------- night ----------

function nightCheck() {
  const h = new Date().getHours();
  const isNight = h >= NIGHT_START || h < NIGHT_END;
  const awake = Date.now() < state.awakeUntil;
  $('night').hidden = !(isNight && !awake && !sheetOpen());
}

// ---------- clock ----------

function tickClock() {
  const d = new Date();
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
  $('clock').textContent = `${h}:${m} ${ap}`;
  $('nightClock').textContent = `${h}:${m}`;
}

// ---------- status ----------

let flashTimer;
function flash(msg) {
  $('status').textContent = msg;
  $('status').hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (state.online) $('status').hidden = true; }, 2500);
}

// ---------- wiring ----------

function wire() {
  $('lists').addEventListener('click', (e) => {
    const b = e.target.closest('[data-list]');
    if (!b) return;
    if (b.dataset.list === state.listId) return openListSheet(currentList());
    state.listId = b.dataset.list;
    store.save({ listId: state.listId });
    render();
  });
  $('newList').onclick = () => openListSheet(null);

  $('board').addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) return openItem(edit.dataset.edit);
    const row = e.target.closest('[data-id]');
    if (row) toggleChecked(row.dataset.id);
  });

  $('recent').addEventListener('click', (e) => {
    const b = e.target.closest('[data-again]');
    if (b) addByName(b.dataset.again, { aisle: b.dataset.aisle, qty: b.dataset.qty });
  });
  $('clear').onclick = clearChecked;
  $('undo').onclick = () => { const fn = state.undo; $('toast').hidden = true; state.undo = null; if (fn) fn(); };

  // pantry
  $('openPantry').onclick = openPantry;
  $('closePantry').onclick = closePantry;
  $('search').addEventListener('input', debounce(() => { state.pantryQuery = $('search').value; renderPantry(); }, 80));
  $('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = $('search').value.trim();
    if (!q) return;
    const { name, qty } = splitQty(q);
    const exact = CATALOG.find(([n]) => n.toLowerCase() === name.toLowerCase());
    addByName(exact ? exact[0] : name, { qty, aisle: exact ? exact[2] : undefined });
    $('search').value = ''; state.pantryQuery = ''; renderPantry();
  });
  $('addTyped').onclick = () => {
    const { name, qty } = splitQty($('search').value.trim());
    if (!name) return;
    addByName(name, { qty });
    $('search').value = ''; state.pantryQuery = ''; renderPantry();
  };
  $('jump').addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]');
    const el = b && document.getElementById(`shelf-${b.dataset.jump}`);
    if (el) $('shelves').scrollTop = el.offsetTop - $('shelves').offsetTop - 6;
  });
  $('shelves').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tile]');
    if (t) addByName(t.dataset.tile, { aisle: t.dataset.aisle });
  });

  // item sheet
  $('sCancel').onclick = closeItem;
  $('sSave').onclick = saveItem;
  $('sDelete').onclick = async () => {
    const it = state.items.find((i) => i.id === state.editing);
    closeItem();
    if (!it) return;
    await act(() => api.remove(state.code, it.id));
    offerUndo(`Deleted ${it.name}`, () => act(() => api.add(state.code, { name: it.name, qty: it.qty, aisle: it.aisle, note: it.note, list_id: it.list_id })));
  };
  $('sMinus').onclick = () => { const n = parseInt($('sQty').value, 10); $('sQty').value = Number.isFinite(n) && n > 1 ? String(n - 1) : ''; };
  $('sPlus').onclick = () => { const n = parseInt($('sQty').value, 10); $('sQty').value = Number.isFinite(n) ? String(n + 1) : '2'; };
  $('sFav').onclick = () => setTog($('sFav'), $('sFav').dataset.on !== '1', '★ Favorite', 'Favorite');
  $('sWeekly').onclick = () => setTog($('sWeekly'), $('sWeekly').dataset.on !== '1', '✓ Every week', 'Every week');
  $('itemSheet').addEventListener('click', (e) => { if (e.target === $('itemSheet')) closeItem(); });

  // list sheet
  $('lCancel').onclick = closeListSheet;
  $('lSave').onclick = saveList;
  $('lName').addEventListener('keydown', (e) => { if (e.key === 'Enter') saveList(); });
  $('lIcons').addEventListener('click', (e) => {
    const b = e.target.closest('[data-icon]');
    if (!b) return;
    $('lIcons').querySelectorAll('button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
  });
  $('lDelete').onclick = async () => {
    const id = state.editingList;
    closeListSheet();
    if (!id) return;
    await act(() => api.deleteList(state.code, id));
  };
  $('listSheet').addEventListener('click', (e) => { if (e.target === $('listSheet')) closeListSheet(); });

  // night
  $('night').addEventListener('click', () => { state.awakeUntil = Date.now() + NIGHT_WAKE_MS; nightCheck(); });
  document.addEventListener('click', () => { if (Date.now() < state.awakeUntil) state.awakeUntil = Date.now() + NIGHT_WAKE_MS; });
}
