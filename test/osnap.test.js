// OSNAP: which snap target the cursor is on (viewer/opcviewer-osnap.js, window.zmOsnap.pick).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { loadViewerScript } = require('./helpers/viewer-sandbox');

const O = loadViewerScript(path.join(__dirname, '..', 'viewer', 'opcviewer-osnap.js')).window.zmOsnap;
// Top view, 10 px per metre, world (0,0) at screen (0,0), y down the screen.
const project = (v) => ({ x: v.x * 10, y: v.y * 10 });
const P = (x, y, z) => ({ x, y, z });
const ALL = { on: true, end: true, mid: true, perp: true, int: true };
const plain = (r) => r && { type: r.type, pos: { x: r.pos.x, y: r.pos.y, z: r.pos.z } };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const SEG = [P(0, 0, 100), P(20, 0, 104)]; // 0..200 px along the top, rising 4 m

test('an end point within 12 px is snapped to, 13 px away it is not', () => {
  const r = plain(O.pick({ x: 200 + 12, y: 0 }, [SEG], [SEG[0], SEG[1]], null, ALL, project));
  assert.deepStrictEqual(r, { type: 'end', pos: { x: 20, y: 0, z: 104 } });
  assert.strictEqual(O.pick({ x: 213, y: 0 }, [SEG], [SEG[0], SEG[1]], null, ALL, project), null);
});

test('the middle of a segment, with its exact height', () => {
  assert.deepStrictEqual(plain(O.pick({ x: 103, y: 4 }, [SEG], [], null, ALL, project)), { type: 'mid', pos: { x: 10, y: 0, z: 102 } });
});

test('perpendicular from the previous point onto a segment, height along the segment', () => {
  const prev = P(5, 8, 0);
  const r = O.pick({ x: 52, y: 3 }, [SEG], [], prev, ALL, project);
  assert.strictEqual(r.type, 'perp');
  assert.ok(near(r.pos.x, 5) && near(r.pos.y, 0) && near(r.pos.z, 101), JSON.stringify(r.pos));
  // without a previous point there is no perpendicular
  assert.strictEqual(O.pick({ x: 52, y: 3 }, [SEG], [], null, ALL, project), null);
  // the foot must lie on the segment
  assert.strictEqual(O.pick({ x: 252, y: 3 }, [SEG], [], P(25, 8, 0), ALL, project), null);
});

test('the crossing of two segments: height from the cloud surface, else the mean of the two', () => {
  const A = [P(0, 0, 10), P(10, 10, 20)], B = [P(0, 10, 30), P(10, 0, 40)]; // cross at (5,5): z 15 and 35
  const r1 = O.pick({ x: 50, y: 48 }, [A, B], [], null, ALL, project, () => 12.5);
  assert.deepStrictEqual(plain(r1), { type: 'int', pos: { x: 5, y: 5, z: 12.5 } });
  const r2 = O.pick({ x: 50, y: 48 }, [A, B], [], null, ALL, project, () => null);
  assert.deepStrictEqual(plain(r2), { type: 'int', pos: { x: 5, y: 5, z: 25 } });
  assert.deepStrictEqual(plain(O.pick({ x: 50, y: 48 }, [A, B], [], null, ALL, project)), plain(r2));
});

test('segments meeting at a shared corner are not an intersection', () => {
  const A = [P(0, 0, 0), P(10, 0, 0)], B = [P(10, 0, 0), P(10, 10, 0)];
  assert.strictEqual(O.pick({ x: 100, y: 2 }, [A, B], [], null, { on: true, int: true }, project), null);
});

test('closest target wins; at equal distance End beats Int, Mid and Perp', () => {
  // end point and a midpoint of another segment at the same screen spot
  const other = [P(-10, 0, 7), P(10, 0, 9)]; // mid (0,0,8)
  const r = plain(O.pick({ x: 3, y: 4 }, [other], [P(0, 0, 1)], null, ALL, project));
  assert.deepStrictEqual(r, { type: 'end', pos: { x: 0, y: 0, z: 1 } });
  // the closer one wins regardless of type
  const r2 = plain(O.pick({ x: 0, y: 6 }, [[P(-10, 0.5, 7), P(10, 0.5, 9)]], [P(0, 0, 1)], null, ALL, project));
  assert.strictEqual(r2.type, 'mid');
});

test('switched-off types are never returned, and OSNAP off means no snapping at all', () => {
  assert.strictEqual(O.pick({ x: 103, y: 4 }, [SEG], [], null, { ...ALL, mid: false }, project), null);
  assert.strictEqual(O.pick({ x: 205, y: 0 }, [SEG], [SEG[1]], null, { ...ALL, on: false }, project), null);
  assert.strictEqual(O.pick({ x: 205, y: 0 }, [], [], null, ALL, project), null);
});

test('targets behind the camera (no screen position) are skipped', () => {
  assert.strictEqual(O.pick({ x: 0, y: 0 }, [], [P(0, 0, 0)], null, ALL, () => null), null);
});

test('defaults: on, with End, Mid and Int, Perp off', () => {
  assert.deepStrictEqual({ ...O.state }, { on: true, end: true, mid: true, perp: false, int: true });
});

test('the cloud is only asked for a height at crossings near the cursor', () => {
  const A = [P(0, 0, 10), P(10, 10, 20)], B = [P(0, 10, 30), P(10, 0, 40)];
  let calls = 0;
  const surfaceZ = () => { calls++; return 12.5; };
  assert.strictEqual(O.pick({ x: 300, y: 300 }, [A, B], [], null, ALL, project, surfaceZ), null);
  assert.strictEqual(calls, 0);
  assert.strictEqual(O.pick({ x: 50, y: 48 }, [A, B], [], null, ALL, project, surfaceZ).pos.z, 12.5);
  assert.strictEqual(calls, 1);
});
