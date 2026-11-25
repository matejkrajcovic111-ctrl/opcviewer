// Stand-in for lib/volumeWorker.js in tests: blocks in a native call (which terminate()
// cannot interrupt) and logs when it starts and ends.
const fs = require('fs');
const { execFileSync } = require('child_process');
const { parentPort, workerData } = require('worker_threads');
const { log, name, seconds } = workerData.outline;
fs.appendFileSync(log, `start ${name} ${Date.now()}\n`);
execFileSync('sleep', [String(seconds)]);
fs.appendFileSync(log, `end ${name} ${Date.now()}\n`);
parentPort.postMessage({ result: { name } });
