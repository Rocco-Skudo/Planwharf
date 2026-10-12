'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createOrchestrator } = require('../engine/orchestrator.js');
const { createAttemptEngine } = require('../engine/attempts.js');
const { createSentinel } = require('../engine/sentinel.js');
const runner = require('../engine/runner.cjs');
const { launchSpec } = require('../engine/providers.cjs');
const dir = path.join(__dirname, 'provider-check');
const folder = path.join(dir, 'worker-project');
fs.mkdirSync(folder, { recursive: true });
const models = require('../models.json').filter(m => ['gpt-6-astra', 'gpt-6-luna'].includes(m.id));
const evidence = { at: new Date().toISOString(), launches: [] };
const job = { id: 'routing-check', projectId: 'routing-check', revision_id: 1, title: 'Verify real worker routing', detail: 'Create routing-proof.json in this folder containing {"marker":"CODEX_WORKER_OK"}. This is a tiny dispatch verification. No other implementation. Do not inspect parent or sibling directories.', status: 'running' };
const notebook = { schema: 1, project: { id: 'routing-check', name: 'Isolated provider check', folder }, revisions: [{ id: 1, mode: 'manual', title: 'Routing', createdAt: new Date().toISOString(), direction: 'Verify real provider dispatch', state: 'Ready', closed: [], open: [] }], tasks: [job] };
fs.writeFileSync(path.join(dir, 'routing-notebook.json'), JSON.stringify(notebook, null, 2));
const attemptsDir = path.join(dir, 'routing-attempts-' + Date.now());
const attempts = createAttemptEngine({ dir: attemptsDir });
let orchestra;
orchestra = createOrchestrator({ dir: attemptsDir, readPlan: async () => notebook, models, attempts,
  sentinel: createSentinel(attempts, { isAlive: attempt => runner.isProcessAlive(orchestra.pidFor(attempt)) }),
  fetchPlans: async () => [], isProcessAlive: runner.isProcessAlive, killWorker: runner.killWorker,
  spawnWorker: info => { evidence.launches.push({ provider: info.worker.provider, cli: info.worker.cli, modelId: info.worker.id, launch: runner.spawnWorker(info) }); return evidence.launches.at(-1).launch; },
  askModel: async info => {
    const spec = launchSpec(info.model, folder, 'Coordinate', true);
    evidence.lead = { provider: spec.provider, model: spec.model, command: spec.command, args: spec.args };
    return runner.askOrchestrator(info);
  }
});
(async () => {
  await orchestra.setOrchestrator('gpt-6-astra');
  evidence.answer = await orchestra.ask('Reply briefly with your coordination role. Do not inspect files or use tools.', 'routing-check');
  await orchestra.approve('routing-check');
  for (let n = 0; n < 60; n++) {
    const snapshot = await orchestra.tick();
    const row = snapshot.projects[0];
    if (['complete', 'checkpointed', 'blocked_no_worker'].includes(row.status)) {
      evidence.snapshot = snapshot;
      evidence.proof = fs.existsSync(path.join(folder, 'routing-proof.json')) ? JSON.parse(fs.readFileSync(path.join(folder, 'routing-proof.json'))) : null;
      evidence.passed = row.status === 'complete' && evidence.proof?.marker === 'CODEX_WORKER_OK' && evidence.lead?.model === 'gpt-6-astra' && evidence.launches.some(item => item.cli === 'gpt-6-luna');
      fs.writeFileSync(path.join(dir, 'real-routing.json'), JSON.stringify(evidence, null, 2));
      console.log(JSON.stringify({ passed: evidence.passed, lead: evidence.lead.model, workers: evidence.launches.map(item => item.cli), status: row.status, answer: evidence.answer.answer }));
      if (!evidence.passed) process.exitCode = 1;
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await orchestra.stop('routing-check');
  throw new Error('Routing check timed out');
})().catch(error => { console.error(error); process.exitCode = 1; });
