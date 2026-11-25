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

test('cellSize: 5 cm, finer for small outlines, coarser only when the grid would not fit', () => {
  const sq = (w) => [{ x: 0, y: 0, z: 0 }, { x: w, y: 0, z: 0 }, { x: w, y: w, z: 0 }, { x: 0, y: w, z: 0 }];
  const near = (a, b) => Math.abs(a - b) < 1e-12;
  assert.strictEqual(shared.cellSize(sq(2)), 0.01); // 400 across, at least 1 cm
  assert.ok(near(shared.cellSize(sq(10)), 0.025)); // small piles keep their finer grid
  assert.strictEqual(shared.cellSize(sq(100)), 0.05); // was 25 cm
  assert.strictEqual(shared.cellSize(sq(200)), 0.05); // 40,000 m2 still at 5 cm
  assert.ok(near(shared.cellSize(sq(300)), 0.075)); // 16 million cells is the most
  assert.ok(shared.gridCells(sq(300), shared.cellSize(sq(300))) <= shared.MAX_CELLS);
  assert.strictEqual(shared.cellSize(sq(2000)), 0.5); // never coarser than 50 cm
  // the browser fallback asks for a smaller grid
  assert.ok(near(shared.cellSize(sq(100), 1.5e6), Math.sqrt(1e4 / 1.5e6)));
  assert.strictEqual(shared.cellSize(sq(10), 1.5e6), 0.025);
});

test('refine makes the grid coarser while the scan is too sparse for it', () => {
  const g = shared.makeVolumeGrid(square(6), 0.02);
  for (let x = -5.95; x < 6; x += 0.1) for (let y = -5.95; y < 6; y += 0.1) g.add(x, y, 1);
  const { result } = shared.refine(g);
  assert.ok(result.cell > 0.02, `cell ${result.cell}`);
  assert.ok(result.emptyShare <= 0.08 || result.cell >= 0.32);
  assert.ok(Math.abs(result.above - 144) / 144 < 0.02, `above ${result.above}`);
});

test('the grid itself refuses to allocate more than its cell limit', () => {
  const line = [{ x: 0, y: 0, z: 0 }, { x: 1e9, y: 0, z: 0 }, { x: 2e9, y: 0, z: 0 }];
  assert.throws(() => shared.makeVolumeGrid(line, 0.01), /too large/);
  assert.throws(() => browser(line, 0.01), /too large/);
  assert.ok(shared.makeVolumeGrid(square(500), 0.5)); // 2000 x 2000 cells is fine
});

// Reference: the even-odd test per cell centre, exactly as makeVolumeGrid did it before.
function insideReference(poly, cell) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell)), ny = Math.max(1, Math.ceil((maxY - minY) / cell));
  const out = new Uint8Array(nx * ny), n = poly.length;
  for (let iy = 0; iy < ny; iy++) {
    const py = minY + (iy + 0.5) * cell;
    for (let ix = 0; ix < nx; ix++) {
      const px = minX + (ix + 0.5) * cell;
      let c = false;
      for (let k = 0, j = n - 1; k < n; j = k++) {
        if ((poly[k].y > py) !== (poly[j].y > py) && px < (poly[j].x - poly[k].x) * (py - poly[k].y) / (poly[j].y - poly[k].y) + poly[k].x) c = !c;
      }
      out[iy * nx + ix] = c ? 1 : 0;
    }
  }
  return out;
}

test('the inside test marks exactly the same cells as the per-cell reference', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let mismatches = 0, cells = 0;
  for (let t = 0; t < 30; t++) {
    const n = 3 + Math.floor(rnd() * 40);
    // star-shaped and self-crossing outlines, national-grid-sized coordinates, points on cell lines
    const poly = Array.from({ length: n }, () => ({ x: 500000 + Math.round(rnd() * 60) * (t % 3 ? 1 : 0.5), y: 1200000 + rnd() * 40, z: 0 }));
    const cell = 0.25;
    const ref = insideReference(poly, cell);
    const got = shared.makeVolumeGrid(poly, cell).insideMask;
    assert.strictEqual(got.length, ref.length);
    for (let i = 0; i < ref.length; i++) if (got[i] !== ref[i]) mismatches++;
    cells += ref.length;
  }
  assert.strictEqual(mismatches, 0, `${mismatches} of ${cells} cells differ`);
});

test('a grid at the size limit with a 500-point outline is built in well under 3 s', () => {
  const poly = Array.from({ length: 500 }, (_, i) => ({ x: 500 * Math.cos(i / 500 * 2 * Math.PI), y: 500 * Math.sin(i / 500 * 2 * Math.PI), z: 0 }));
  const t0 = Date.now();
  shared.makeVolumeGrid(poly, 0.5);
  assert.ok(Date.now() - t0 < 3000, `took ${Date.now() - t0} ms`);
});
