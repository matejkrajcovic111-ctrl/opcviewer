const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeDocument } = require('./helpers/mini-dom');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'opcviewer-branding.js'), 'utf8');

// Runs the branding script against a page whose branding.json fetch returns `json`
// (or fails when json is undefined). Resolves with the page once branding is applied.
async function page(json, stored = null) {
  const document = makeDocument();
  const window = {
    localStorage: { getItem: () => stored, setItem: () => {} },
    fetch: async (url) => {
      assert.strictEqual(url, '../potree_libs/opcviewer/branding.json');
      if (json === undefined) throw new Error('404');
      return { ok: true, json: async () => json };
    },
  };
  window.window = window;
  vm.runInNewContext(SCRIPT, { window, document, setTimeout, clearTimeout, console });
  const b = await window.opcvBrandingReady;
  return { document, window, b };
}

const ZAMERIAMTO = {
  name: '© zameriamto.sk', tagline: 'Matej Krajčovič, geodet', url: 'https://zameriamto.sk/',
  guideUrl: 'https://zameriamto.sk/navody/prehliadacmracnabodov/', lang: 'sk', accent: '#4c8dff', logo: null,
  icons: [
    { rel: 'icon', href: '/favicon.ico', type: 'image/x-icon', sizes: '48x48 32x32' },
    { rel: 'icon', href: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
  ],
};

test('without branding.json the page gets the defaults: no badge, English, blue accent', async () => {
  const { document, b } = await page(undefined);
  assert.strictEqual(document.getElementById('zm-branding'), null);
  assert.strictEqual(b.lang, 'en');
  assert.strictEqual(b.accent, '#4c8dff');
  assert.strictEqual(document.documentElement.style['--opcv-accent'], '#4c8dff');
});

test('the zameriamto.sk branding produces exactly the badge the live site had before opcviewer', async () => {
  const { document } = await page(ZAMERIAMTO);
  assert.strictEqual(document.getElementById('zm-branding').innerHTML,
    '<a class="zm-guide" href="https://zameriamto.sk/navody/prehliadacmracnabodov/" target="_blank" rel="noopener">Návod na použitie</a>' +
    '<a href="https://zameriamto.sk/" target="_blank" rel="noopener">© zameriamto.sk<span class="zm-name"> · Matej Krajčovič, geodet</span></a>');
});

test('the zameriamto.sk icons replace the page icons in the same order as before', async () => {
  const { document } = await page(ZAMERIAMTO);
  const links = document.head.children.filter((n) => n.tagName === 'LINK').map((l) => l.outerHTML);
  assert.deepStrictEqual(links, [
    '<link rel="icon" href="/favicon.ico" type="image/x-icon" sizes="48x48 32x32"></link>',
    '<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32"></link>',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" type="image/png" sizes="180x180"></link>',
  ]);
});

test('HTML in the company name is shown as text, never as markup', async () => {
  const { document } = await page({ name: '<img src=x onerror=alert(1)>' });
  assert.match(document.getElementById('zm-branding').innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('a logo alone shows a badge with the image, paths relative to potree_libs', async () => {
  const { document } = await page({ logo: 'opcviewer/logo.png', url: 'https://firma.sk/' });
  assert.match(document.getElementById('zm-branding').innerHTML, /<img class="zm-logo" src="..\/potree_libs\/opcviewer\/logo.png" alt="">/);
});

test('an uploaded favicon is linked relative to potree_libs', async () => {
  const { document } = await page({ icons: [{ rel: 'icon', href: 'opcviewer/favicon.png', type: 'image/png', sizes: '' }] });
  const l = document.head.children.find((n) => n.tagName === 'LINK');
  assert.strictEqual(l.href, '../potree_libs/opcviewer/favicon.png');
});

test('a custom accent colour is set for the viewer scripts', async () => {
  const { document, b } = await page({ accent: '#e4572e' });
  assert.strictEqual(b.accent, '#e4572e');
  assert.strictEqual(document.documentElement.style['--opcv-accent'], '#e4572e');
});

test('the guide button follows the visitor\'s stored language', async () => {
  const { document } = await page({ ...ZAMERIAMTO }, 'en');
  assert.strictEqual(document.querySelector ? document.getElementById('zm-branding').children[0].textContent : '', 'User guide');
});

const { loadViewerScript } = require('./helpers/viewer-sandbox');
const UI = path.join(__dirname, '..', 'viewer', 'opcviewer-ui.js');

async function uiLang(stored, brandingLang) {
  const b = brandingLang === undefined ? null : { lang: brandingLang };
  const ctx = loadViewerScript(UI, { window: {
    localStorage: { getItem: () => stored, setItem: () => {} },
    opcvBranding: { lang: 'en' },
    opcvBrandingReady: Promise.resolve(b ? { lang: b.lang } : { lang: 'en' }),
  } });
  await new Promise((r) => setImmediate(r));
  return ctx.window.zmLang.get();
}

test('the viewer language defaults to the branding language', async () => {
  assert.strictEqual(await uiLang(null, 'sk'), 'sk');
  assert.strictEqual(await uiLang(null, undefined), 'en');
});

test('a visitor\'s own language choice beats the branding default', async () => {
  assert.strictEqual(await uiLang('en', 'sk'), 'en');
});

test('viewer scripts use the accent colour variable, not a fixed blue', () => {
  for (const f of ['opcviewer-ui.js', 'opcviewer-bbox.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'viewer', f), 'utf8');
    assert.ok(!/[:\s]#4c8dff[;,}\s]/.test(src.replace(/var\(--opcv-accent,#4c8dff\)/g, '')), f + ' has a fixed #4c8dff');
  }
});

test('the default accent gives exactly the shades the live viewer used before', async () => {
  const { document } = await page({});
  const st = document.documentElement.style;
  assert.deepStrictEqual([st['--opcv-accent-hover'], st['--opcv-accent-light'], st['--opcv-accent-text']], ['#3a78e6', '#b7d1ff', '#9cc0ff']);
});
