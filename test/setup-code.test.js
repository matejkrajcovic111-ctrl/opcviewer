const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opcv-code-'));
process.env.OPCV_DATA_DIR = dir;
const setupCode = require('../lib/setupCode');
const FILE = path.join(dir, 'setup-code.txt');

test('without a code file no code is needed (installs made before the installer existed)', () => {
  assert.strictEqual(setupCode.required(), false);
  assert.strictEqual(setupCode.check(undefined), true);
});

test('with a code file only that code is accepted', () => {
  fs.writeFileSync(FILE, 'k7Q2-x9Pm-44Za\n');
  assert.strictEqual(setupCode.required(), true);
  assert.strictEqual(setupCode.check('k7Q2-x9Pm-44Za'), true);
  assert.strictEqual(setupCode.check('  k7Q2-x9Pm-44Za '), true);
  assert.strictEqual(setupCode.check('k7Q2-x9Pm-44Zb'), false);
  assert.strictEqual(setupCode.check(''), false);
  assert.strictEqual(setupCode.check(undefined), false);
  assert.strictEqual(setupCode.check({}), false);
});

test('an empty code file is never satisfied', () => {
  fs.writeFileSync(FILE, '\n');
  assert.strictEqual(setupCode.required(), true);
  assert.strictEqual(setupCode.check(''), false);
});

test('consume() removes the code once the password is set', () => {
  fs.writeFileSync(FILE, 'abc-def\n');
  setupCode.consume();
  assert.ok(!fs.existsSync(FILE));
  assert.strictEqual(setupCode.required(), false);
});
