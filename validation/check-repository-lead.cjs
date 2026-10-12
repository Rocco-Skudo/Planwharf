'use strict';
// Owner-specific read-only probe. Its output stays local and is not a distribution fixture.
const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { askOrchestrator } = require('../engine/runner.cjs');
const { createRepositoryInspector } = require('../engine/repository.cjs');
const notebook = JSON.parse(fs.readFileSync('plan.json'));
const project = notebook.projects.find(row => row.project.github?.includes('AI-Companion-Desktop')).project;
const model = require('../models.json').find(row => row.id === 'gpt-6-astra');
const status = () => {
  const row = spawnSync('git', ['-C', project.folder, 'status', '--porcelain'], { encoding: 'utf8', windowsHide: true });
  if (row.status !== 0) throw new Error(row.stderr);
  return crypto.createHash('sha256').update(row.stdout).digest('hex');
};
(async () => {
  const before = status();
  const repository = await createRepositoryInspector()(project, { force: true });
  const answer = await askOrchestrator({ model, folder: project.folder, github: project.github,
    question: 'This is a narrowly scoped access check. Use gh api to verify the linked repository private property, and git rev-parse --show-toplevel to verify the local root. Do not implement, run tests, push, modify files or print credentials. Return one JSON object with github, private, and localRoot. Do not merely copy the briefing: actually execute those two checks.',
    state: { focus: { ...project, repository } } });
  const result = { at: new Date().toISOString(), provider: model.provider, model: model.cli, repository,
    answer, sourceStatusBefore: before, sourceStatusAfter: status() };
  result.unchanged = result.sourceStatusBefore === result.sourceStatusAfter;
  result.passed = result.unchanged && repository.remote.accessible && repository.remote.private && /true/.test(answer.answer) && /AI-Companion-Desktop/.test(answer.answer);
  fs.writeFileSync('validation/repository-lead-access.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ passed: result.passed, unchanged: result.unchanged, answer: answer.answer }));
  if (!result.passed) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
