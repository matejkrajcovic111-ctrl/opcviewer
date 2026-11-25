// Stand-in for lib/volumeWorker.js in tests: answers after workerData.outline.delayMs.
const { parentPort, workerData } = require('worker_threads');
setTimeout(() => parentPort.postMessage({ result: { slow: true } }), workerData.outline.delayMs);
