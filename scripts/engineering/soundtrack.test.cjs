'use strict';
// Offline Soundtrack coverage uses simulated media, owned temporary notebooks and bundled files.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT; // The child starts its own test runner even inside the full suite.
const result = spawnSync(process.execPath, ['--test', 'engine/soundtrack.test.cjs', 'engine/soundtrack-library.test.cjs', 'engine/soundtrack-http.test.cjs', 'engine/soundtrack-assets.test.cjs'], { cwd: root, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.error) console.error(result.error.message);
process.exitCode = result.error || result.status !== 0 ? 1 : 0;
