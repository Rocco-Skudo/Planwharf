'use strict';
// Windows readers, indexers and antivirus can briefly deny delete sharing.
// Retry the same atomic replacement; never truncate or remove the destination.
async function atomicReplace(source, target, { rename = require('node:fs/promises').rename, platform = process.platform, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(source, target); }
    catch (error) {
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt === 5) throw error;
      await delay(20 * 2 ** attempt);
    }
  }
}
module.exports = { atomicReplace };
