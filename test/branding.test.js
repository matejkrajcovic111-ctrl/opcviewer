const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-brand-'));
process.env.OPCV_DATA_DIR = path.join(tmp, 'data');
process.env.OPCV_WWW_ROOT = path.join(tmp, 'www');
fs.mkdirSync(process.env.OPCV_DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(process.env.OPCV_WWW_ROOT, 'potree_libs'), { recursive: true });
const branding = require('../lib/branding');

const published = () => JSON.parse(fs.readFileSync(path.join(tmp, 'www', 'potree_libs', 'opcviewer', 'branding.json'), 'utf8'));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

test('with nothing saved, branding is the plain default', () => {
  assert.deepStrictEqual(branding.load(), branding.DEFAULTS);
  assert.deepStrictEqual(branding.DEFAULTS, { name: '', tagline: '', url: '', guideUrl: '', lang: 'en', accent: '#4c8dff', logo: null, icons: [] });
});

test('valid input is trimmed and accepted', () => {
  const c = branding.validate({ name: '  © Firma  ', url: 'https://firma.sk/', lang: 'sk', accent: '#AABBCC' });
  assert.strictEqual(c.name, '© Firma');
  assert.strictEqual(c.accent, '#aabbcc');
  assert.strictEqual(c.lang, 'sk');
});

test('links must be http or https', () => {
  assert.throws(() => branding.validate({ url: 'javascript:alert(1)' }), /link/i);
  assert.throws(() => branding.validate({ guideUrl: 'ftp://x' }), /link/i);
});

test('colour, language and text length are checked', () => {
  assert.throws(() => branding.validate({ accent: 'red' }), /colour/i);
  assert.throws(() => branding.validate({ lang: 'de' }), /language/i);
  assert.throws(() => branding.validate({ name: 'x'.repeat(121) }), /120/);
});

test('icons may only point at site paths, never outside', () => {
  assert.doesNotThrow(() => branding.validate({ icons: [{ rel: 'icon', href: '/favicon.ico', type: 'image/x-icon', sizes: '48x48' }] }));
  assert.throws(() => branding.validate({ icons: [{ rel: 'icon', href: 'https://evil/x.ico' }] }), /icon/i);
  assert.throws(() => branding.validate({ icons: [{ rel: 'icon', href: 'opcviewer/../../x' }] }), /icon/i);
});

test('HTML in the name is kept as text (the viewer never renders it as HTML)', () => {
  assert.strictEqual(branding.validate({ name: '<script>x</script>' }).name, '<script>x</script>');
});

test('saving publishes branding.json for the viewer pages', () => {
  branding.save(branding.validate({ name: 'Firma', lang: 'sk' }));
  assert.strictEqual(branding.load().name, 'Firma');
  const p = published();
  assert.strictEqual(p.name, 'Firma');
  assert.strictEqual(p.lang, 'sk');
});

test('a PNG logo is stored next to branding.json', () => {
  const href = branding.storeImage('logo', PNG, 'my logo.PNG');
  assert.strictEqual(href, 'opcviewer/logo.png');
  assert.ok(fs.existsSync(path.join(tmp, 'www', 'potree_libs', 'opcviewer', 'logo.png')));
  assert.strictEqual(branding.load().logo, 'opcviewer/logo.png');
  assert.strictEqual(published().logo, 'opcviewer/logo.png');
});

test('a favicon replaces the icon list', () => {
  branding.storeImage('favicon', PNG, 'f.png');
  assert.deepStrictEqual(branding.load().icons, [{ rel: 'icon', href: 'opcviewer/favicon.png', type: 'image/png', sizes: '' }]);
});

test('images over 1 MB are rejected', () => {
  assert.throws(() => branding.storeImage('logo', Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]), 'big.png'), /1 MB/);
});

test('a file whose content does not match its extension is rejected', () => {
  assert.throws(() => branding.storeImage('logo', JPEG, 'fake.png'), /not a/i);
  assert.throws(() => branding.storeImage('logo', PNG, 'tool.exe'), /type/i);
});

test('an SVG with a script is rejected', () => {
  assert.throws(() => branding.storeImage('logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'a.svg'), /script/i);
  assert.throws(() => branding.storeImage('logo', Buffer.from('<svg onload="x()"></svg>'), 'a.svg'), /script/i);
  assert.strictEqual(branding.storeImage('logo', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'), 'a.svg'), 'opcviewer/logo.svg');
});

test('removing the logo clears it and deletes the file', () => {
  branding.removeImage('logo');
  assert.strictEqual(branding.load().logo, null);
  assert.ok(!fs.existsSync(path.join(tmp, 'www', 'potree_libs', 'opcviewer', 'logo.svg')));
});
