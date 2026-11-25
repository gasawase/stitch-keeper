'use strict';

/* ---------- Storage ---------- */

const STORAGE_KEY = 'stitch-keeper:v1';
const HISTORY_LIMIT = 50;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.projects)) return data;
    }
  } catch (err) {
    console.warn('Could not load saved data', err);
  }
  return { version: 1, projects: [] };
}

let state = loadState();
let saveWarned = false;

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save', err);
    if (!saveWarned) {
      saveWarned = true;
      toast('Could not save on this device. Try saving a backup file.');
    }
  }
}

// Ask the browser not to clear our data when space runs low.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

/* ---------- Helpers ---------- */

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function parsePositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function buzz() {
  if (navigator.vibrate) navigator.vibrate(15);
}

function projectById(id) {
  return state.projects.find((p) => p.id === id) || null;
}

/* ---------- Counter logic ---------- */

function stepUp(counter) {
  counter.value += 1;
  if (counter.max && counter.value > counter.max) {
    counter.value = 1;
    counter.laps += 1;
  }
}

function stepDown(counter) {
  if (counter.max && counter.value <= 1 && counter.laps > 0) {
    counter.value = counter.max;
    counter.laps -= 1;
  } else if (counter.value > 0) {
    counter.value -= 1;
  }
}

// Save a copy of the counts before each change so Undo can restore it.
function remember(project) {
  project.history.push(JSON.stringify({ rows: project.rows, counters: project.counters }));
  if (project.history.length > HISTORY_LIMIT) project.history.shift();
}

function changed(project) {
  project.updated = Date.now();
  save();
  renderProject();
}

/* ---------- Routing ---------- */

let currentId = null;
let openedFromList = false;

function route() {
  const match = location.hash.match(/^#\/p\/(.+)$/);
  const project = match ? projectById(decodeURIComponent(match[1])) : null;
  currentId = project ? project.id : null;
  if (!project) openedFromList = false;
  $('#projects-view').hidden = !!project;
  $('#project-view').hidden = !project;
  if (project) renderProject();
  else renderList();
  updateWakeLock();
  window.scrollTo(0, 0);
}

function openProject(id) {
  openedFromList = true;
  history.pushState(null, '', '#/p/' + encodeURIComponent(id));
  route();
}

function goToList() {
  if (openedFromList) {
    history.back(); // keeps the phone's back button in sync
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

window.addEventListener('popstate', route);

/* ---------- Project list ---------- */

function renderList() {
  const list = $('#project-list');
  list.replaceChildren();
  const projects = [...state.projects].sort((a, b) => b.updated - a.updated);
  $('#empty-projects').hidden = projects.length > 0;
  for (const p of projects) {
    const meta = p.target ? `Row ${p.rows} of ${p.target}` : `Row ${p.rows}`;
    list.append(el('li', {}, [
      el('button', { class: 'project-card', onclick: () => openProject(p.id) }, [
        el('span', { class: 'name', text: p.name }),
        el('span', { class: 'meta', text: meta }),
      ]),
    ]));
  }
}

/* ---------- Single project ---------- */

function current() {
  return projectById(currentId);
}

function renderProject() {
  const p = current();
  if (!p) return;
  $('#project-title').textContent = p.name;
  $('#row-number').textContent = p.rows;

  if (p.target) {
    $('#row-target').textContent = `of ${p.target}`;
    $('#progress').hidden = false;
    $('#progress-bar').style.width = Math.min(100, (p.rows / p.target) * 100) + '%';
  } else {
    $('#row-target').textContent = '';
    $('#progress').hidden = true;
  }

  $('#undo-btn').disabled = p.history.length === 0;
  $('#undo-btn').style.opacity = p.history.length ? '1' : '0.4';

  const list = $('#counter-list');
  list.replaceChildren();
  $('#empty-counters').hidden = p.counters.length > 0;
  for (const c of p.counters) {
    const parts = [];
    if (c.max) parts.push(`of ${c.max} · repeat ${c.laps + 1}`);
    if (c.follow) parts.push('moves with rows');
    list.append(el('li', { class: 'counter' + (c.follow ? ' linked' : '') }, [
      el('button', { class: 'info', 'aria-label': `Edit ${c.name}`, onclick: () => openCounterDialog(c.id) }, [
        el('div', { class: 'name', text: c.name }),
        el('div', { class: 'sub', text: parts.join(' · ') }),
      ]),
      el('button', { class: 'btn', 'aria-label': `${c.name} minus one`, text: '−', onclick: () => bumpCounter(c.id, -1) }),
      el('span', { class: 'value', text: String(c.value) }),
      el('button', { class: 'btn', 'aria-label': `${c.name} plus one`, text: '+', onclick: () => bumpCounter(c.id, 1) }),
    ]));
  }

  const notes = $('#notes');
  if (document.activeElement !== notes) notes.value = p.notes || '';
}

function bumpRow(delta) {
  const p = current();
  if (!p) return;
  if (delta < 0 && p.rows === 0) return;
  remember(p);
  p.rows += delta;
  for (const c of p.counters) {
    if (c.follow) (delta > 0 ? stepUp : stepDown)(c);
  }
  buzz();
  changed(p);
  if (delta > 0 && p.target && p.rows === p.target) toast(`You reached row ${p.target}!`);
}

function bumpCounter(counterId, delta) {
  const p = current();
  const c = p && p.counters.find((x) => x.id === counterId);
  if (!c) return;
  remember(p);
  (delta > 0 ? stepUp : stepDown)(c);
  buzz();
  changed(p);
}

function undo() {
  const p = current();
  if (!p || p.history.length === 0) return;
  const snapshot = JSON.parse(p.history.pop());
  p.rows = snapshot.rows;
  p.counters = snapshot.counters;
  changed(p);
  toast('Undone');
}

$('#row-plus').addEventListener('click', () => bumpRow(1));
$('#row-minus').addEventListener('click', () => bumpRow(-1));
$('#undo-btn').addEventListener('click', undo);
$('#back-btn').addEventListener('click', goToList);

let notesTimer;
$('#notes').addEventListener('input', (e) => {
  const p = current();
  if (!p) return;
  p.notes = e.target.value;
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => {
    p.updated = Date.now();
    save();
    const saved = $('#notes-saved');
    saved.hidden = false;
    setTimeout(() => { saved.hidden = true; }, 1200);
  }, 400);
});

/* ---------- Dialogs ---------- */

document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => btn.closest('dialog').close());
});

// Project dialog
let editingProjectId = null;

function openProjectDialog(id) {
  const p = id ? projectById(id) : null;
  editingProjectId = p ? p.id : null;
  const form = $('#project-form');
  form.reset();
  $('#project-dialog-title').textContent = p ? 'Edit project' : 'New project';
  $('#delete-project-btn').hidden = !p;
  $('#reset-rows-btn').hidden = !p;
  form.elements.name.value = p ? p.name : '';
  form.elements.target.value = p && p.target ? p.target : '';
  $('#project-dialog').showModal();
}

$('#new-project-btn').addEventListener('click', () => openProjectDialog(null));
$('#edit-project-btn').addEventListener('click', () => openProjectDialog(currentId));

$('#project-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const name = form.elements.name.value.trim();
  if (!name) return;
  const target = parsePositiveInt(form.elements.target.value);
  $('#project-dialog').close();

  if (editingProjectId) {
    const p = projectById(editingProjectId);
    p.name = name;
    p.target = target;
    changed(p);
  } else {
    const now = Date.now();
    const p = {
      id: newId(), name, target, rows: 0, counters: [], notes: '',
      history: [], created: now, updated: now,
    };
    state.projects.push(p);
    save();
    openProject(p.id);
  }
});

$('#reset-rows-btn').addEventListener('click', () => {
  const p = projectById(editingProjectId);
  if (!p) return;
  remember(p);
  p.rows = 0;
  $('#project-dialog').close();
  changed(p);
  toast('Rows reset to 0. Tap ↶ to undo.');
});

$('#delete-project-btn').addEventListener('click', () => {
  const p = projectById(editingProjectId);
  if (!p) return;
  if (!confirm(`Delete “${p.name}”? This can't be undone.`)) return;
  state.projects = state.projects.filter((x) => x.id !== p.id);
  save();
  $('#project-dialog').close();
  goToList();
});

// Counter dialog
let editingCounterId = null;

function openCounterDialog(id) {
  const p = current();
  const c = id ? p.counters.find((x) => x.id === id) : null;
  editingCounterId = c ? c.id : null;
  const form = $('#counter-form');
  form.reset();
  $('#counter-dialog-title').textContent = c ? 'Edit counter' : 'New counter';
  $('#delete-counter-btn').hidden = !c;
  $('#reset-counter-btn').hidden = !c;
  form.elements.name.value = c ? c.name : '';
  form.elements.max.value = c && c.max ? c.max : '';
  form.elements.follow.checked = c ? c.follow : true;
  $('#counter-dialog').showModal();
}

$('#add-counter-btn').addEventListener('click', () => openCounterDialog(null));

$('#counter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = current();
  const form = e.target;
  const name = form.elements.name.value.trim();
  if (!p || !name) return;
  const max = parsePositiveInt(form.elements.max.value);
  const follow = form.elements.follow.checked;
  $('#counter-dialog').close();

  const c = editingCounterId && p.counters.find((x) => x.id === editingCounterId);
  if (c) {
    c.name = name;
    c.max = max;
    c.follow = follow;
    if (max && c.value > max) c.value = max;
    if (!max) c.laps = 0;
  } else {
    p.counters.push({ id: newId(), name, max, follow, value: 0, laps: 0 });
  }
  changed(p);
});

$('#reset-counter-btn').addEventListener('click', () => {
  const p = current();
  const c = p && p.counters.find((x) => x.id === editingCounterId);
  if (!c) return;
  remember(p);
  c.value = 0;
  c.laps = 0;
  $('#counter-dialog').close();
  changed(p);
  toast(`${c.name} reset. Tap ↶ to undo.`);
});

$('#delete-counter-btn').addEventListener('click', () => {
  const p = current();
  if (!p) return;
  remember(p);
  p.counters = p.counters.filter((x) => x.id !== editingCounterId);
  $('#counter-dialog').close();
  changed(p);
  toast('Counter deleted. Tap ↶ to undo.');
});

/* ---------- Backup ---------- */

$('#menu-btn').addEventListener('click', () => $('#menu-dialog').showModal());

$('#export-btn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `stitch-keeper-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('#import-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.projects)) throw new Error('Not a Stitch Keeper backup');
    const count = data.projects.length;
    if (!confirm(`Replace the projects on this device with the ${count} project(s) in this backup?`)) return;
    state = data;
    save();
    $('#menu-dialog').close();
    route();
    toast('Backup restored');
  } catch (err) {
    toast("That file doesn't look like a Stitch Keeper backup.");
  }
});

/* ---------- Keep screen on ---------- */

let wakeLock = null;

async function updateWakeLock() {
  const want = $('#wake-toggle').checked && currentId && document.visibilityState === 'visible';
  if (want && !wakeLock) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (err) {
      $('#wake-toggle').checked = false;
      toast("This browser can't keep the screen on.");
    }
  } else if (!want && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

try {
  $('#wake-toggle').checked = localStorage.getItem('stitch-keeper:wake') === '1';
} catch (err) { /* ignore */ }

$('#wake-toggle').addEventListener('change', (e) => {
  try { localStorage.setItem('stitch-keeper:wake', e.target.checked ? '1' : '0'); } catch (err) { /* ignore */ }
  updateWakeLock();
});
document.addEventListener('visibilitychange', updateWakeLock);

/* ---------- Offline support ---------- */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline mode unavailable', err));
}

route();
