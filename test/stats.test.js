const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// stats.js keeps its state in DATA_DIR; point it at a temp dir before loading it.
process.env.OPCV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-stats-'));
const stats = require('../lib/stats');

const line = (ip, url, status = 200, agent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0') =>
  `${ip} - - [13/Nov/2026:17:01:17 +0000] "GET ${url} HTTP/1.1" ${status} 123 "-" "${agent}"`;

test.before(async () => { await stats._load(); });

test('a GET of a project page counts as a view', () => {
  stats._handleLine(line('10.0.0.5', '/Demo/'));
  assert.strictEqual(stats.summary('Demo').views, 1);
});

test('views from this machine and from bots are not counted', () => {
  stats._handleLine(line('127.0.0.1', '/Quiet/'));
  stats._handleLine(line('10.0.0.5', '/Quiet/', 200, 'Googlebot/2.1'));
  assert.strictEqual(stats.summary('Quiet').views, 0);
});

test('a load report is recorded with its timings', () => {
  stats._handleLine(line('10.0.0.5', '/potree_libs/zm-stat.gif?s=Loaded&f=1200&l=9000&b=5000000&d=4000&h=pub'));
  const s = stats.summary('Loaded');
  assert.strictEqual(s.publicLoads.count, 1);
  assert.strictEqual(s.publicLoads.firstMs, 1200);
  assert.strictEqual(s.publicLoads.fullMs, 9000);
  assert.strictEqual(s.publicLoads.mbPerSec, 1.3);
});

test('the opcviewer load-report beacon is recorded too', () => {
  stats._handleLine(line('10.0.0.5', '/potree_libs/opcviewer-stat.gif?s=Newer&f=800&l=4000&b=3000000&d=2000&h=lan'));
  const s = stats.summary('Newer');
  assert.strictEqual(s.lanLoads.count, 1);
  assert.strictEqual(s.lanLoads.firstMs, 800);
});
