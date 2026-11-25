const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.OPCV_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-thumb-'));
const thumbnails = require('../lib/thumbnails');

test('when the browser cannot start, a thumbnail fails instead of retrying forever', async () => {
  let launches = 0;
  thumbnails._setLauncher(async () => { launches += 1; throw new Error('chrome_crashpad_handler: --database is required'); });
  await assert.rejects(
    Promise.race([thumbnails.generateNow('Demo'), new Promise((_, rej) => setTimeout(() => rej(new Error('hung')), 2000))]),
    /crashpad/,
  );
  assert.ok(launches <= 2, `launched ${launches} times`);
});

test('thumbnails hide the OSNAP bar and its marker like the other overlays', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'lib', 'thumbnails.js'), 'utf8');
  const ids = /const hideIds = \[([^\]]*)\]/.exec(src)[1];
  assert.match(ids, /'zm-osnap'/);
  assert.match(ids, /'zm-osnap-mark'/);
});
