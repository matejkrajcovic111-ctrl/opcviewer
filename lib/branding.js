// Branding of the viewer pages and the admin panel: company name, links, logo, favicon,
// default language and accent colour. Stored in DATA_DIR/branding.json and published to
// <WWW_ROOT>/potree_libs/opcviewer/branding.json, which the static viewer pages read when
// they load (viewer/opcviewer-branding.js). Nothing set = plain opcviewer, no badge.
const fs = require('fs');
const path = require('path');
const { DATA_DIR, WWW_ROOT, LIBS_DIR_NAME } = require('./config');

const FILE = path.join(DATA_DIR, 'branding.json');
const PUBLIC_DIR = path.join(WWW_ROOT, LIBS_DIR_NAME, 'opcviewer');
const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_TEXT = 120;

const DEFAULTS = Object.freeze({ name: '', tagline: '', url: '', guideUrl: '', lang: 'en', accent: '#4c8dff', logo: null, icons: [] });

const IMAGE_TYPES = {
  '.png': { mime: 'image/png', ok: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  '.jpg': { mime: 'image/jpeg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  '.jpeg': { mime: 'image/jpeg', ok: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  '.webp': { mime: 'image/webp', ok: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  '.ico': { mime: 'image/x-icon', ok: (b) => b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0 },
  '.svg': { mime: 'image/svg+xml', ok: (b) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(b.toString('utf8')) },
};

function text(v, label) {
  const s = String(v == null ? '' : v).trim();
  if (s.length > MAX_TEXT) throw new Error(`${label} can be at most ${MAX_TEXT} characters`);
  return s;
}

function link(v, label) {
  const s = String(v == null ? '' : v).trim();
  if (s && (!/^https?:\/\/[^\s<>"]+$/i.test(s) || s.length > 500)) throw new Error(`${label}: enter a link starting with http:// or https://`);
  return s;
}

// A site path ("/favicon.ico") or a file published next to branding.json ("opcviewer/x.png").
function sitePath(v) {
  return typeof v === 'string' && !v.includes('..') && /^(\/[\w\-./]+|opcviewer\/[\w\-.]+)$/.test(v);
}

function validate(input) {
  const i = input || {};
  const out = {
    name: text(i.name, 'Company name'),
    tagline: text(i.tagline, 'Second line'),
    url: link(i.url, 'Website'),
    guideUrl: link(i.guideUrl, 'Guide link'),
    lang: i.lang === undefined ? DEFAULTS.lang : String(i.lang),
    accent: i.accent === undefined ? DEFAULTS.accent : String(i.accent).trim().toLowerCase(),
    logo: i.logo == null || i.logo === '' ? null : i.logo,
    icons: i.icons === undefined ? [] : i.icons,
  };
  if (out.lang !== 'sk' && out.lang !== 'en') throw new Error('Default language must be SK or EN');
  if (!/^#[0-9a-f]{6}$/.test(out.accent)) throw new Error('Accent colour must look like #4c8dff');
  if (out.logo !== null && !sitePath(out.logo)) throw new Error('Invalid logo path');
  if (!Array.isArray(out.icons) || out.icons.length > 5) throw new Error('Invalid icon list');
  out.icons = out.icons.map((ic) => {
    if (!ic || !['icon', 'apple-touch-icon'].includes(ic.rel) || !sitePath(ic.href)) throw new Error('Invalid icon entry');
    return { rel: ic.rel, href: ic.href, type: text(ic.type, 'Icon type'), sizes: text(ic.sizes, 'Icon sizes') };
  });
  return out;
}

function load() {
  try {
    return { ...DEFAULTS, ...validate(JSON.parse(fs.readFileSync(FILE, 'utf8'))) };
  } catch {
    return { ...DEFAULTS, icons: [] };
  }
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', data);
  fs.renameSync(file + '.tmp', file);
}

function publish() {
  writeAtomic(path.join(PUBLIC_DIR, 'branding.json'), JSON.stringify(load(), null, 2) + '\n');
}

function save(clean) {
  writeAtomic(FILE, JSON.stringify(clean, null, 2) + '\n');
  publish();
  return load();
}

function removeFiles(kind) {
  for (const ext of Object.keys(IMAGE_TYPES)) fs.rmSync(path.join(PUBLIC_DIR, kind + ext), { force: true });
}

// Stores an uploaded logo or favicon and points the branding at it. Returns its href.
function storeImage(kind, buffer, originalName) {
  if (kind !== 'logo' && kind !== 'favicon') throw new Error('Unknown image');
  const ext = path.extname(String(originalName || '')).toLowerCase();
  const type = IMAGE_TYPES[ext];
  if (!type) throw new Error('Image type must be PNG, JPEG, WebP, SVG or ICO');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Image must be at most 1 MB');
  if (!type.ok(buffer)) throw new Error(`The file is not a ${ext.slice(1).toUpperCase()} image`);
  if (ext === '.svg' && /<script|\son\w+\s*=|javascript:/i.test(buffer.toString('utf8'))) {
    throw new Error('SVG images with scripts are not allowed');
  }
  removeFiles(kind);
  const fileName = kind + (ext === '.jpeg' ? '.jpg' : ext);
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DIR, fileName), buffer);
  const href = `opcviewer/${fileName}`;
  const b = load();
  if (kind === 'logo') b.logo = href;
  else b.icons = [{ rel: 'icon', href, type: type.mime, sizes: '' }];
  save(b);
  return href;
}

function removeImage(kind) {
  if (kind !== 'logo' && kind !== 'favicon') throw new Error('Unknown image');
  removeFiles(kind);
  const b = load();
  if (kind === 'logo') b.logo = null;
  else b.icons = [];
  save(b);
}

// Absolute file path of a published branding image (for the admin panel, which runs on
// another port than Apache), or null.
function imageFile(href) {
  if (!href || !href.startsWith('opcviewer/') || !sitePath(href)) return null;
  return path.join(PUBLIC_DIR, href.slice('opcviewer/'.length));
}

module.exports = { DEFAULTS, validate, load, save, publish, storeImage, removeImage, imageFile, MAX_IMAGE_BYTES };
