// ---- helpers ----
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw new Error('Not authenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatPoints(n) {
  if (!n) return 'unknown';
  return `${(n / 1_000_000).toFixed(2)}M points`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString();
}

function timeAgo(d) {
  if (!d) return 'never';
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Best-effort fallback until /api/config resolves - the real public domain
// can differ from wherever this admin panel is currently being viewed from
// (e.g. a LAN IP), which matters for links meant to be shared with clients.
let PUBLIC_BASE = `${window.location.protocol}//${window.location.hostname}`;
(async () => {
  try {
    const cfg = await api('/api/config');
    if (cfg.publicBase) PUBLIC_BASE = cfg.publicBase.replace(/\/+$/, '');
  } catch { /* keep the fallback */ }
})();

function projectUrl(slug) {
  return `${PUBLIC_BASE}/${encodeURIComponent(slug)}/`;
}

// Works over plain HTTP too, where the Clipboard API is unavailable because
// it requires a secure context (this admin panel is plain HTTP on the LAN).
// Also falls through to the textarea method if the modern API exists but
// still rejects (e.g. permission denied) rather than leaving the button
// stuck with no feedback at all.
async function copyToClipboard(text) {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall through to the textarea fallback below */ }
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(c);
  return node;
}

// ---- disk usage ----
async function loadDiskUsage() {
  try {
    const d = await api('/api/disk-usage');
    const fill = document.getElementById('diskUsageFill');
    const label = document.getElementById('diskUsageLabel');
    const pct = document.getElementById('diskUsagePct');
    const level = d.usedPercent >= 90 ? 'danger' : d.usedPercent >= 75 ? 'warn' : '';
    fill.style.width = `${d.usedPercent}%`;
    fill.className = level;
    pct.className = `disk-usage-pct ${level}`;
    pct.textContent = `${d.usedPercent}% used`;
    label.className = `disk-usage-label ${level}`;
    label.textContent = `${formatBytes(d.usedBytes)} of ${formatBytes(d.totalBytes)} used — ${formatBytes(d.freeBytes)} free`;
  } catch {
    document.getElementById('diskUsageLabel').textContent = 'Disk usage unavailable';
  }
}
loadDiskUsage();
setInterval(loadDiskUsage, 20000);

// ---- tabs ----
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    ['projects', 'trash', 'jobs'].forEach((name) => {
      document.getElementById(`tab-${name}`).hidden = name !== tab.dataset.tab;
    });
    if (tab.dataset.tab === 'trash') loadTrash();
    if (tab.dataset.tab === 'jobs') loadJobs();
  });
});

// ---- logout ----
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ---- confirm modal ----
const confirmOverlay = document.getElementById('confirmOverlay');
let confirmCallback = null;
function openConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;
  confirmOverlay.hidden = false;
}
document.getElementById('confirmCancelBtn').addEventListener('click', () => { confirmOverlay.hidden = true; });
document.getElementById('confirmOkBtn').addEventListener('click', () => {
  confirmOverlay.hidden = true;
  if (confirmCallback) confirmCallback();
});

// ---- projects tab ----
let allProjects = [];

async function loadProjects() {
  allProjects = await api('/api/projects');
  renderProjects();
}

function renderProjects() {
  const grid = document.getElementById('projectsGrid');
  const filter = document.getElementById('searchInput').value.trim().toLowerCase();
  grid.innerHTML = '';
  const filtered = allProjects.filter((p) => p.title.toLowerCase().includes(filter));
  if (!filtered.length) {
    grid.appendChild(el('div', { class: 'empty', text: allProjects.length ? 'No projects match your search.' : 'No projects yet. Click "New project" to upload one.' }));
    return;
  }
  filtered.forEach((p) => grid.appendChild(renderProjectCard(p)));
}

// Views and load timings for one project (collected by lib/stats.js from Apache's log).
function renderStats(st) {
  const box = el('div', { class: 'stats' });
  if (!st || !st.views) {
    box.appendChild(el('div', { class: 'stats-line muted', text: 'No views yet' }));
  } else {
    const line = el('div', { class: 'stats-line' });
    line.appendChild(el('strong', { text: `${st.views} ${st.views === 1 ? 'view' : 'views'}` }));
    line.appendChild(document.createTextNode(` · ${st.views30} in the last 30 days`));
    box.appendChild(line);
    if (st.lastView) box.appendChild(el('div', { class: 'stats-line muted', text: `last viewed ${formatDate(st.lastView)}` }));
  }
  const loadLine = (label, l) => {
    const secs = (ms) => (ms / 1000).toFixed(ms < 10000 ? 1 : 0);
    const line = el('div', { class: 'stats-line', title: `Median of the last ${l.count} ${label} ${l.count === 1 ? 'visit' : 'visits'}. "Loads in" = until the first view had finished loading; "first points" = until anything was visible.` });
    line.appendChild(el('span', { class: 'stats-tag', text: label }));
    line.appendChild(document.createTextNode(` loads in `));
    line.appendChild(el('strong', { text: `${secs(l.fullMs)} s` }));
    line.appendChild(document.createTextNode(` · first points ${secs(l.firstMs)} s`));
    if (l.mbPerSec !== null) {
      line.appendChild(document.createTextNode(' · '));
      line.appendChild(el('strong', { text: `${l.mbPerSec} MB/s` }));
    }
    return line;
  };
  if (st && st.publicLoads) box.appendChild(loadLine('internet', st.publicLoads));
  if (st && st.lanLoads) box.appendChild(loadLine('local', st.lanLoads));
  return box;
}

function renderProjectCard(p) {
  const card = el('div', { class: 'card' });
  if (p.hasThumbnail) {
    card.appendChild(el('img', {
      class: 'thumb',
      src: `/thumbnails/${encodeURIComponent(p.slug)}.jpg?t=${new Date(p.modifiedAt).getTime()}`,
      alt: '',
      loading: 'lazy',
    }));
  } else {
    card.appendChild(el('div', { class: 'thumb-placeholder', text: 'No thumbnail yet' }));
  }
  card.appendChild(el('h3', { text: p.title }));
  card.appendChild(el('div', {
    class: 'meta',
    html: `${formatPoints(p.points)}<br>${formatBytes(p.sizeBytes)} on disk<br>modified ${formatDate(p.modifiedAt)}`,
  }));
  card.appendChild(renderStats(p.stats));
  const actions = el('div', { class: 'actions' });
  actions.appendChild(el('button', { text: 'View', onclick: () => window.open(projectUrl(p.slug), '_blank') }));
  actions.appendChild(el('button', {
    text: 'Copy link',
    onclick: async (e) => {
      const ok = await copyToClipboard(projectUrl(p.slug));
      const original = e.target.textContent;
      e.target.textContent = ok ? 'Copied!' : 'Copy failed';
      setTimeout(() => { e.target.textContent = original; }, 1500);
    },
  }));
  actions.appendChild(el('button', { text: 'Settings', onclick: () => openSettingsModal(p) }));
  actions.appendChild(el('button', { text: 'Rename', onclick: () => openRenameModal(p) }));
  actions.appendChild(el('button', {
    text: 'Redo thumbnail',
    onclick: async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Rendering...';
      try {
        await api(`/api/projects/${encodeURIComponent(p.slug)}/thumbnail`, { method: 'POST' });
      } finally {
        loadProjects();
      }
    },
  }));
  actions.appendChild(el('button', {
    class: 'danger',
    text: 'Delete',
    onclick: () => openConfirm(
      'Delete project?',
      `"${p.title}" will be moved to Trash. You can restore it later or permanently remove it there.`,
      async () => {
        await api(`/api/projects/${encodeURIComponent(p.slug)}`, { method: 'DELETE' });
        loadProjects();
        loadDiskUsage();
      }
    ),
  }));
  card.appendChild(actions);
  return card;
}

document.getElementById('searchInput').addEventListener('input', renderProjects);

document.getElementById('backfillThumbsBtn').addEventListener('click', async (e) => {
  e.target.disabled = true;
  const original = e.target.textContent;
  try {
    const { queued } = await api('/api/thumbnails/backfill', { method: 'POST' });
    e.target.textContent = queued ? `Rendering ${queued}...` : 'Nothing to do';
    if (queued) pollUntilThumbnailsSettled();
  } finally {
    setTimeout(() => { e.target.disabled = false; e.target.textContent = original; }, 3000);
  }
});

let pollHandle = null;
function pollUntilThumbnailsSettled() {
  if (pollHandle) return;
  let ticks = 0;
  pollHandle = setInterval(async () => {
    ticks += 1;
    await loadProjects();
    const stillMissing = allProjects.some((p) => !p.hasThumbnail);
    if (!stillMissing || ticks > 40) {
      clearInterval(pollHandle);
      pollHandle = null;
    }
  }, 5000);
}

// ---- trash tab ----
async function loadTrash() {
  const items = await api('/api/trash');
  const grid = document.getElementById('trashGrid');
  grid.innerHTML = '';
  if (!items.length) {
    grid.appendChild(el('div', { class: 'empty', text: 'Trash is empty.' }));
    return;
  }
  items.forEach((t) => {
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', { text: t.originalSlug }));
    card.appendChild(el('div', {
      class: 'meta',
      html: `${formatBytes(t.sizeBytes)} on disk<br>deleted ${formatDate(t.deletedAt)}`,
    }));
    const actions = el('div', { class: 'actions' });
    actions.appendChild(el('button', {
      text: 'Restore',
      onclick: async () => { await api(`/api/trash/${encodeURIComponent(t.trashId)}/restore`, { method: 'POST' }); loadTrash(); loadProjects(); },
    }));
    actions.appendChild(el('button', {
      class: 'danger',
      text: 'Delete permanently',
      onclick: () => openConfirm(
        'Permanently delete?',
        `This frees ${formatBytes(t.sizeBytes)} of disk space and cannot be undone.`,
        async () => { await api(`/api/trash/${encodeURIComponent(t.trashId)}`, { method: 'DELETE' }); loadTrash(); loadDiskUsage(); }
      ),
    }));
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

// ---- jobs tab ----
async function loadJobs() {
  const jobs = await api('/api/jobs');
  const grid = document.getElementById('jobsList');
  grid.innerHTML = '';
  if (!jobs.length) {
    grid.appendChild(el('div', { class: 'empty', text: 'No conversions yet.' }));
    return;
  }
  jobs.forEach((j) => {
    const card = el('div', { class: 'card' });
    card.appendChild(el('h3', { text: j.title }));
    card.appendChild(el('span', { class: `badge ${j.status}`, text: j.status }));
    card.appendChild(el('div', { class: 'meta', html: `started ${formatDate(j.createdAt)}${j.error ? `<br>${j.error}` : ''}` }));
    const actions = el('div', { class: 'actions' });
    actions.appendChild(el('button', { text: 'View log', onclick: () => showConversionModal(j.id, j.title) }));
    card.appendChild(actions);
    grid.appendChild(card);
  });
}

// ---- settings modal ----
const settingsOverlay = document.getElementById('settingsOverlay');
let settingsSlug = null;

async function openSettingsModal(p) {
  document.getElementById('settingsError').textContent = '';
  const full = await api(`/api/projects/${encodeURIComponent(p.slug)}`);
  settingsSlug = p.slug;
  const s = full.settings;
  document.getElementById('settingsProjectTitle').textContent = p.title;
  document.getElementById('s_title').value = s.title || p.slug;
  document.getElementById('s_pointBudget').value = (s.pointBudget || 4000000) / 1_000_000;
  document.getElementById('s_fov').value = s.fov ?? 60;
  document.getElementById('s_pointSize').value = s.pointSize ?? 1;
  document.getElementById('s_pointSizeType').value = s.pointSizeType || 'ADAPTIVE';
  document.getElementById('s_shape').value = s.shape || 'SQUARE';
  document.getElementById('s_background').value = s.background || 'gradient';
  document.getElementById('s_edlEnabled').checked = !!s.edlEnabled;
  document.getElementById('s_useHQ').checked = !!s.useHQ;
  document.getElementById('s_showSidebar').checked = !!s.showSidebar;
  document.getElementById('s_boundingBox').checked = !!s.boundingBox;
  const menus = s.menus || {};
  document.getElementById('m_appearance').checked = !!menus.appearance;
  document.getElementById('m_tools').checked = !!menus.tools;
  document.getElementById('m_clipping').checked = !!menus.clipping;
  document.getElementById('m_measurements').checked = !!menus.measurements;
  settingsOverlay.hidden = false;
}

document.getElementById('cancelSettingsBtn').addEventListener('click', () => { settingsOverlay.hidden = true; });
document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  try {
    const body = {
      title: document.getElementById('s_title').value.trim(),
      pointBudget: Math.round(parseFloat(document.getElementById('s_pointBudget').value) * 1_000_000),
      fov: parseInt(document.getElementById('s_fov').value, 10),
      pointSize: parseFloat(document.getElementById('s_pointSize').value),
      pointSizeType: document.getElementById('s_pointSizeType').value,
      shape: document.getElementById('s_shape').value,
      background: document.getElementById('s_background').value,
      edlEnabled: document.getElementById('s_edlEnabled').checked,
      useHQ: document.getElementById('s_useHQ').checked,
      showSidebar: document.getElementById('s_showSidebar').checked,
      boundingBox: document.getElementById('s_boundingBox').checked,
      menus: {
        appearance: document.getElementById('m_appearance').checked,
        tools: document.getElementById('m_tools').checked,
        clipping: document.getElementById('m_clipping').checked,
        measurements: document.getElementById('m_measurements').checked,
      },
    };
    await api(`/api/projects/${encodeURIComponent(settingsSlug)}/settings`, { method: 'PUT', body: JSON.stringify(body) });
    settingsOverlay.hidden = true;
    loadProjects();
  } catch (err) {
    document.getElementById('settingsError').textContent = err.message;
  }
});

// ---- rename modal ----
const renameOverlay = document.getElementById('renameOverlay');
let renameSlug = null;
function openRenameModal(p) {
  document.getElementById('renameError').textContent = '';
  document.getElementById('renameInput').value = p.title;
  renameSlug = p.slug;
  renameOverlay.hidden = false;
}
document.getElementById('cancelRenameBtn').addEventListener('click', () => { renameOverlay.hidden = true; });
document.getElementById('confirmRenameBtn').addEventListener('click', async () => {
  try {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName) throw new Error('Name cannot be empty');
    await api(`/api/projects/${encodeURIComponent(renameSlug)}/rename`, { method: 'POST', body: JSON.stringify({ newName }) });
    renameOverlay.hidden = true;
    loadProjects();
  } catch (err) {
    document.getElementById('renameError').textContent = err.message;
  }
});

// ---- upload / convert modal ----
const uploadOverlay = document.getElementById('uploadOverlay');
const uploadForm = document.getElementById('uploadForm');
const convertPanel = document.getElementById('convertPanel');

document.getElementById('newProjectBtn').addEventListener('click', () => {
  document.getElementById('uploadError').textContent = '';
  document.getElementById('projectName').value = '';
  document.getElementById('lasFiles').value = '';
  document.getElementById('fileSummary').textContent = '';
  document.getElementById('brotliCheck').checked = true;
  document.getElementById('uploadProgressWrap').hidden = true;
  document.getElementById('uploadProgressBar').style.width = '0%';
  uploadForm.hidden = false;
  convertPanel.hidden = true;
  uploadOverlay.hidden = false;
});
document.getElementById('cancelUploadBtn').addEventListener('click', () => { uploadOverlay.hidden = true; });
document.getElementById('closeConvertBtn').addEventListener('click', () => { uploadOverlay.hidden = true; loadProjects(); });

document.getElementById('lasFiles').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  const total = files.reduce((sum, f) => sum + f.size, 0);
  document.getElementById('fileSummary').textContent = files.length
    ? `${files.length} file(s), ${formatBytes(total)} total`
    : '';
});

document.getElementById('startUploadBtn').addEventListener('click', () => {
  const errorEl = document.getElementById('uploadError');
  errorEl.textContent = '';
  const name = document.getElementById('projectName').value.trim();
  const files = document.getElementById('lasFiles').files;
  if (!name) return (errorEl.textContent = 'Project name is required');
  if (!files.length) return (errorEl.textContent = 'Select at least one .las/.laz file');

  const fd = new FormData();
  fd.append('name', name);
  fd.append('encoding', document.getElementById('brotliCheck').checked ? 'BROTLI' : 'UNCOMPRESSED');
  Array.from(files).forEach((f) => fd.append('files', f));

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  document.getElementById('uploadProgressWrap').hidden = false;
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      document.getElementById('uploadProgressBar').style.width = `${(e.loaded / e.total) * 100}%`;
    }
  });
  xhr.onload = () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
    if (xhr.status === 401) { window.location.href = '/login.html'; return; }
    if (xhr.status >= 400) {
      errorEl.textContent = data.error || 'Upload failed';
      return;
    }
    uploadForm.hidden = true;
    convertPanel.hidden = false;
    document.getElementById('convertName').textContent = name;
    startConversionStream(data.jobId);
  };
  xhr.onerror = () => { errorEl.textContent = 'Network error during upload'; };
  xhr.send(fd);
});

function startConversionStream(jobId) {
  document.getElementById('convertName').textContent = document.getElementById('convertName').textContent || jobId;
  showConversionModal(jobId, document.getElementById('convertName').textContent, true);
}

function showConversionModal(jobId, title, alreadyOpen) {
  if (!alreadyOpen) {
    uploadForm.hidden = true;
    convertPanel.hidden = false;
    uploadOverlay.hidden = false;
    document.getElementById('convertName').textContent = title;
  }
  const logEl = document.getElementById('convertLog');
  const badgeEl = document.getElementById('convertStatusBadge');
  logEl.textContent = '';
  badgeEl.textContent = '';
  badgeEl.className = 'badge';

  const es = new EventSource(`/api/jobs/${jobId}/stream`);
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.line !== undefined) {
      logEl.textContent += data.line + '\n';
      logEl.scrollTop = logEl.scrollHeight;
    }
  };
  es.addEventListener('status', (e) => {
    const data = JSON.parse(e.data);
    badgeEl.textContent = data.status;
    badgeEl.className = `badge ${data.status}`;
    if (data.status === 'done' || data.status === 'error') {
      es.close();
      loadProjects();
      loadDiskUsage();
      if (data.status === 'done') pollUntilThumbnailsSettled();
    }
  });
  es.onerror = () => { /* connection closed after job ends; ignore */ };
}

// ---- branding ----
const brandingOverlay = document.getElementById('brandingOverlay');
const B_FIELDS = ['name', 'tagline', 'url', 'guideUrl', 'lang', 'accent'];
let branding = null;

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  return '#' + [16, 8, 0].map((s) => (`0${Math.round(((n >> s) & 255) * (1 - amount)).toString(16)}`).slice(-2)).join('');
}

// Header, tab title, favicon and accent of this panel follow the branding too.
function applyBranding(b) {
  branding = b;
  const name = b.name || 'opcviewer';
  document.getElementById('brandName').textContent = name;
  document.title = b.name ? `${b.name} · opcviewer` : 'opcviewer';
  const stamp = Date.now();
  document.getElementById('brandLogo').src = b.logo ? `/api/branding/image/logo?v=${stamp}` : '/logo.svg';
  const fav = document.getElementById('faviconLink');
  const icon = b.icons && b.icons[0];
  if (icon && icon.href.startsWith('opcviewer/')) {
    fav.href = `/api/branding/image/favicon?v=${stamp}`;
    fav.type = icon.type;
  } else {
    fav.href = '/logo.svg';
    fav.type = 'image/svg+xml';
  }
  const root = document.documentElement.style;
  if (b.accent && b.accent !== '#4c8dff') {
    root.setProperty('--accent', b.accent);
    root.setProperty('--accent-hover', darken(b.accent, 0.1));
  } else {
    root.removeProperty('--accent');
    root.removeProperty('--accent-hover');
  }
}

function fillBrandingForm(b) {
  for (const f of B_FIELDS) document.getElementById(`b_${f}`).value = b[f] || '';
  if (!b.accent) document.getElementById('b_accent').value = '#4c8dff';
  showBrandingImages(b);
}

// Only the image previews: an upload must not wipe fields typed but not saved yet.
function showBrandingImages(b) {
  const stamp = Date.now();
  const showImg = (kind, on) => {
    const img = document.getElementById(`b_${kind}Preview`);
    img.hidden = !on;
    if (on) img.src = `/api/branding/image/${kind}?v=${stamp}`;
    document.getElementById(`b_${kind}None`).hidden = on;
    document.getElementById(`b_${kind}Remove`).disabled = !on;
  };
  showImg('logo', !!b.logo);
  showImg('favicon', !!(b.icons && b.icons[0] && b.icons[0].href.startsWith('opcviewer/')));
}

async function loadBranding() {
  try { applyBranding(await api('/api/branding')); } catch { /* keeps plain opcviewer */ }
}

document.getElementById('brandingBtn').addEventListener('click', async () => {
  document.getElementById('brandingError').textContent = '';
  try {
    fillBrandingForm(await api('/api/branding'));
    brandingOverlay.hidden = false;
  } catch (err) {
    alert(err.message);
  }
});
document.getElementById('cancelBrandingBtn').addEventListener('click', () => { brandingOverlay.hidden = true; });

document.getElementById('saveBrandingBtn').addEventListener('click', async () => {
  const body = {};
  for (const f of B_FIELDS) body[f] = document.getElementById(`b_${f}`).value;
  try {
    applyBranding(await api('/api/branding', { method: 'PUT', body: JSON.stringify(body) }));
    brandingOverlay.hidden = true;
  } catch (err) {
    document.getElementById('brandingError').textContent = err.message;
  }
});

for (const kind of ['logo', 'favicon']) {
  const input = document.getElementById(`b_${kind}File`);
  document.getElementById(`b_${kind}Upload`).addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const errEl = document.getElementById('brandingError');
    errEl.textContent = '';
    try {
      // Not api(): FormData needs the browser to set its own Content-Type.
      const res = await fetch(`/api/branding/${kind}`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      applyBranding(data);
      showBrandingImages(data);
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
  document.getElementById(`b_${kind}Remove`).addEventListener('click', async () => {
    try {
      const data = await api(`/api/branding/${kind}`, { method: 'DELETE' });
      applyBranding(data);
      showBrandingImages(data);
    } catch (err) {
      document.getElementById('brandingError').textContent = err.message;
    }
  });
}

// ---- init ----
loadBranding();
loadProjects();
