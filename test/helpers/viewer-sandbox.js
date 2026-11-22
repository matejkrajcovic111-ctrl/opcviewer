// Runs a viewer script (the files copied into potree_libs/) in a bare sandbox, so its
// pure functions can be tested without a browser. Only what the scripts touch at load time
// is provided; anything they would do later in a real page is a no-op here.
const fs = require('fs');
const vm = require('vm');

function loadViewerScript(file, extra = {}) {
  const noop = () => {};
  const win = {
    localStorage: { getItem: () => null, setItem: noop },
    addEventListener: noop,
    ...extra.window,
  };
  const doc = {
    documentElement: {},
    readyState: 'complete',
    head: { appendChild: noop },
    body: { appendChild: noop },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }),
    ...extra.document,
  };
  const ctx = { window: win, document: doc, setTimeout: noop, setInterval: noop, NodeFilter: {}, console, ...extra.globals };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx;
}

module.exports = { loadViewerScript };
