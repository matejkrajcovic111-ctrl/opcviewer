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
