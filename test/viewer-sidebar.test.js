// The sidebar header shows opcviewer and its version; Potree's language list, About panel,
// "Box" and "Lock view" are taken out; the navigation cube is drawn below the Bounding Box.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { makeDocument } = require('./helpers/mini-dom');
const { loadViewerScript } = require('./helpers/viewer-sandbox');

const UI = path.join(__dirname, '..', 'viewer', 'opcviewer-ui.js');
const ui = () => loadViewerScript(UI).window;

// The parts of Potree 1.8's sidebar.html this touches, in the same nesting.
function potreeSidebar() {
  const doc = makeDocument();
  const el = (parent, tag, id) => { const e = doc.createElement(tag); if (id) e.id = id; parent.appendChild(e); return e; };
  const root = el(doc.body, 'div', 'sidebar_root');
  const header = el(root, 'div', 'sidebar_header');
  const brand = el(header, 'span', 'potree_branding');
  el(brand, 'a').textContent = 'potree.org';
  el(brand, 'span', 'potree_version_number').textContent = '1.8';
  const langs = el(header, 'div', 'potree_languages');
  el(langs, 'a').textContent = 'EN';
  const menu = el(root, 'div', 'potree_menu');
  el(menu, 'h3', 'menu_appearance');
  const app = el(menu, 'div');
  const list = el(app, 'ul');
  for (const id of ['show_bounding_box', 'set_freeze', 'keep_me']) {
    const input = el(el(el(list, 'li'), 'label'), 'input', id);
    input.checked = true;
  }
  el(menu, 'h3', 'menu_about');
  el(menu, 'div', 'about_body').textContent = 'Potree is a viewer…';
  return doc;
}

test('the sidebar header shows opcviewer and its version, linked to the release', () => {
  const doc = potreeSidebar();
  assert.strictEqual(ui().zmCleanSidebar(doc, { version: '2.1.0', sourceUrl: 'https://github.com/someone/opcviewer' }), true);
  const brand = doc.getElementById('potree_branding');
  assert.strictEqual(brand.textContent, 'opcviewer v2.1.0');
  const a = brand.children.find((c) => c.tagName === 'A');
  assert.strictEqual(a.href, 'https://github.com/someone/opcviewer/releases/tag/v2.1.0');
  assert.ok(!/potree/i.test(brand.innerHTML));
});

test('without a version the name links to the source alone', () => {
  const doc = potreeSidebar();
  ui().zmCleanSidebar(doc, { sourceUrl: 'https://github.com/someone/opcviewer' });
  const brand = doc.getElementById('potree_branding');
  assert.strictEqual(brand.textContent, 'opcviewer');
  assert.strictEqual(brand.children[0].href, 'https://github.com/someone/opcviewer');
});

test('language list, About, Box and Lock view are taken out of the sidebar', () => {
  const doc = potreeSidebar();
  const box = doc.getElementById('show_bounding_box'), freeze = doc.getElementById('set_freeze');
  ui().zmCleanSidebar(doc, {});
  for (const id of ['potree_languages', 'menu_about', 'about_body', 'show_bounding_box', 'set_freeze']) {
    assert.strictEqual(doc.getElementById(id), null, id);
  }
  assert.strictEqual(box.checked, false);
  assert.strictEqual(freeze.checked, false);
  assert.ok(doc.getElementById('keep_me'), 'other appearance options stay');
  assert.ok(doc.getElementById('menu_appearance'));
});

test('before Potree has built its sidebar nothing is touched', () => {
  const doc = makeDocument();
  assert.strictEqual(ui().zmCleanSidebar(doc, {}), false);
});

test('the navigation cube viewport moves down by the offset, everything else is left alone', () => {
  const g = ui().zmNavCubeViewport;
  const f = (...a) => Array.from(g(...a)); // the sandbox has its own Array
  // WebGL viewports count from the bottom: moving down lowers y.
  assert.deepStrictEqual(f(1450, 850, 150, 150, 1600, 1000, 60), [1450, 790, 150, 150]);
  assert.deepStrictEqual(f(0, 0, 1600, 1000, 1600, 1000, 60), [0, 0, 1600, 1000]);
  assert.deepStrictEqual(f(10, 20, 150, 150, 1600, 1000, 60), [10, 20, 150, 150]);
  assert.deepStrictEqual(f(1450, 850, 150, 150, 1600, 1000, 0), [1450, 850, 150, 150]);
});
