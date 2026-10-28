import { api, store, currentCode, splitQty } from '/api.js';

const $ = (id) => document.getElementById(id);
const state = { code: '', aisles: [], items: [], favorites: [], online: true };

boot();

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  state.code = currentCode();
  tickClock();
  setInterval(tickClock, 15000);
  $('joinBtn').onclick = () => {
    const code = $('joinCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length >= 4) location.href = `/wall?h=${code}`;
  };
  $('startNew').onclick = async () => {
    try {
      const { household } = await api.createHousehold('Home');
      store.save({ code: household.code, household });
      location.href = `/wall?h=${household.code}`;
    } catch (err) {
      $('status').hidden = false;
      $('status').textContent = err.message;
    }
  };
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
  if (!state.code) {
    $('main').classList.add('hidden');
    $('start').classList.remove('hidden');
    return;
  }
  wire();
  await refresh();
  setInterval(refresh, 5000);
  // The frame's clock starts wrong after a reboot and the page can fail to load. Reload once a day to stay fresh.
  setTimeout(() => location.reload(), 24 * 60 * 60 * 1000);
}

async function refresh() {
  try {
    const data = await api.items(state.code);
    state.aisles = data.aisles;
    state.items = data.items;
    const favs = await api.favorites(state.code).catch(() => ({ favorites: state.favorites }));
    state.favorites = favs.favorites;
    store.save({ code: state.code, wallItems: state.items });
    setOnline(true);
  } catch (err) {
    if (err.status === 404) {
      $('main').classList.add('hidden');
      $('start').classList.remove('hidden');
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

function render() {
  const open = state.items.filter((i) => !i.checked);
  $('count').textContent = `${open.length} to get`;
  $('joinUrl').textContent = `${location.host}/?h=${state.code}`;

  const onList = new Set(open.map((i) => i.name.toLowerCase()));
  $('favs').innerHTML = state.favorites.map((f) => {
    const on = onList.has(f.name.toLowerCase());
    return `<button class="chip ${on ? 'on' : ''}" data-fav="${esc(f.name)}" data-aisle="${esc(f.aisle)}" data-qty="${esc(f.qty || '')}">${on ? '✓ ' : '+ '}${esc(f.name)}</button>`;
  }).join('');

  const groups = [];
  for (const aisle of state.aisles) {
    const rows = state.items.filter((i) => i.aisle === aisle);
    if (rows.length) groups.push({ title: aisle, rows: rows.sort((a, b) => a.checked - b.checked) });
  }
  if (!groups.length) {
    $('groups').innerHTML = '<div class="empty">Nothing on the list.</div>';
    return;
  }
  $('groups').innerHTML = groups.map((g) => `
    <section class="group">
      <h2>${esc(g.title)}</h2>
      <div class="list">
        ${g.rows.map((i) => `
          <div class="row ${i.checked ? 'checked' : ''}" data-toggle="${i.id}">
            <button class="box"><span>${i.checked ? '✓' : ''}</span></button>
            <div class="name">${esc(i.name)}</div>
            <div class="qty">${esc(i.qty || '')}</div>
          </div>`).join('')}
      </div>
    </section>`).join('');
}

function wire() {
  $('groups').addEventListener('click', async (e) => {
    const row = e.target.closest('[data-toggle]');
    if (!row) return;
    const it = state.items.find((i) => i.id === row.dataset.toggle);
    if (!it) return;
    it.checked = !it.checked;
    render();
    try { await api.update(state.code, it.id, { checked: it.checked }); } catch { setOnline(false); }
    refresh();
  });

  $('favs').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-fav]');
    if (!b) return;
    if (b.classList.contains('on')) {
      const it = state.items.find((i) => !i.checked && i.name.toLowerCase() === b.dataset.fav.toLowerCase());
      if (it) { try { await api.update(state.code, it.id, { checked: true }); } catch { setOnline(false); } }
    } else {
      try { await api.add(state.code, { name: b.dataset.fav, aisle: b.dataset.aisle, qty: b.dataset.qty }); } catch { setOnline(false); }
    }
    refresh();
  });

  const input = $('addInput');
  const submit = async () => {
    const { name, qty } = splitQty(input.value);
    input.value = '';
    $('suggest').innerHTML = '';
    input.blur();
    if (!name) return;
    try { await api.add(state.code, { name, qty }); } catch { setOnline(false); }
    refresh();
  };
  $('addBtn').onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  input.addEventListener('input', debounce(suggest, 120));
  input.addEventListener('blur', () => setTimeout(() => { $('suggest').innerHTML = ''; }, 150));
  $('suggest').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    input.value = '';
    $('suggest').innerHTML = '';
    try { await api.add(state.code, { name: b.dataset.name, aisle: b.dataset.aisle, qty: b.dataset.qty }); } catch { setOnline(false); }
    refresh();
  });

  $('clearBtn').onclick = async () => {
    try { await api.clearChecked(state.code); } catch { setOnline(false); }
    refresh();
  };
}

async function suggest() {
  const q = $('addInput').value.trim();
  if (!q) { $('suggest').innerHTML = ''; return; }
  try {
    const { suggestions } = await api.suggest(state.code, q);
    const onList = new Set(state.items.filter((i) => !i.checked).map((i) => i.name.toLowerCase()));
    $('suggest').innerHTML = suggestions.filter((s) => !onList.has(s.name.toLowerCase())).slice(0, 4).map((s) =>
      `<button data-name="${esc(s.name)}" data-aisle="${esc(s.aisle)}" data-qty="${esc(s.qty || '')}"><span>${esc(s.name)}</span><span class="aisle">${esc(s.aisle)}</span></button>`
    ).join('');
  } catch { $('suggest').innerHTML = ''; }
}

function tickClock() {
  const d = new Date();
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  $('clock').textContent = `${h}:${m} ${ap}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
