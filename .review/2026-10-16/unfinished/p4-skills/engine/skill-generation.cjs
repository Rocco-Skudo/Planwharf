'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { confined, writeAtomic, hash } = require('./skill-catalog.cjs');
function safeText(text, max = 20000) {
  if (typeof text !== 'string' || !text.trim() || text.length > max) throw Error('Draft text is missing or too long.');
  if (/-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|(?:password|api[_-]?key|access[_-]?token)["']?\s*[:=]\s*["']?[^\s<>"']{8,})/i.test(text)) throw Error('Potential credentials must be removed before Skill generation.');
  return text.trim();
}
function createSkillGeneration({ dir, now = () => new Date().toISOString() }) {
  const file = path.join(dir, 'skill-drafts.json'); let store = { schema: 1, drafts: [], suggestions: [] };
  try { const saved = JSON.parse(fs.readFileSync(file)); if (saved.schema !== 1 || !Array.isArray(saved.drafts) || !Array.isArray(saved.suggestions)) throw Error('Invalid Skill draft store.'); store = saved; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const save = () => writeAtomic(file, store);
  const find = (projectId, id) => { const draft = store.drafts.find(row => row.projectId === projectId && row.id === id); if (!draft) throw Error('Draft does not belong to the selected project.'); return draft; };
  function references(folder, files = []) {
    if (!Array.isArray(files) || files.length > 20) throw Error('Choose at most 20 authorized project references.');
    return files.map(relative => {
      if (!/\.(?:md|txt|json|js|cjs|ts|py)$/i.test(relative) || relative.split(/[\\/]/).some(part => part.startsWith('.')) || /(?:auth|credential|secret|token|password)/i.test(relative)) throw Error('Credential/configuration stores are not Skill evidence.');
      const target = confined(folder, relative, { existing: true }); const stat = fs.statSync(target); if (stat.size > 65536) throw Error('Evidence file exceeds 64 KiB.');
      const text = safeText(fs.readFileSync(target, 'utf8'), 65536); return { relative, revision: hash(text), kind: 'authorized-project-reference' };
    });
  }
  function create({ projectId, folder, name, description, procedure, references: files = [], outcomes = [], requested, mode = 'manual' }) {
    if (requested !== true || !['manual', 'assisted'].includes(mode)) throw Error('Manual request or bounded assisted proposal is required. Full Auto is disabled.');
    if (typeof projectId !== 'string' || !projectId || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw Error('Choose a project and safe Skill name.');
    description = safeText(description, 500); procedure = safeText(procedure);
    const evidence = references(folder, files);
    for (const outcome of outcomes) { if (!outcome || outcome.validated !== true || outcome.projectId !== projectId || !outcome.resultId) throw Error('Only validated outcomes from this project can support a draft.'); evidence.push({ kind: 'validated-task-outcome', resultId: outcome.resultId, revision: hash(JSON.stringify(outcome)) }); }
    if (!evidence.length) throw Error('At least one authorized project reference or validated outcome is required.');
    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${name}\n\nProject-local procedure. Follow only existing user authorization and Planwharf role/approval boundaries. Never self-enable, install hooks, expand permissions or publish.\n\n${procedure}\n`;
    const fingerprint = hash(JSON.stringify([projectId, name, content, evidence]));
    const existing = store.drafts.find(row => row.projectId === projectId && row.fingerprint === fingerprint); if (existing) return structuredClone(existing);
    const draft = { id: crypto.randomUUID(), projectId, name, description, content, revision: hash(content), fingerprint, evidence, mode, status: 'draft', createdAt: now(), fullAuto: false };
    store.drafts.push(draft); save(); return structuredClone(draft);
  }
  function edit(projectId, id, revision, content) {
    const draft = find(projectId, id); if (draft.status !== 'draft' || draft.revision !== revision) throw Error('Draft changed or already approved; inspect its latest revision.');
    safeText(content, 48000); const parsed = require('./skill-catalog.cjs').parseSkill(content);
    if (parsed.name !== draft.name || !parsed.description) throw Error('Edited draft must preserve its safe name and description.');
    draft.content = content; draft.revision = hash(content); draft.description = parsed.description; draft.editedAt = now(); save(); return structuredClone(draft);
  }
  function approve({ projectId, folder, id, revision, approved }) {
    if (approved !== true) throw Error('Explicit approval of the inspected draft revision is required.');
    const draft = find(projectId, id); if (draft.revision !== revision) throw Error('Draft revision changed; inspect before approval.');
    const relative = `.planwharf/skills/${draft.name}/SKILL.md`, target = confined(folder, relative);
    for (const item of draft.evidence.filter(item => item.kind === 'authorized-project-reference')) { const text = safeText(fs.readFileSync(confined(folder, item.relative, { existing: true }), 'utf8'), 65536); if (hash(text) !== item.revision) throw Error('Authorized project evidence changed; create and review a fresh draft.'); }
    if (fs.existsSync(target)) {
      if (fs.readFileSync(target, 'utf8') !== draft.content) throw Error('Existing project Skill differs; no overwrite was authorized.');
    } else { fs.mkdirSync(path.dirname(target), { recursive: true }); const safeTarget = confined(folder, relative); fs.writeFileSync(safeTarget, draft.content, { flag: 'wx' }); }
    writeAtomic(confined(folder, `.planwharf/skills/${draft.name}/provenance.json`), { projectId, draftId: id, revision, evidence: draft.evidence, mode: draft.mode, approvedAt: draft.approvedAt || now() });
    draft.status = 'approved'; draft.approvedAt ||= now(); draft.relative = relative; save();
    return { ...structuredClone(draft), activated: false, message: 'Approved project-local file saved. Enable/select it explicitly before task attachment.' };
  }
  function suggest({ projectId, folder, procedures = [] }) {
    const groups = new Map();
    for (const row of procedures) { if (row.projectId !== projectId || row.validated !== true || !row.resultId || !row.procedure || !row.procedureKey) continue; const group = groups.get(row.procedureKey) || []; if (!group.some(item => item.resultId === row.resultId)) group.push(row); groups.set(row.procedureKey, group); }
    const added = [];
    for (const [key, outcomes] of groups) {
      if (outcomes.length < 3 || store.suggestions.some(row => row.projectId === projectId && row.procedureKey === key)) continue;
      if (store.suggestions.some(row => row.projectId === projectId && Date.parse(now()) - Date.parse(row.at) < 7 * 86400000)) break;
      const name = 'reusable-' + hash(key).slice(0, 12);
      const draft = create({ projectId, folder, name, description: 'Reusable procedure observed in repeated validated project outcomes.', procedure: outcomes[0].procedure, outcomes, requested: true, mode: 'assisted' });
      store.suggestions.push({ projectId, procedureKey: key, draftId: draft.id, at: now() }); save(); added.push(draft); break;
    }
    return added;
  }
  const snapshot = projectId => ({ projectId, drafts: store.drafts.filter(row => row.projectId === projectId).map(row => structuredClone(row)), fullAuto: false, activationRequiresApproval: true });
  return { create, edit, approve, suggest, snapshot };
}
module.exports = { createSkillGeneration, safeText };
