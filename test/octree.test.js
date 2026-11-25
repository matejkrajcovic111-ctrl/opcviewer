// lib/octree.js reads Potree 2 octrees (PotreeConverter 2.1.2 output) on the server.
// Fixtures: the synthetic cone from scripts/make-test-cloud.py, converted once with the
// default encoding and once with --encoding BROTLI.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const octree = require('../lib/octree');

const FIX = (enc) => path.join(__dirname, 'fixtures', `octree-${enc}`, 'metadata.json');
const CX = 500000, CY = 1200000, GROUND = 200;

function allNodes(o) {
  const out = [], stack = [o.root];
  while (stack.length) {
    const n = octree.resolve(o, stack.pop());
    out.push(n);
    for (const c of n.children) if (c) stack.push(c);
  }
  return out;
}

function allPoints(enc) {
  const o = octree.openOctree(FIX(enc));
  try {
    const nodes = allNodes(o), pts = [];
    for (const n of nodes) {
      const p = octree.readPositions(o, n);
      assert.strictEqual(p.length, n.numPoints * 3, `node ${n.name}`);
      for (let i = 0; i < p.length; i += 3) {
        // every point lies in its node's box (one scale step of tolerance)
        for (let k = 0; k < 3; k++) {
          assert.ok(p[i + k] >= n.min[k] - 0.002 && p[i + k] <= n.max[k] + 0.002, `node ${n.name} axis ${k}`);
        }
        pts.push([p[i], p[i + 1], p[i + 2]]);
      }
    }
    return { o, nodes, pts };
  } finally {
    octree.closeOctree(o);
  }
}

for (const enc of ['default', 'brotli']) {
  test(`${enc}: every point is read exactly once`, () => {
    const { o, pts, nodes } = allPoints(enc);
    assert.strictEqual(o.meta.points, 20000);
    assert.strictEqual(pts.length, 20000);
    assert.ok(nodes.length > 1, 'the cloud has more than one node');
  });

  test(`${enc}: points are in world coordinates inside the cone's extent`, () => {
    const { pts } = allPoints(enc);
    for (const [x, y, z] of pts) {
      assert.ok(Math.abs(x - CX) <= 7.002 && Math.abs(y - CY) <= 7.002, `${x} ${y}`);
      assert.ok(z >= GROUND - 0.002 && z <= GROUND + 3.002, `${z}`);
    }
    const peak = pts.reduce((m, p) => (p[2] > m[2] ? p : m));
    assert.ok(Math.hypot(peak[0] - CX, peak[1] - CY) < 0.5, 'highest point near the cone tip');
  });
}

// PotreeConverter rounds to its grid differently per encoding, so a point can differ by
// one scale step (1 mm here) between them; Potree's viewer decodes them the same way.
// Compare point by point and report only a count: a failing deepStrictEqual on 20 000
// points builds a diff large enough to exhaust memory.
test('both encodings give the same points (within one scale step)', () => {
  const step = 0.001 + 1e-9;
  const a = allPoints('default').pts, b = allPoints('brotli').pts;
  assert.strictEqual(a.length, b.length);
  const cellOf = (p) => `${Math.floor(p[0] / 0.01)},${Math.floor(p[1] / 0.01)}`;
  const byCell = new Map();
  for (const p of a) {
    const k = cellOf(p);
    if (!byCell.has(k)) byCell.set(k, []);
    byCell.get(k).push(p);
  }
  let unmatched = 0;
  for (const q of b) {
    const [cx, cy] = cellOf(q).split(',').map(Number);
    let found = false;
    for (let dx = -1; dx <= 1 && !found; dx++) for (let dy = -1; dy <= 1 && !found; dy++) {
      for (const p of byCell.get(`${cx + dx},${cy + dy}`) || []) {
        if (Math.abs(p[0] - q[0]) <= step && Math.abs(p[1] - q[1]) <= step && Math.abs(p[2] - q[2]) <= step) { found = true; break; }
      }
    }
    if (!found) unmatched++;
  }
  assert.strictEqual(unmatched, 0, `${unmatched} BROTLI points have no DEFAULT point within one scale step`);
});

test('node spacing halves with each level', () => {
  const { o, nodes } = allPoints('default');
  for (const n of nodes) assert.ok(Math.abs(n.spacing - o.meta.spacing / 2 ** n.level) < 1e-12);
});
