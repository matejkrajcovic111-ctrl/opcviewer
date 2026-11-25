// The public route on the real app: only an exact POST /opcviewer-api/volume is answered;
// anything else under /opcviewer-api is a plain 404 that never reaches sessions or login.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const FIX = path.join(__dirname, 'fixtures', 'octree-default');
const OUTLINE = [[499994, 1199994, 200], [500006, 1199994, 200], [500006, 1200006, 200], [499994, 1200006, 200]];

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

test('only the exact POST is answered; other methods and paths under /opcviewer-api are 404', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-route-'));
  const idx = path.join(tmp, 'www', 'Cone', 'pointclouds', 'index');
  fs.mkdirSync(idx, { recursive: true });
  fs.mkdirSync(path.join(tmp, 'data'));
  for (const f of fs.readdirSync(FIX)) fs.copyFileSync(path.join(FIX, f), path.join(idx, f));
  const port = await freePort();
  const app = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, OPCV_PORT: String(port), OPCV_HOST: '127.0.0.1', OPCV_WWW_ROOT: path.join(tmp, 'www'), OPCV_DATA_DIR: path.join(tmp, 'data'), OPCV_ACCESS_LOG: '/nonexistent' },
    stdio: 'ignore',
  });
  t.after(() => { app.kill(); fs.rmSync(tmp, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/login.html'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
  const post = (p, body) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'manual' });

  const ok = await post('/opcviewer-api/volume', { project: 'Cone', outline: OUTLINE });
  assert.strictEqual(ok.status, 200);
  assert.ok((await ok.json()).above > 70);
  assert.strictEqual((await post('/opcviewer-api/volume', { project: 'Nope', outline: OUTLINE })).status, 404);
  for (const [method, p] of [['GET', '/opcviewer-api/volume'], ['OPTIONS', '/opcviewer-api/volume'], ['POST', '/opcviewer-api/volume/x'], ['GET', '/opcviewer-api/'], ['POST', '/opcviewer-api/projects']]) {
    const r = await fetch(base + p, { method, redirect: 'manual' });
    assert.strictEqual(r.status, 404, `${method} ${p} → ${r.status}`);
    assert.strictEqual(r.headers.get('set-cookie'), null, `${method} ${p} started a session`);
  }
});
