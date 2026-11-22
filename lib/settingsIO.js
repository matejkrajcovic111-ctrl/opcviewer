const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { SETTINGS_FILENAME } = require('./config');
const { DEFAULT_SETTINGS } = require('./template');

async function readSettingsFile(projectDir, fallback = {}) {
  try {
    const raw = await fsp.readFile(path.join(projectDir, SETTINGS_FILENAME), 'utf8');
    return { ...DEFAULT_SETTINGS, ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS, ...fallback };
  }
}

async function writeSettingsFile(projectDir, settings) {
  await fsp.writeFile(
    path.join(projectDir, SETTINGS_FILENAME),
    JSON.stringify(settings, null, 2)
  );
}

module.exports = { readSettingsFile, writeSettingsFile };
