// Per-project view counts and load timings, read from Apache's access log.
//
// - A "view" is a successful GET of a project's page (/<slug>/ or /<slug>/index.html).
// - A "load report" is the tiny image request potree_libs/opcviewer-ui.js makes once a
//   visit has finished loading (/potree_libs/opcviewer-stat.gif?s=<slug>&f=..&l=..&b=..&d=..&h=..).
//
// Apache keeps only 14 days of logs, so totals are accumulated in data/stats.json. The log
// is read incrementally (inode + byte offset), with a one-off backfill of the rotated files.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { DATA_DIR, LIBS_DIR_NAME, ACCESS_LOG } = require('./config');

const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const MAX_LOADS = 60;        // load reports kept per project
const KEEP_DAYS = 400;       // per-day view counts kept this long (the total is kept forever)
const MIN_SCAN_GAP_MS = 20000;

const LINE_RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "[^"]*" "([^"]*)"/;
const VIEW_RE = /^\/([^/?#]+)\/(?:index\.html)?(?:\?.*)?$/;
const STAT_RE = /^\/potree_libs\/(?:zm|opcviewer)-stat\.gif\?(.*)$/; // zm- = pages before opcviewer
// Crawlers, link-preview fetchers and scripts, not people. ("compatible;" is only sent by bots now.)
const NOT_A_VISITOR = /bot|crawl|spider|slurp|curl|wget|python|headless|monitor|preview|scan|indexer|externalhit|smartsign|compatible;/i;
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

let state = null;       // { log: {ino, offset}, backfilled, projects: { slug: {total, days, last, loads[]} } }
let scanning = null;
let lastScan = 0;

function emptyState() {
  return { log: { ino: 0, offset: 0 }, backfilled: false, projects: {} };
}

async function load() {
  if (state) return state;
  try {
    state = { ...emptyState(), ...JSON.parse(await fsp.readFile(STATS_FILE, 'utf8')) };
  } catch {
    state = emptyState();
  }
  return state;
}

async function save() {
  const tmp = STATS_FILE + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(state));
  await fsp.rename(tmp, STATS_FILE);
}

// "13/Nov/2026:17:01:17 +0000" -> Date
function parseLogTime(s) {
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const utc = Date.UTC(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +m[6]);
  const off = (m[7] === '-' ? -1 : 1) * (+m[8] * 60 + +m[9]) * 60000;
  return new Date(utc - off);
}

function project(slug) {
  if (!state.projects[slug]) state.projects[slug] = { total: 0, days: {}, last: null, loads: [] };
  return state.projects[slug];
}

function num(v, min, max) {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function handleLine(line) {
  const m = LINE_RE.exec(line);
  if (!m) return;
  const [, ip, time, method, url, status, agent] = m;
  if (method !== 'GET' || (status !== '200' && status !== '304')) return;
  if (ip === '127.0.0.1' || ip === '::1') return; // thumbnail renders and tests on this box
  if (NOT_A_VISITOR.test(agent)) return;
  const when = parseLogTime(time);
  if (!when) return;

  let v = VIEW_RE.exec(url);
  if (v) {
    let slug;
    try { slug = decodeURIComponent(v[1]); } catch { return; }
    if (slug === LIBS_DIR_NAME || slug.startsWith('.')) return;
    const p = project(slug);
    const day = when.toISOString().slice(0, 10);
    p.total += 1;
    p.days[day] = (p.days[day] || 0) + 1;
    if (!p.last || when.toISOString() > p.last) p.last = when.toISOString();
    return;
  }

  v = STAT_RE.exec(url);
  if (v) {
    const q = new URLSearchParams(v[1]);
    const slug = q.get('s');
    const first = num(q.get('f'), 1, 600000);
    const full = num(q.get('l'), 1, 600000);
    if (!slug || slug.includes('/') || slug.includes('..') || first === null || full === null) return;
    const bytes = num(q.get('b'), 0, 1e11) || 0;
    const dl = num(q.get('d'), 0, 600000) || 0;
    const p = project(slug);
    p.loads.push({
      t: when.toISOString(),
      first: Math.round(first),
      full: Math.round(Math.max(full, first)),
      bytes: Math.round(bytes),
      dl: Math.round(dl),
      pub: q.get('h') !== 'lan',
    });
    if (p.loads.length > MAX_LOADS) p.loads.splice(0, p.loads.length - MAX_LOADS);
  }
}

async function readLines(stream) {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) handleLine(line);
}

async function readWhole(file) {
  const raw = fs.createReadStream(file);
  await readLines(file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw);
}

// Reads complete lines from `offset` to the end of the file; returns the new offset.
async function readFrom(file, offset, size) {
  if (size <= offset) return offset;
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(size - offset);
    await fh.read(buf, 0, buf.length, offset);
    const end = buf.lastIndexOf(0x0a); // only up to the last complete line
    if (end < 0) return offset;
    for (const line of buf.subarray(0, end).toString('utf8').split('\n')) handleLine(line);
    return offset + end + 1;
  } finally {
    await fh.close();
  }
}

function prune() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  for (const p of Object.values(state.projects)) {
    for (const day of Object.keys(p.days)) if (day < cutoff) delete p.days[day];
  }
}

async function doScan() {
  await load();
  let cur;
  try {
    cur = await fsp.stat(ACCESS_LOG);
  } catch {
    return; // no log / no permission: stats simply stay empty
  }
  const dir = path.dirname(ACCESS_LOG);
  const base = path.basename(ACCESS_LOG);

  if (!state.backfilled) {
    // First run: everything Apache still has, oldest first.
    state.projects = {};
    const rotated = (await fsp.readdir(dir))
      .map((f) => ({ f, n: (new RegExp('^' + base.replace(/\./g, '\\.') + '\\.(\\d+)(\\.gz)?$').exec(f) || [])[1] }))
      .filter((x) => x.n !== undefined)
      .sort((a, b) => Number(b.n) - Number(a.n));
    for (const { f } of rotated) {
      try { await readWhole(path.join(dir, f)); } catch { /* unreadable file: skip */ }
    }
    state.log = { ino: cur.ino, offset: await readFrom(ACCESS_LOG, 0, cur.size) };
    state.backfilled = true;
  } else if (state.log.ino !== cur.ino || cur.size < state.log.offset) {
    // Rotated since the last scan: finish the old file (now access.log.1), then start the new one.
    try {
      const old = path.join(dir, base + '.1');
      const st = await fsp.stat(old);
      if (st.ino === state.log.ino) await readFrom(old, state.log.offset, st.size);
    } catch { /* gone already */ }
    state.log = { ino: cur.ino, offset: await readFrom(ACCESS_LOG, 0, cur.size) };
  } else {
    state.log.offset = await readFrom(ACCESS_LOG, state.log.offset, cur.size);
  }
  prune();
  await save();
}

function scan(force = false) {
  if (scanning) return scanning;
  if (!force && Date.now() - lastScan < MIN_SCAN_GAP_MS) return Promise.resolve();
  scanning = doScan()
    .catch((err) => console.error('stats scan failed:', err.message))
    .finally(() => { lastScan = Date.now(); scanning = null; });
  return scanning;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function summarizeLoads(loads) {
  if (!loads.length) return null;
  // Speed only means something when a visit pulled a real amount of data.
  const speeds = loads.filter((l) => l.bytes >= 2e6 && l.dl >= 300).map((l) => l.bytes / 1e6 / (l.dl / 1000));
  return {
    count: loads.length,
    firstMs: Math.round(median(loads.map((l) => l.first))),
    fullMs: Math.round(median(loads.map((l) => l.full))),
    mbPerSec: speeds.length ? Math.round(median(speeds) * 10) / 10 : null,
    last: loads[loads.length - 1].t,
  };
}

// Summary for one project, shaped for the admin UI.
function summary(slug) {
  const p = state && state.projects[slug];
  if (!p) return { views: 0, views30: 0, lastView: null, publicLoads: null, lanLoads: null };
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  let views30 = 0;
  for (const [day, n] of Object.entries(p.days)) if (day >= cutoff) views30 += n;
  return {
    views: p.total,
    views30,
    lastView: p.last,
    publicLoads: summarizeLoads(p.loads.filter((l) => l.pub)),
    lanLoads: summarizeLoads(p.loads.filter((l) => !l.pub)),
  };
}

async function renameSlug(oldSlug, newSlug) {
  await load();
  if (!state.projects[oldSlug] || oldSlug === newSlug) return;
  state.projects[newSlug] = state.projects[oldSlug];
  delete state.projects[oldSlug];
  await save();
}

module.exports = { scan, summary, renameSlug, _handleLine: handleLine, _load: load };
