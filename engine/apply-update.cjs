'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { unpack, verifyLocal, inside, digest } = require('./app-updates.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function apply(job) {
  const { root, stage, installed, version } = job;
  const bundle = unpack(fs.readFileSync(path.join(stage, 'package.json.gz')), version);
  verifyLocal(root, installed, bundle.files.map(file => file.path));
  const backup = path.join(stage, 'backup'), changed = [];
  fs.mkdirSync(backup, { recursive: true });
  const manifest = { schema: 1, version, files: Object.fromEntries(bundle.files.map(file => [file.path, file.sha256])) };
  const files = [...bundle.files, { path: '.planwharf-install.json', bytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') }];
  // Back up every replacement before writing any application file. Notebook paths never enter this list.
  for (const file of files) {
    const target = inside(root, file.path), saved = path.join(backup, file.path);
    file.existed = fs.existsSync(target);
    if (file.existed) { fs.mkdirSync(path.dirname(saved), { recursive: true }); fs.copyFileSync(target, saved); }
  }
  try {
    for (const file of files) {
      const target = inside(root, file.path), temporary = target + '.update-tmp';
      if (fs.existsSync(temporary)) throw new Error('An update temporary file already exists: ' + file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(temporary, file.bytes, { flag: 'wx', mode: file.path.endsWith('.sh') ? 0o755 : 0o644 });
      changed.push(file);
      fs.renameSync(temporary, target);
      file.replaced = true;
    }
    for (const file of bundle.files) if (digest(fs.readFileSync(inside(root, file.path))) !== file.sha256) throw new Error('Installed checksum mismatch: ' + file.path);
  } catch (error) {
    const failures = [];
    for (const file of changed.reverse()) {
      try {
        const target = inside(root, file.path);
        if (file.replaced) {
          if (file.existed) fs.copyFileSync(path.join(backup, file.path), target);
          else fs.rmSync(target, { force: true });
        }
        fs.rmSync(target + '.update-tmp', { force: true });
      } catch (failure) { failures.push(failure.message); }
    }
    if (failures.length) throw new Error('Rollback incomplete: ' + failures.join('; ') + '. Backup: ' + backup);
    throw error;
  }
  return manifest;
}
async function main(jobFile) {
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  const deadline = Date.now() + 60000;
  while (true) {
    try { process.kill(job.parentPid, 0); }
    catch (error) { if (error.code === 'ESRCH') break; throw error; }
    if (Date.now() >= deadline) throw new Error('Planwharf did not exit. The update was not applied.');
    await pause(200);
  }
  await pause(750); // Allow the Windows launcher to release its executable after Node exits.
  try {
    apply(job);
    const result = JSON.stringify({ ok: true, version: job.version });
    fs.writeFileSync(path.join(job.stage, 'result.json'), result);
    fs.writeFileSync(path.join(job.root, '.planwharf-update-result.json'), result);
  } catch (error) {
    const result = JSON.stringify({ ok: false, error: error.message });
    fs.writeFileSync(path.join(job.stage, 'result.json'), result);
    fs.writeFileSync(path.join(job.root, '.planwharf-update-result.json'), result);
    if (error.message.startsWith('Rollback incomplete:')) throw error;
  }
  const child = spawn(job.node, job.args, { cwd: job.root, detached: true, stdio: 'ignore', windowsHide: true });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
}
if (require.main === module) main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { apply, main };
