// Runs one volume calculation (lib/volume.js) off the main thread, so the admin panel
// stays responsive. Started by lib/volumeService.js for each job.
const { parentPort, workerData } = require('worker_threads');
const { computeVolume } = require('./volume');

try {
  parentPort.postMessage({ result: computeVolume(workerData.metadataPath, workerData.outline) });
} catch (err) {
  parentPort.postMessage({ error: err.message });
}
