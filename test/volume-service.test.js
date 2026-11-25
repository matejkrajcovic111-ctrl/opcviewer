// The public volume endpoint's pieces: request checks, project lookup and the job runner
// (one calculation at a time in a worker thread, a short waiting line, a time limit).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { validateVolumeRequest, resolveVolumeProject, createVolumeService } = require('../lib/volumeService');
const { computeVolume } = require('../lib/volume');

const FIX = path.join(__dirname, 'fixtures', 'octree-default');
const www = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-vol-'));
fs.mkdirSync(path.join(www, 'Cone', 'pointclouds', 'index'), { recursive: true });
for (const f of ['metadata.json', 'hierarchy.bin', 'octree.bin']) fs.copyFileSync(path.join(FIX, f), path.join(www, 'Cone', 'pointclouds', 'index', f));
fs.mkdirSync(path.join(www, 'potree_libs'));
fs.mkdirSync(path.join(www, 'Empty'));
fs.writeFileSync(path.join(www, 'file.txt'), 'x');

const OUTLINE = [[499994, 1199994, 200], [500006, 1199994, 200], [500006, 1200006, 200], [499994, 1200006, 200]];
const status = (fn) => { try { fn(); } catch (e) { return e.status; } return 200; };

test('a valid request passes', () => {
  assert.deepStrictEqual(validateVolumeRequest({ project: 'Cone', outline: OUTLINE }), { project: 'Cone', outline: OUTLINE });
});

test('bad requests are refused with 400', () => {
  const bad = [
    null, {}, { project: 'Cone' }, { outline: OUTLINE },
    { project: '../etc', outline: OUTLINE }, { project: 'a/b', outline: OUTLINE }, { project: 'a\\b', outline: OUTLINE },
    { project: '.hidden', outline: OUTLINE }, { project: 'potree_libs', outline: OUTLINE }, { project: 42, outline: OUTLINE },
    { project: 'x'.repeat(300), outline: OUTLINE },
    { project: 'Cone', outline: OUTLINE.slice(0, 2) },
    { project: 'Cone', outline: Array.from({ length: 501 }, (_, i) => [i, i * i, 0]) },
    { project: 'Cone', outline: [[1, 2, NaN], [3, 4, 5], [6, 7, 8]] },
    { project: 'Cone', outline: [[1, 2], [3, 4, 5], [6, 7, 8]] },
    { project: 'Cone', outline: [['1', 2, 3], [3, 4, 5], [6, 7, 8]] },
    { project: 'Cone', outline: 'nope' },
  ];
  for (const body of bad) assert.strictEqual(status(() => validateVolumeRequest(body)), 400, JSON.stringify(body).slice(0, 80));
});

test('a project resolves to its metadata.json inside the web folder', async () => {
  assert.strictEqual(await resolveVolumeProject('Cone', www), path.join(www, 'Cone', 'pointclouds', 'index', 'metadata.json'));
});

test('unknown folders, files and folders without point data are refused with 400', async () => {
  for (const name of ['Nope', 'Empty', 'file.txt', 'potree_libs']) {
    await assert.rejects(resolveVolumeProject(name, www), (e) => e.status === 400, name);
  }
});

test('a calculation in the worker equals the direct one', async () => {
  const svc = createVolumeService();
  const meta = await resolveVolumeProject('Cone', www);
  const r = await svc.run(meta, OUTLINE);
  const direct = computeVolume(meta, OUTLINE);
  assert.strictEqual(r.above, direct.above);
  assert.strictEqual(r.highlight.h, direct.highlight.h);
});

test('one at a time, four waiting, the sixth is told the server is busy (429)', async () => {
  const svc = createVolumeService({ workerFile: path.join(__dirname, 'helpers', 'slow-volume-worker.js') });
  const calls = Array.from({ length: 6 }, () => svc.run('x', { delayMs: 150 }).then(() => 200, (e) => e.status));
  assert.deepStrictEqual(await Promise.all(calls), [200, 200, 200, 200, 200, 429]);
});

test('a calculation over the time limit is stopped (504) and the next one still runs', async () => {
  const svc = createVolumeService({ workerFile: path.join(__dirname, 'helpers', 'slow-volume-worker.js'), timeoutMs: 1000 });
  await assert.rejects(svc.run('x', { delayMs: 5000 }), (e) => e.status === 504);
  assert.deepStrictEqual(await svc.run('x', { delayMs: 10 }), { slow: true });
});

test('an outline whose grid would be too large is refused before any memory is used', () => {
  const sq = (w) => [[0, 0, 0], [w, 0, 0], [w, w, 0], [0, w, 0]];
  assert.strictEqual(status(() => validateVolumeRequest({ project: 'Cone', outline: sq(900) })), 200);
  assert.strictEqual(status(() => validateVolumeRequest({ project: 'Cone', outline: sq(3000) })), 400);
  assert.strictEqual(status(() => validateVolumeRequest({ project: 'Cone', outline: sq(1e7) })), 400);
  // a long thin outline (a road or railway) is fine: only the bounding rectangle counts
  assert.strictEqual(status(() => validateVolumeRequest({ project: 'Cone', outline: [[0, 0, 0], [5000, 0, 0], [5000, 60, 0], [0, 60, 0]] })), 200);
});
