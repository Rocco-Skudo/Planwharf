'use strict';
const { execFile } = require('node:child_process');
const { executable } = require('./providers.cjs');
const { unreadPlan } = require('./planUsage.js');

// Verified with agy 1.3.3: /usage is a CLI command, num_turns=0, numeric quota buckets.
function parseUsage(body) {
  const groups = body && body.status === 'SUCCESS' && body.command && body.command.name === 'usage' && body.command.data && body.command.data.groups;
  const gemini = (Array.isArray(groups) ? groups : []).filter(group => /^Gemini Models$/i.test(group.name || ''));
  const windows = gemini.flatMap(group => (Array.isArray(group.buckets) ? group.buckets : []).flatMap(bucket => {
    const fraction = bucket.remaining_fraction;
    if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) return [];
    const leftPct = Math.round(fraction * 100);
    return [{ name: bucket.window || bucket.name, pct: 100 - leftPct, leftPct, remainingFraction: fraction, resetAt: bucket.reset_time || null }];
  }));
  if (!windows.length) return unreadPlan('Gemini', 'Antigravity returned no numeric Gemini quota.');
  const tight = windows.reduce((a, b) => a.remainingFraction < b.remainingFraction ? a : b);
  return { id: 'Gemini', label: 'Gemini', readable: true, exhausted: windows.some(w => w.remainingFraction === 0),
    pct: tight.pct, leftPct: tight.leftPct, source: 'agy /usage JSON', reason: null, windows };
}

async function readAntigravity({ command = executable('antigravity'), run = execFile } = {}) {
  if (!command) return unreadPlan('Gemini', 'Antigravity agy executable not found.');
  return new Promise(resolve => {
    run(command, ['-p', '/usage', '--output-format', 'json', '--print-timeout', '15s'], { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(unreadPlan('Gemini', error.killed ? 'Antigravity quota timed out.' : 'Antigravity /usage failed. Check CLI login.'));
      try { resolve(parseUsage(JSON.parse(String(stdout).replace(/^\uFEFF/, '').trim()))); }
      catch (_) { resolve(unreadPlan('Gemini', 'Antigravity /usage JSON format not recognized.')); }
    });
  });
}
module.exports = { parseUsage, readAntigravity };
