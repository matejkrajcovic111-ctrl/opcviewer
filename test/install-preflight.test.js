// install.sh preflight: never take over a web server or site that is already in use.
// The script is sourced with OPCV_SOURCE_ONLY=1 (defines its functions, runs nothing) and
// pointed at a fake /etc/apache2 and default document root. Listeners are given per port,
// e.g. '80:nginx 8080:apache2'; a bare name means "on the port being checked".
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', 'install.sh');

function fakeBox({ sites = {}, defaultIndex = null, opcviewerSite = null, apache = true }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-pre-'));
  const etc = path.join(root, 'apache2');
  const docroot = path.join(root, 'html');
  fs.mkdirSync(docroot);
  if (!apache) return { etc, docroot };
  fs.mkdirSync(path.join(etc, 'sites-enabled'), { recursive: true });
  fs.mkdirSync(path.join(etc, 'sites-available'), { recursive: true });
  for (const [name, body] of Object.entries(sites)) {
    fs.writeFileSync(path.join(etc, 'sites-enabled', name), body.replace('{{DOCROOT}}', docroot));
  }
  if (defaultIndex !== null) fs.writeFileSync(path.join(docroot, 'index.html'), defaultIndex);
  if (opcviewerSite) fs.writeFileSync(path.join(etc, 'sites-available', 'opcviewer.conf'), opcviewerSite);
  return { etc, docroot };
}

function preflight(box, port, listeners = '') {
  if (listeners && !listeners.includes(':')) listeners = `${port}:${listeners}`;
  const r = spawnSync('bash', ['-c',
    `OPCV_SOURCE_ONLY=1 . "$1"; APACHE_ETC="$2"; DEFAULT_DOCROOT="$3"; LISTENERS="$5"
     port_listener() { local l; for l in $LISTENERS; do [ "\${l%%:*}" = "$1" ] && printf '%s' "\${l#*:}"; done; return 0; }
     check_apache_sites "$4" && check_port "$4"`,
    'x', SCRIPT, box.etc, box.docroot, String(port), listeners], { encoding: 'utf8' });
  return { ok: r.status === 0, err: r.stderr };
}

const STOCK_DEFAULT = '<VirtualHost *:80>\n\tDocumentRoot {{DOCROOT}}\n</VirtualHost>\n';
const STOCK_PAGE = '<html><title>Apache2 Ubuntu Default Page: It works</title></html>';

test('a fresh machine passes', () => {
  assert.ok(preflight(fakeBox({}), 80).ok);
});

test('the stock Apache default site may be replaced', () => {
  assert.ok(preflight(fakeBox({ sites: { '000-default.conf': STOCK_DEFAULT }, defaultIndex: STOCK_PAGE }), 80, 'apache2').ok);
  assert.ok(preflight(fakeBox({ sites: { '000-default.conf': STOCK_DEFAULT } }), 80, 'apache2').ok);
});

test('a real website in 000-default.conf is not taken over', () => {
  const r = preflight(fakeBox({ sites: { '000-default.conf': STOCK_DEFAULT }, defaultIndex: '<h1>My shop</h1>' }), 80, 'apache2');
  assert.ok(!r.ok);
  assert.match(r.err, /000-default\.conf/);
  const moved = preflight(fakeBox({ sites: { '000-default.conf': '<VirtualHost *:80>\n DocumentRoot /srv/shop\n</VirtualHost>\n' } }), 80, 'apache2');
  assert.ok(!moved.ok);
});

test('other enabled Apache sites stop the install on port 80', () => {
  const r = preflight(fakeBox({ sites: { 'shop.conf': '<VirtualHost *:80></VirtualHost>' } }), 80, 'apache2');
  assert.ok(!r.ok);
  assert.match(r.err, /shop\.conf/);
});

test('a port used by another program stops the install with its name', () => {
  const r = preflight(fakeBox({}), 80, 'nginx');
  assert.ok(!r.ok);
  assert.match(r.err, /port 80.*nginx/);
});

test('another port already used by Apache is refused unless it is opcviewer\'s own', () => {
  assert.ok(!preflight(fakeBox({}), 8080, 'apache2').ok);
  assert.ok(preflight(fakeBox({ opcviewerSite: '<VirtualHost *:8080>\n</VirtualHost>\n' }), 8080, 'apache2').ok);
});

test('before Apache is installed, port 80 must be free even for another port (the package listens on 80)', () => {
  const r = preflight(fakeBox({ apache: false }), 8080, '80:nginx');
  assert.ok(!r.ok);
  assert.match(r.err, /port 80.*nginx/);
  assert.ok(preflight(fakeBox({}), 8080, '80:apache2').ok);
});

test('Apache is pointed at the admin port from the existing settings file on an update', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-env-'));
  const env = path.join(dir, 'opcviewer.env');
  const run = (file) => spawnSync('bash', ['-c', 'OPCV_SOURCE_ONLY=1 . "$1"; OPCV_ADMIN_PORT=3300; admin_port "$2"', 'x', SCRIPT, file], { encoding: 'utf8' }).stdout.trim();
  assert.strictEqual(run(env), '3300'); // first install: no settings file yet
  fs.writeFileSync(env, '# settings\nOPCV_PORT=8123\nOPCV_HOST=0.0.0.0\n');
  assert.strictEqual(run(env), '8123');
  fs.writeFileSync(env, 'OPCV_PORT=80; rm -rf /\n');
  assert.strictEqual(run(env), '3300'); // anything but a plain number is ignored
});
