// The viewer turns the server's compact highlight grid back into what its green/red
// overlay draws from (window.zmDecodeHighlight in opcviewer-ui.js).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadViewerScript } = require('./helpers/viewer-sandbox');
const { computeVolume, decodeHighlightForTest } = require('../lib/volume');

const UI = path.join(__dirname, '..', 'viewer', 'opcviewer-ui.js');
const FIX = path.join(__dirname, 'fixtures', 'octree-default', 'metadata.json');
const OUTLINE = [[499994, 1199994, 200], [500006, 1199994, 200.4], [500006, 1200006, 200.4], [499994, 1200006, 200]];

test('the viewer decodes the server highlight into heights, counted cells and the base plane', () => {
  const r = computeVolume(FIX, OUTLINE);
  const decode = loadViewerScript(UI, { globals: { atob } }).window.zmDecodeHighlight;
  assert.strictEqual(typeof decode, 'function');
  const c = decode(r.highlight, r.plane);
  const ref = decodeHighlightForTest(r.highlight);
  assert.strictEqual(c.nx, r.highlight.nx);
  assert.strictEqual(c.ny, r.highlight.ny);
  assert.strictEqual(c.minX, r.highlight.minX);
  assert.strictEqual(c.minY, r.highlight.minY);
  assert.strictEqual(c.h.length, ref.heights.length);
  let diff = 0, maskDiff = 0;
  for (let i = 0; i < ref.heights.length; i++) {
    if (c.h[i] !== ref.heights[i]) diff++;
    if (c.has[i] !== ref.mask[i] || c.inside[i] !== ref.mask[i]) maskDiff++;
  }
  assert.strictEqual(diff, 0, `${diff} heights differ`);
  assert.strictEqual(maskDiff, 0, `${maskDiff} mask cells differ`);
  for (const [x, y, z] of OUTLINE.slice(0, 3)) assert.ok(Math.abs(c.baseZ(x, y) - z) < 0.05, `base at ${x},${y}`);
});

test('the project folder is taken from the page address', () => {
  const folder = loadViewerScript(UI).window.zmProjectFolder;
  assert.strictEqual(folder('/Most_Hatne/'), 'Most_Hatne');
  assert.strictEqual(folder('/Most_Hatne/index.html'), 'Most_Hatne');
  assert.strictEqual(folder('/sub/dir/Pezinok%20vila/'), 'Pezinok vila');
  assert.strictEqual(folder('/'), '');
});
