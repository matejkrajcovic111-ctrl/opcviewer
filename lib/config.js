// All settings that differ between installations come from OPCV_* environment variables
// (the systemd unit loads them from an env file). Defaults fit a standard install.
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const env = process.env;
const DATA_DIR = env.OPCV_DATA_DIR || path.join(APP_DIR, 'data');

module.exports = {
  APP_DIR,
  PORT: env.OPCV_PORT || 3300,
  HOST: env.OPCV_HOST || '0.0.0.0',
  // Apache serves this folder: one sub-folder per project, plus the shared viewer libraries.
  WWW_ROOT: env.OPCV_WWW_ROOT || '/var/www/html',
  LIBS_DIR_NAME: 'potree_libs',
  DATA_DIR,
  UPLOADS_DIR: path.join(APP_DIR, 'uploads'),
  TRASH_DIR: path.join(APP_DIR, 'trash'),
  THUMBS_DIR: path.join(DATA_DIR, 'thumbnails'),
  CONFIG_FILE: path.join(DATA_DIR, 'config.json'),
  SESSION_SECRET_FILE: path.join(DATA_DIR, 'session-secret.txt'),
  SESSIONS_DIR: path.join(DATA_DIR, 'sessions'),
  POTREE_CONVERTER_DIR: env.OPCV_CONVERTER_DIR || path.resolve(APP_DIR, '..', 'potreeconverter'),
  SETTINGS_FILENAME: '.manager-settings.json',
  MAX_UPLOAD_BYTES: 30 * 1024 * 1024 * 1024, // 30GB ceiling per file
  ACCESS_LOG: env.OPCV_ACCESS_LOG || '/var/log/apache2/access.log', // read by lib/stats.js
  // Public address of the viewer pages, used for "Copy link". Empty = the address the
  // admin panel itself is opened at.
  PUBLIC_URL: (env.OPCV_PUBLIC_URL || '').replace(/\/+$/, ''),
  // Where this machine reaches its own project pages (thumbnails are screenshots of them).
  LOCAL_URL: (env.OPCV_LOCAL_URL || 'http://127.0.0.1').replace(/\/+$/, ''),
};
