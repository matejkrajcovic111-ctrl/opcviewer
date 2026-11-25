// lib/volume.js: the Volume tool's calculation, run on the server against the octree files.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { computeVolume, decodeHighlightForTest } = require('../lib/volume');

const FIX = (enc) => path.join(__dirname, 'fixtures', `octree-${enc}`, 'metadata.json');
const CX = 500000, CY = 1200000, GROUND = 200;
const CONE = Math.PI * 25 * 3 / 3; // 78.540 m3
// The outline is clicked on the cloud itself, so it sits on that cloud's ground. BROTLI
// stores the ground one scale step (1 mm) higher than DEFAULT (see octree.test.js).
const groundOf = (enc) => GROUND + (enc === 'brotli' ? 0.001 : 0);
const square = (h, z) => [[CX - h, CY - h, z], [CX + h, CY - h, z], [CX + h, CY + h, z], [CX - h, CY + h, z]];

const results = {};
for (const enc of ['default', 'brotli']) {
  test(`${enc}: the cone's volume within 2 %`, () => {
    const r = computeVolume(FIX(enc), square(6, groundOf(enc)));
    results[enc] = r;
    assert.ok(r.points > 10000, `points ${r.points}`);
    assert.ok(Math.abs(r.above - CONE) / CONE < 0.02, `above ${r.above}, expected ${CONE}`);
    assert.ok(r.below < 0.05 * CONE, `below ${r.below}`);
    assert.ok(Math.abs(r.area - 144) / 144 < 0.02, `area ${r.area}`);
    assert.strictEqual(r.capped, false);
  });
}

test('both encodings give the same numbers (within 0.1 %)', () => {
  const a = results.default, b = results.brotli;
  for (const k of ['above', 'area']) assert.ok(Math.abs(a[k] - b[k]) / a[k] < 0.001, `${k}: ${a[k]} vs ${b[k]}`);
});

test('outline outside the cloud', () => {
  const r = computeVolume(FIX('default'), [[CX + 50, CY + 50, 200], [CX + 60, CY + 50, 200], [CX + 60, CY + 60, 200]]);
  assert.strictEqual(r.points, 0);
});

test('the base plane goes through a tilted outline', () => {
  const outline = [[CX - 6, CY - 6, 200], [CX + 6, CY - 6, 201.2], [CX, CY + 6, 200.6]];
  const r = computeVolume(FIX('default'), outline);
  const { cx, cy, cz, a, b } = r.plane;
  for (const [x, y, z] of outline) assert.ok(Math.abs(cz + a * (x - cx) + b * (y - cy) - z) < 1e-9);
});

test('highlight is capped', () => {
  const full = computeVolume(FIX('default'), square(6, GROUND));
  const capped = computeVolume(FIX('default'), square(6, GROUND), { maxHighlightCells: 1000 });
  assert.ok(capped.highlight.nx * capped.highlight.ny <= 1000, `${capped.highlight.nx} x ${capped.highlight.ny}`);
  for (const k of ['above', 'below', 'area', 'cell', 'points']) assert.strictEqual(capped[k], full[k], k);
  const h = decodeHighlightForTest(capped.highlight);
  assert.strictEqual(h.heights.length, capped.highlight.nx * capped.highlight.ny);
  // the display grid still shows the cone: its highest cell is close to the peak
  assert.ok(Math.max(...h.heights) > 2 && Math.max(...h.heights) < 3.1);
});

test('the highlight encodes the counted cells of the full grid', () => {
  const r = computeVolume(FIX('default'), square(6, GROUND));
  const h = decodeHighlightForTest(r.highlight);
  assert.strictEqual(r.highlight.cell, r.cell);
  const counted = h.mask.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(counted * r.cell * r.cell - r.area) < 1e-6, `${counted} cells vs area ${r.area}`);
});

test('an outline far away from the cloud is answered at once, without building its grid', () => {
  // ~4 million cells and 500 edges, nowhere near the cloud (the expensive case for the grid)
  const far = Array.from({ length: 500 }, (_, i) => [495 + 495 * Math.cos(i / 250 * Math.PI), 495 + 495 * Math.sin(i / 250 * Math.PI), 0]);
  const t0 = Date.now();
  const r = computeVolume(FIX('default'), far);
  assert.strictEqual(r.points, 0);
  assert.ok(Date.now() - t0 < 300, `took ${Date.now() - t0} ms`);
});
