// web/apache-site.conf: Apache passes exactly one address to the opcviewer app (the
// Volume tool's calculation); nothing else of the admin panel is reachable through it.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const conf = fs.readFileSync(path.join(__dirname, '..', 'web', 'apache-site.conf'), 'utf8');
const directives = conf.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

test('only an exact POST to the volume address is proxied to the app', () => {
  const proxy = directives.filter((l) => /^Proxy/i.test(l) || /\[P[\],]/.test(l));
  assert.deepStrictEqual(proxy, [
    'ProxyPassMatch "^/(opcviewer-api/volume)$" "http://127.0.0.1:{{PORT}}/$1"',
  ]);
  // other methods on that address are refused by Apache itself
  const block = conf.slice(conf.indexOf('<Location "/opcviewer-api/">'), conf.indexOf('</Location>'));
  assert.match(block, /<LimitExcept POST>\s*Require all denied\s*<\/LimitExcept>/);
});

test('the installer enables the proxy modules', () => {
  const install = fs.readFileSync(path.join(__dirname, '..', 'install.sh'), 'utf8');
  assert.match(install, /a2enmod -q headers mime proxy proxy_http\b/);
});
