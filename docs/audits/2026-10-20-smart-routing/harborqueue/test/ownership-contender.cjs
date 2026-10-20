'use strict';

const fs = require('node:fs');
const { HarborQueue } = require('../scheduler.cjs');

const [file, label, releaseFile, stopFile, executionFile] = process.argv.slice(2);

function waitForFile(target) {
  while (!fs.existsSync(target)) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}

async function main() {
  let queue;
  try {
    queue = new HarborQueue({
      file,
      concurrency: 1,
      maxRetries: 1,
      fault(stage) {
        if (stage !== 'after-stale-lock-read') return;
        process.send({ type: 'stale-read', label });
        waitForFile(releaseFile);
      },
      run: async () => {
        fs.appendFileSync(executionFile, `start ${label}\n`);
        process.send({ type: 'started', label });
        waitForFile(stopFile);
        fs.appendFileSync(executionFile, `end ${label}\n`);
      },
    });
    queue.start();
    await queue.idle();
    await queue.close();
    process.send({ type: 'completed', label });
  } catch (error) {
    if (queue) await queue.close().catch(() => {});
    process.send({ type: 'rejected', label, error: error.message });
  }
}

main().then(() => process.exit(0), (error) => {
  process.send({ type: 'fatal', label, error: error.message });
  process.exit(1);
});
