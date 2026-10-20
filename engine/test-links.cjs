'use strict';
// Real filesystem fixtures: no mocked stat/realpath results or machine policy changes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function metadataLink(target, link, t) {
  let kind = 'file-symlink';
  try { fs.symlinkSync(target, link, 'file'); }
  catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    // Windows junctions need no symlink privilege. They exercise the same real
    // metadata reparse-point guard; Linux CI additionally exercises the file link.
    fs.symlinkSync(path.dirname(target), link, 'junction');
    kind = 'windows-junction';
    assert.equal(fs.realpathSync(path.join(link, path.basename(target))), fs.realpathSync(target));
  }
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(link), fs.realpathSync(kind === 'file-symlink' ? target : path.dirname(target)));
  t.diagnostic('Real metadata redirect fixture: ' + kind);
  return kind;
}

module.exports = { metadataLink };
