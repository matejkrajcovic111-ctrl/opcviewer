const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadViewerScript } = require('./helpers/viewer-sandbox');

// The grid maths lives in one file used by the server (require) and the browser (window).
const GRID = path.join(__dirname, '..', 'viewer', 'opcviewer-grid.js');
const shared = require(GRID);
const browser = loadViewerScript(GRID).window.zmVolumeGrid;
const square = (h) => [{ x: -h, y: -h, z: 0 }, { x: h, y: -h, z: 0 }, { x: h, y: h, z: 0 }, { x: -h, y: h, z: 0 }];

// Samples a surface z = f(x, y) every 2 cm over the outline's square.
function sample(g, h, f) {
  for (let x = -h + 0.01; x < h; x += 0.02) for (let y = -h + 0.01; y < h; y += 0.02) g.add(x, y, f(x, y));
}

for (const [how, make] of [['server', shared.makeVolumeGrid], ['browser', browser]]) {
test(how + ': a cone r=5 m, h=3 m on flat ground has a volume of pi*r^2*h/3 within 0.5 %', () => {
  const g = make(square(6), 0.05);
  sample(g, 6, (x, y) => Math.max(0, 3 * (1 - Math.hypot(x, y) / 5)));
  const r = g.finish();
  const expected = Math.PI * 25 * 3 / 3;
  assert.ok(Math.abs(r.above - expected) / expected < 0.005, `above=${r.above}, expected ${expected}`);
  assert.ok(r.below < 0.01);
});

test(how + ': a 2 m deep 4 x 4 m pit has 32 m3 below the base within 0.5 %', () => {
  const g = make(square(6), 0.05);
  sample(g, 6, (x, y) => (Math.abs(x) < 2 && Math.abs(y) < 2 ? -2 : 0));
  const r = g.finish();
  assert.ok(Math.abs(r.below - 32) / 32 < 0.005, `below=${r.below}`);
  assert.ok(r.above < 0.01);
});
}

test('the browser global and the Node export are the same functions', () => {
  assert.strictEqual(typeof browser, 'function');
  for (const k of ['makeVolumeGrid', 'cellSize', 'refine']) assert.strictEqual(typeof browser[k], 'function', k);
});

test('cellSize follows the 400-across rule and its limits', () => {
  const sq = (w) => [{ x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }, { x: w, y: w, z: 0 }, { x: 0, y: w, z: 0 }];
  assert.ok(Math.abs(shared.cellSize(sq(100)) - 0.25) < 1e-12);
  assert.strictEqual(shared.cellSize(sq(2)), 0.01);
  assert.strictEqual(shared.cellSize(sq(2000)), 0.5);
});

test('refine makes the grid coarser while the scan is too sparse for it', () => {
  const g = shared.makeVolumeGrid(square(6), 0.02);
  for (let x = -5.95; x < 6; x += 0.1) for (let y = -5.95; y < 6; y += 0.1) g.add(x, y, 1);
  const { result } = shared.refine(g);
  assert.ok(result.cell > 0.02, `cell ${result.cell}`);
  assert.ok(result.emptyShare <= 0.08 || result.cell >= 0.32);
  assert.ok(Math.abs(result.above - 144) / 144 < 0.02, `above ${result.above}`);
});
