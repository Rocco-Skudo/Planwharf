'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Create only the default local notebook; explicit missing paths remain errors.
function ensureDefaultNotebook(file, root = path.join(__dirname, '..')) {
  if (path.resolve(file) !== path.join(path.resolve(root), 'plan.json')) return;
  try { fs.copyFileSync(path.join(root, 'fixtures', 'starter-notebook.json'), file, fs.constants.COPYFILE_EXCL); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

module.exports = { ensureDefaultNotebook };
