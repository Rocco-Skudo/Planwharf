'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { confined, writeAtomic, hash, parseSkill } = require('./skill-catalog.cjs');
function projectIdentity(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 200 || ['__proto__', 'constructor', 'prototype'].includes(id)) throw Error('An explicit project identity is required.');
}
function safeText(text, max = 20000) {
  if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > max) throw Error('Draft text is missing or too long.');
  let normalized = text;
  try { normalized += '\n' + JSON.stringify(JSON.parse(text)); } catch { /* Ordinary prose need not be JSON. */ }
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{16,}|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16}|Bearer\s+[A-Za-z0-9._-]{8,}|(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)["']?\s*[:=]\s*["']?[^\s<>"']+)/i.test(normalized)) throw Error('Potential credentials must be removed before Skill generation.');
  return text.trim();
}
function boundedRead(target, max = 65536) {
  const fd = fs.openSync(target, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > max) throw Error('Evidence must be a file of at most 64 KiB.');
    const buffer = Buffer.alloc(max + 1); let length = 0;
    while (length < buffer.length) { const count = fs.readSync(fd, buffer, length, buffer.length - length, null); if (!count) break; length += count; }
    if (length > max) throw Error('Evidence exceeds 64 KiB.');
    return buffer.subarray(0, length).toString('utf8');
  } finally { fs.closeSync(fd); }
}
function createSkillGeneration({ dir, resolveProcedureProposal, now = () => new Date().toISOString() }) {
  const file = path.join(dir, 'skill-drafts.json'); let store = { schema: 1, drafts: [] };
  try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved.schema !== 1 || !Array.isArray(saved.drafts)) throw Error('Invalid Skill draft store.'); store = saved; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const save = () => writeAtomic(file, store);
  const find = (projectId, id) => { projectIdentity(projectId); const row = store.drafts.find(item => item.projectId === projectId && item.id === id); if (!row) throw Error('Draft does not belong to the selected project.'); return row; };
  function references(folder, files) {
    if (!Array.isArray(files) || !files.length || files.length > 20 || new Set(files).size !== files.length) throw Error('Choose 1 to 20 distinct authorized project references.');
    return files.map(relative => {
      if (typeof relative !== 'string' || !/\.(?:md|txt|json|js|cjs|ts|py)$/i.test(relative) || relative.split(/[\\/]/).some(part => part.startsWith('.')) || /(?:auth|credential|secret|token|password)/i.test(relative)) throw Error('Credential/configuration stores are not Skill evidence.');
      const text = boundedRead(confined(folder, relative, { existing: true })); safeText(text, 65536);
      return { relative, revision: hash(text), kind: 'authorized-project-reference' };
    });
  }
  function create(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['projectId', 'folder', 'name', 'description', 'procedure', 'references', 'requested', 'mode'].includes(key))) throw Error('Only explicit manual draft fields are supported.');
    if (input.requested !== true || (input.mode ?? 'manual') !== 'manual') throw Error('An explicit manual request is required. Assisted and Full Auto generation are disabled through manual creation.');
    return persistDraft(input);
  }
  function reviewedProposal(projectId, folder, proposalId) {
    projectIdentity(projectId);
    if (typeof resolveProcedureProposal !== 'function') throw Error('Trusted human-reviewed assisted generation is unavailable.');
    if (typeof proposalId !== 'string' || !proposalId || proposalId.length > 200) throw Error('An explicit procedure proposal identity is required.');
    // Only the backend-injected resolver supplies accepted evidence. No request
    // data can assert that an attempt, test or procedure has been validated.
    const proposal = resolveProcedureProposal(projectId, proposalId);
    if (!proposal || typeof proposal.then === 'function' || proposal.id !== proposalId || proposal.projectId !== projectId || proposal.acceptance !== 'human-reviewed' || proposal.testExecutionVerified !== false || proposal.procedureComplianceVerified !== false || proposal.projectRoot !== fs.realpathSync(folder) || typeof proposal.skillId !== 'string' || !proposal.skillId || proposal.skillId.length > 200 || !/^[a-f0-9]{64}$/.test(proposal.contentHash) || !Array.isArray(proposal.evidence) || proposal.evidence.length < 3 || proposal.evidence.length > 100 || !/^[a-f0-9]{64}$/.test(proposal.sourceFingerprint)) throw Error('Fresh human-reviewed project proposal evidence is required.');
    const attempts = new Set(), candidates = new Set();
    const reviews = proposal.evidence.map(row => {
      if (!row || typeof row.attemptId !== 'string' || !row.attemptId || row.attemptId.length > 200 || typeof row.candidateId !== 'string' || !row.candidateId || row.candidateId.length > 200 || !/^[a-f0-9]{64}$/.test(row.reviewHash) || attempts.has(row.attemptId) || candidates.has(row.candidateId)) throw Error('Three distinct human-reviewed attempts are required.');
      attempts.add(row.attemptId); candidates.add(row.candidateId);
      return { candidateId: row.candidateId, attemptId: row.attemptId, reviewHash: row.reviewHash };
    });
    const referencePaths = proposal.referencePaths;
    const evidence = references(proposal.projectRoot, referencePaths);
    const sourceFingerprint = hash(JSON.stringify([proposal.projectRoot, [...evidence].sort((a, b) => a.relative < b.relative ? -1 : a.relative > b.relative ? 1 : 0).map(row => ({ relative: row.relative, contentHash: row.revision }))]));
    if (sourceFingerprint !== proposal.sourceFingerprint) throw Error('Procedure proposal source evidence changed.');
    const provenance = { proposalId, projectId, projectRoot: proposal.projectRoot, skillId: proposal.skillId, contentHash: proposal.contentHash, sourceFingerprint, reviews, testExecutionVerified: false, procedureComplianceVerified: false };
    return { referencePaths: [...referencePaths], provenance: { ...provenance, reviewHash: hash(JSON.stringify(provenance)) } };
  }
  function createAssisted(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['projectId', 'folder', 'proposalId', 'name', 'description', 'procedure', 'requested'].includes(key))) throw Error('Only explicit assisted draft fields are supported.');
    if (input.requested !== true) throw Error('Explicit request for a human-reviewed assisted draft is required.');
    const proposal = reviewedProposal(input.projectId, input.folder, input.proposalId);
    return persistDraft({ projectId: input.projectId, folder: input.folder, name: input.name, description: input.description, procedure: input.procedure, references: proposal.referencePaths }, proposal.provenance);
  }
  function persistDraft(input, procedureProposal = null) {
    const { projectId, folder, name } = input;
    projectIdentity(projectId);
    if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name)) throw Error('Choose a safe Skill name.');
    const projectRoot = fs.realpathSync(folder), description = safeText(input.description, 500), procedure = safeText(input.procedure);
    const evidence = references(projectRoot, input.references);
    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n# ${name}\n\nProject-local procedure. Follow only existing user authorization and Planwharf role/approval boundaries. Never self-enable, install hooks, expand permissions or publish.\n\n${procedure}\n`;
    const fingerprint = hash(JSON.stringify([projectId, projectRoot, name, content, evidence, procedureProposal]));
    const existing = store.drafts.find(row => row.projectId === projectId && row.fingerprint === fingerprint); if (existing) return structuredClone(existing);
    const draft = { id: crypto.randomUUID(), projectId, projectRoot, name, description, content, revision: hash(content), fingerprint, evidence, mode: procedureProposal ? 'assisted-human-reviewed' : 'manual', ...(procedureProposal ? { procedureProposal, testExecutionVerified: false, procedureComplianceVerified: false } : {}), status: 'draft', createdAt: now(), fullAuto: false };
    store.drafts.push(draft); save(); return structuredClone(draft);
  }
  function edit(projectId, id, revision, content) {
    const draft = find(projectId, id);
    if (draft.status !== 'draft' || draft.revision !== revision) throw Error('Draft changed or already approved; inspect its latest revision.');
    safeText(content, 48000); const parsed = parseSkill(content);
    if (parsed.name !== draft.name || !parsed.description) throw Error('Edited draft must preserve its safe name and description.');
    draft.content = content; draft.description = parsed.description; draft.revision = hash(content); draft.editedAt = now(); save(); return structuredClone(draft);
  }
  function approve({ projectId, folder, id, revision, approved }) {
    if (approved !== true) throw Error('Explicit approval of the inspected draft revision is required.');
    const draft = find(projectId, id);
    if (draft.revision !== revision || hash(draft.content) !== revision) throw Error('Draft revision changed; inspect before approval.');
    const projectRoot = fs.realpathSync(folder);
    if (projectRoot !== draft.projectRoot) throw Error('Authorized project folder changed; create and review a fresh draft.');
    if (draft.mode === 'assisted-human-reviewed') {
      const fresh = reviewedProposal(projectId, projectRoot, draft.procedureProposal?.proposalId);
      if (fresh.provenance.reviewHash !== draft.procedureProposal.reviewHash) throw Error('Human-reviewed proposal changed; create and inspect a fresh assisted draft.');
    }
    safeText(draft.content, 48000);
    for (const item of draft.evidence) { const text = boundedRead(confined(projectRoot, item.relative, { existing: true })); safeText(text, 65536); if (hash(text) !== item.revision) throw Error('Authorized project evidence changed; create and review a fresh draft.'); }
    const relative = `.planwharf/skills/${draft.name}/SKILL.md`, provenanceRelative = `.planwharf/skills/${draft.name}/provenance.json`;
    const target = confined(projectRoot, relative), provenanceTarget = confined(projectRoot, provenanceRelative);
    const approvedAt = draft.approvedAt || now();
    const provenance = JSON.stringify({ projectId, draftId: id, revision, evidence: draft.evidence, mode: draft.mode, ...(draft.procedureProposal ? { procedureProposal: draft.procedureProposal, testExecutionVerified: false, procedureComplianceVerified: false } : {}), approvedAt }, null, 2) + '\n';
    for (const [destination, expected] of [[target, draft.content], [provenanceTarget, provenance]]) {
      if (fs.existsSync(destination) && boundedRead(destination) !== expected) throw Error('Existing project Skill or provenance differs; no overwrite was authorized.');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    for (const [relativeFile, content] of [[relative, draft.content], [provenanceRelative, provenance]]) {
      const destination = confined(projectRoot, relativeFile);
      if (!fs.existsSync(destination)) fs.writeFileSync(destination, content, { flag: 'wx' });
      else if (boundedRead(destination) !== content) throw Error('Existing project Skill or provenance differs; no overwrite was authorized.');
    }
    draft.status = 'approved'; draft.approvedAt = approvedAt; draft.relative = relative; save();
    return { ...structuredClone(draft), activated: false, message: 'Approved project-local file saved. Explicit catalog approval and selection are still required.' };
  }
  function suggest() { return { proposals: [], assistedGeneration: typeof resolveProcedureProposal === 'function', fullAuto: false, reason: 'Use a fresh backend-resolved human-reviewed proposal; caller-supplied procedures and outcomes cannot authorize a proposal.' }; }
  function snapshot(projectId) { projectIdentity(projectId); return { projectId, drafts: store.drafts.filter(row => row.projectId === projectId).map(row => structuredClone(row)), fullAuto: false, assistedGeneration: typeof resolveProcedureProposal === 'function', activationRequiresApproval: true }; }
  return { create, createAssisted, edit, approve, suggest, snapshot };
}
module.exports = { createSkillGeneration, safeText };
