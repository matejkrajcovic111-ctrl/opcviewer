const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const KEYS = ['OPCV_LOCAL_URL', 'OPCV_PORT', 'OPCV_HOST', 'OPCV_WWW_ROOT', 'OPCV_CONVERTER_DIR', 'OPCV_ACCESS_LOG', 'OPCV_PUBLIC_URL', 'OPCV_DATA_DIR'];

function loadConfig(env = {}) {
  const saved = {};
  for (const k of KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, env);
  const file = require.resolve('../lib/config');
  delete require.cache[file];
  try { return require(file); } finally {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
}

test('without environment variables the values are those of a standard install', () => {
  const c = loadConfig();
  assert.strictEqual(c.WWW_ROOT, '/var/www/html');
  assert.strictEqual(Number(c.PORT), 3300);
  assert.strictEqual(c.HOST, '0.0.0.0');
  assert.strictEqual(c.POTREE_CONVERTER_DIR, path.resolve(c.APP_DIR, '..', 'potreeconverter'));
  assert.strictEqual(c.ACCESS_LOG, '/var/log/apache2/access.log');
  assert.strictEqual(c.PUBLIC_URL, '');
  assert.strictEqual(c.DATA_DIR, path.join(c.APP_DIR, 'data'));
});

test('OPCV_* environment variables override the defaults', () => {
  const c = loadConfig({ OPCV_WWW_ROOT: '/srv/x', OPCV_PUBLIC_URL: 'https://a.b/', OPCV_PORT: '4000', OPCV_HOST: '127.0.0.1', OPCV_DATA_DIR: '/tmp/d', OPCV_CONVERTER_DIR: '/opt/pc' });
  assert.strictEqual(c.WWW_ROOT, '/srv/x');
  assert.strictEqual(c.PUBLIC_URL, 'https://a.b');
  assert.strictEqual(Number(c.PORT), 4000);
  assert.strictEqual(c.HOST, '127.0.0.1');
  assert.strictEqual(c.POTREE_CONVERTER_DIR, '/opt/pc');
});

test('data paths follow OPCV_DATA_DIR', () => {
  const c = loadConfig({ OPCV_DATA_DIR: '/tmp/d' });
  assert.strictEqual(c.DATA_DIR, '/tmp/d');
  assert.strictEqual(c.THUMBS_DIR, '/tmp/d/thumbnails');
  assert.strictEqual(c.CONFIG_FILE, '/tmp/d/config.json');
  assert.strictEqual(c.SESSIONS_DIR, '/tmp/d/sessions');
  assert.strictEqual(c.SESSION_SECRET_FILE, '/tmp/d/session-secret.txt');
});

test('thumbnails open project pages at OPCV_LOCAL_URL (default http://127.0.0.1)', () => {
  assert.strictEqual(loadConfig({}).LOCAL_URL, 'http://127.0.0.1');
  assert.strictEqual(loadConfig({ OPCV_LOCAL_URL: 'http://127.0.0.1:8080/' }).LOCAL_URL, 'http://127.0.0.1:8080');
});

test('the source link defaults to the public repository and can be changed', () => {
  const { spawnSync } = require('child_process');
  const get = (env) => spawnSync(process.execPath, ['-e', 'console.log(require("./lib/config").SOURCE_URL)'], { cwd: require('path').join(__dirname, '..'), env: { ...process.env, ...env }, encoding: 'utf8' }).stdout.trim();
  assert.strictEqual(get({ OPCV_SOURCE_URL: '' }), 'https://github.com/matejkrajcovic111-ctrl/opcviewer');
  assert.strictEqual(get({ OPCV_SOURCE_URL: 'https://git.example/me/opcviewer/' }), 'https://git.example/me/opcviewer');
});
