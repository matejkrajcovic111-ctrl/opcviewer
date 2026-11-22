const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadViewerScript } = require('./helpers/viewer-sandbox');

const UI = path.join(__dirname, '..', 'viewer', 'opcviewer-ui.js');
const grid = (poly, cell) => loadViewerScript(UI).window.zmVolumeGrid(poly, cell);
const square = (h) => [{ x: -h, y: -h, z: 0 }, { x: h, y: -h, z: 0 }, { x: h, y: h, z: 0 }, { x: -h, y: h, z: 0 }];

// Samples a surface z = f(x, y) every 2 cm over the outline's square.
function sample(g, h, f) {
  for (let x = -h + 0.01; x < h; x += 0.02) for (let y = -h + 0.01; y < h; y += 0.02) g.add(x, y, f(x, y));
}

test('a cone r=5 m, h=3 m on flat ground has a volume of pi*r^2*h/3 within 0.5 %', () => {
  const g = grid(square(6), 0.05);
  sample(g, 6, (x, y) => Math.max(0, 3 * (1 - Math.hypot(x, y) / 5)));
  const r = g.finish();
  const expected = Math.PI * 25 * 3 / 3;
  assert.ok(Math.abs(r.above - expected) / expected < 0.005, `above=${r.above}, expected ${expected}`);
  assert.ok(r.below < 0.01);
});

test('a 2 m deep 4 x 4 m pit has 32 m3 below the base within 0.5 %', () => {
  const g = grid(square(6), 0.05);
  sample(g, 6, (x, y) => (Math.abs(x) < 2 && Math.abs(y) < 2 ? -2 : 0));
  const r = g.finish();
  assert.ok(Math.abs(r.below - 32) / 32 < 0.005, `below=${r.below}`);
  assert.ok(r.above < 0.01);
});
