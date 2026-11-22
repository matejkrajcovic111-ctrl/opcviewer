// One-time setup code. install.sh writes DATA_DIR/setup-code.txt and prints the code, so
// only the person who ran the installer can set the first admin password (otherwise the
// first visitor on the network could). No file = no code needed.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const FILE = path.join(DATA_DIR, 'setup-code.txt');

function read() {
  try { return fs.readFileSync(FILE, 'utf8').trim(); } catch { return null; }
}

function required() {
  return read() !== null;
}

function check(input) {
  const code = read();
  if (code === null) return true;
  if (!code || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input.trim()).digest();
  const b = crypto.createHash('sha256').update(code).digest();
  return crypto.timingSafeEqual(a, b);
}

function consume() {
  fs.rmSync(FILE, { force: true });
}

module.exports = { required, check, consume };
