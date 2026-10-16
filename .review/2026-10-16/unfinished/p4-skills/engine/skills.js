'use strict';
const { createSkillCatalog, REVIEWED_SKILLS, MATT_REV } = require('./skill-catalog.cjs');
const REPO = 'mattpocock/skills', REF = MATT_REV;
const SKILL_FILES = [...new Set(REVIEWED_SKILLS.filter(item => item.source === 'matt').flatMap(item => item.files).filter(file => file !== 'LICENSE'))];
function createSkillsCache(options = {}) {
  if (!options.dir) throw Error('skills cache directory required');
  const registry = createSkillCatalog(options);
  function snapshot(projectId, filter) {
    const result = registry.snapshot(projectId, filter), installed = (result.catalog || []).filter(item => item.installed);
    return { ...result, repo: REPO, ref: REF, sha: installed.length ? REF : null, status: installed.length ? 'reviewed-selection' : 'approval-required', checking: false, updated: false, behind: false, catalogComplete: true, skillCount: installed.length, files: installed.flatMap(item => item.files), date: null, automaticDownloads: false };
  }
  const ensure = async () => snapshot();
  const read = (relative, projectId) => registry.read(projectId, relative);
  function prompt(role, context = '', details = {}) {
    if (!details.projectId) return '';
    return registry.attach({ ...details, role: role === 'lead' ? 'orchestrator' : role === 'audit' ? 'reviewer' : role, task: context }).prompt;
  }
  return { registry, snapshot, sync: ensure, ensure, read, prompt };
}
module.exports = { createSkillsCache, SKILL_FILES, REPO, REF };
