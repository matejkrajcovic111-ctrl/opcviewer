// Writes Potree's lang/sk/translation.json from the SK table inside opcviewer-ui.js,
// so the two never drift apart. Usage: node gen-sk.js <opcviewer-ui.js> <out.json>
const fs = require('fs'), vm = require('vm');
let bundle = null;
const noop = () => {};
const win = {
  localStorage: { getItem: () => null, setItem: noop },
  i18n: { addResourceBundle: (l, ns, o) => { bundle = o; }, setLng: noop },
  jQuery: () => ({ i18n: noop }),
};
const ctx = { window: win, document: { documentElement: {}, getElementById: () => null, querySelector: () => null }, setTimeout: noop, NodeFilter: {} };
vm.runInNewContext(fs.readFileSync(process.argv[2], 'utf8'), ctx);
win.zmLang.set('sk');
if (!bundle) throw new Error('SK table not found');
fs.writeFileSync(process.argv[3], JSON.stringify(bundle, null, '\t') + '\n');
console.log('wrote', process.argv[3], Object.keys(bundle).length, 'sections');
