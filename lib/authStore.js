const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { CONFIG_FILE, SESSION_SECRET_FILE, DATA_DIR } = require('./config');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function isSetup() {
  const cfg = readConfig();
  return !!(cfg && cfg.passwordHash);
}

function setPassword(password) {
  ensureDataDir();
  const hash = bcrypt.hashSync(password, 10);
  const cfg = readConfig() || {};
  cfg.passwordHash = hash;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function checkPassword(password) {
  const cfg = readConfig();
  if (!cfg || !cfg.passwordHash) return false;
  return bcrypt.compareSync(password, cfg.passwordHash);
}

function getSessionSecret() {
  ensureDataDir();
  try {
    return fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SESSION_SECRET_FILE, secret);
    return secret;
  }
}

module.exports = { isSetup, setPassword, checkPassword, getSessionSecret };
