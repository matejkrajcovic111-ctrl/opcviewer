const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { renderIndexHtml } = require('../lib/template');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

test('project page with default settings matches the golden page', () => {
  assert.strictEqual(renderIndexHtml({ slug: 'Demo', settings: { title: 'Demo' } }), fixture('page-default.html'));
});

test('project page with the Bounding Box on matches the golden page', () => {
  assert.strictEqual(renderIndexHtml({ slug: 'Demo', settings: { title: 'Demo', boundingBox: true } }), fixture('page-bbox.html'));
});

// Pages written before opcviewer used zameriamto-*.js names for the same scripts. Apart from
// those names a new page must be byte-identical to the old one (owner's live site).
const OLD_NAMES = (html) => html
  .replace('opcviewer-branding.js', 'zameriamto-branding.js')
  .replace('opcviewer-ui.js', 'zameriamto-ui.js')
  .replace('opcviewer-bbox.js', 'zameriamto-bbox.js');

test('a new page differs from the pre-opcviewer page only in the script names', () => {
  assert.strictEqual(OLD_NAMES(renderIndexHtml({ slug: 'Demo', settings: { title: 'Demo' } })), fixture('page-default.v1.html'));
  assert.strictEqual(OLD_NAMES(renderIndexHtml({ slug: 'Demo', settings: { title: 'Demo', boundingBox: true } })), fixture('page-bbox.v1.html'));
});

test('pages load the opcviewer scripts', () => {
  const html = renderIndexHtml({ slug: 'Demo', settings: { title: 'Demo', boundingBox: true } });
  for (const f of ['opcviewer-branding.js', 'opcviewer-ui.js', 'opcviewer-bbox.js']) assert.ok(html.includes(`../potree_libs/${f}`), f);
  assert.ok(!html.includes('zameriamto'));
});

test('a title with HTML is escaped in <title> and quoted in JavaScript', () => {
  const html = renderIndexHtml({ slug: 'X', settings: { title: '<b>"x"</b>' } });
  assert.match(html, /<title>&lt;b&gt;&quot;x&quot;&lt;\/b&gt;<\/title>/);
  assert.match(html, /viewer\.setDescription\("<b>\\"x\\"<\/b>"\)/);
});
