'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { confined, hash, writeAtomic } = require('./skill-catalog.cjs');
const { validateResult } = require('./worker-result.cjs');
const { safeText } = require('./skill-generation.cjs');
function readBounded(file) {
 const fd = fs.openSync(file, 'r');
 try { const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 65536) throw Error('Evidence must be a file of at most 64 KiB.'); const bytes = Buffer.alloc(65537); let n = 0; while (n < bytes.length) { const count = fs.readSync(fd, bytes, n, bytes.length - n, null); if (!count) break; n += count; } if (n > 65536) throw Error('Evidence exceeds 64 KiB.'); return bytes.subarray(0, n).toString('utf8'); } finally { fs.closeSync(fd); }
}
function exactKeys(input, allowed) { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !allowed.includes(k))) throw Error('Unsupported evidence fields.'); }
function createSkillProcedureEvidence({ dir, attemptsDir, snapshot, projectResolver, now = () => new Date().toISOString() }) {
 const file = path.join(dir, 'procedure-evidence.json'); let store = { schema: 1, candidates: [], accepted: [], suggestions: [] };
 try { const saved = JSON.parse(fs.readFileSync(file, 'utf8')); if (saved.schema !== 1 || !['candidates','accepted','suggestions'].every(k => Array.isArray(saved[k]))) throw Error('Invalid procedure evidence registry.'); store = saved; } catch (e) { if (e.code !== 'ENOENT') throw e; }
 const save = () => writeAtomic(file, store);
 function observe(input) {
  const { projectId, attemptId, skillId, referencePaths } = input;
  if (typeof projectId !== 'string' || !projectId.trim() || ['__proto__','constructor','prototype'].includes(projectId) || typeof attemptId !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(attemptId) || typeof skillId !== 'string' || !skillId) throw Error('Explicit project, attempt and Skill identities required.');
  const project = projectResolver(projectId); if (!project || project.id !== projectId || !project.folder) throw Error('Project is unavailable.');
  const projectRoot = fs.realpathSync(project.folder);
  if (!Array.isArray(referencePaths) || !referencePaths.length || referencePaths.length > 20 || new Set(referencePaths).size !== referencePaths.length) throw Error('Choose 1 to 20 distinct authorized source references.');
  const sources = [...referencePaths].sort().map(relative => { if (typeof relative !== 'string' || relative.split(/[\\/]/).some(p => p.startsWith('.')) || /(?:auth|credential|secret|token|password)/i.test(relative) || !/\.(?:md|txt|json|js|cjs|ts|py)$/i.test(relative)) throw Error('Source reference is not authorized procedure evidence.'); const text = readBounded(confined(projectRoot, relative, { existing: true })); safeText(text, 65536); return { relative, contentHash: hash(text) }; });
  const view = snapshot(projectId); if (!view || typeof view.then === 'function') throw Error('Evidence snapshot must be an authoritative synchronous snapshot.');
  const result = (view.results || []).find(r => r.attemptId === attemptId);
  const sub = (view.subTasks || []).find(s => s.id === result?.subTaskId);
  const mega = (view.megaTasks || []).find(m => m.id === result?.megaTaskId);
  if (!result || result.status !== 'COMPLETE' || result.exitCode !== 0 || !sub || sub.status !== 'COMPLETE' || sub.resultId !== result.resultId || !sub.attemptIds?.includes(attemptId) || sub.megaTaskId !== mega?.id || mega.projectId !== projectId || !mega.approvedAt || result.assignedModelId !== sub.assignedModelId || result.provider !== sub.provider || result.cli !== sub.cli) throw Error('No matching backend COMPLETE assignment.');
  const resultPath = confined(attemptsDir, 'results/' + attemptId + '.json', { existing: true });
  if (result.evidencePath !== resultPath) throw Error('Result evidence path does not match its owned attempt.');
  const resultBytes = readBounded(resultPath), exitBytes = readBounded(confined(attemptsDir, 'results/' + attemptId + '.exit.json', { existing: true })), logBytes = readBounded(confined(attemptsDir, 'logs/' + attemptId + '.log', { existing: true }));
  const raw = JSON.parse(resultBytes), exit = JSON.parse(exitBytes);
  const identity = { resultId: result.resultId, attemptId, subTaskId: sub.id, megaTaskId: mega.id };
  if (!validateResult(raw, identity) || raw.status !== 'COMPLETE' || exit.attemptId !== attemptId || exit.provider !== result.provider || exit.model !== result.cli || exit.exitCode !== 0 || Object.keys(raw).some(key => JSON.stringify(raw[key]) !== JSON.stringify(result[key]))) throw Error('Attempt result or exit receipt changed.');
  const deliveries = (view.deliveries || []).filter(d => d.projectId === projectId && d.taskId === sub.id && d.attemptId === attemptId && d.provider === result.provider && d.model === result.cli && d.role === 'worker' && d.attached && d.submitted && d.skills?.some(s => s.id === skillId));
  if (deliveries.length !== 1) throw Error('No unique matching submitted worker Skill assignment.');
  const delivery = deliveries[0], skill = delivery.skills.find(s => s.id === skillId);
  if (!/^[a-f0-9]{64}$/.test(skill.contentHash) || !/^[a-f0-9]{64}$/.test(delivery.assignedPromptHash) || typeof (delivery.recordId || delivery.id) !== 'string' || !(delivery.recordId || delivery.id)) throw Error('Invalid assigned Skill transport provenance.');
  if (raw.tests.length > 100) throw Error('Too many worker-reported commands.');
  for (const command of raw.tests) safeText(command.command, 4000);
  const evidence = { projectId, projectRoot, attemptId, skillId, contentHash: skill.contentHash, resultId: result.resultId, subTaskId: sub.id, megaTaskId: mega.id, assignedModelId: sub.assignedModelId, provider: result.provider, model: result.cli, resultHash: hash(resultBytes), exitHash: hash(exitBytes), logHash: hash(logBytes), deliveryRecordId: delivery.recordId || delivery.id, assignedPromptHash: delivery.assignedPromptHash, sources, sourceFingerprint: hash(JSON.stringify([projectRoot, sources])), commands: raw.tests.map(t => ({ command: t.command, reportedStatus: t.status, provenance: 'worker-reported; not independently observed test execution' })), testExecutionVerified: false, procedureComplianceVerified: false };
  return { evidence, reviewHash: hash(JSON.stringify(evidence)) };
 }
 function prepare(input) {
  exactKeys(input, ['projectId','attemptId','skillId','referencePaths']); const observed = observe(input);
  const existing = store.candidates.find(c => c.reviewHash === observed.reviewHash);
  if (existing) return structuredClone(existing);
  const candidate = { candidateId: crypto.randomUUID(), ...observed, input: structuredClone(input), createdAt: now(), acceptance: 'pending-human-review', testExecutionVerified: false };
  store.candidates.push(candidate); store.candidates = store.candidates.slice(-500); save(); return structuredClone(candidate);
 }
 function accept(input) {
  exactKeys(input, ['projectId','candidateId','expectedHash','approved','reviewNote','principal']);
  if (input.principal !== 'user' || input.approved !== true) throw Error('Explicit human review acceptance is required.');
  const candidate = store.candidates.find(c => c.candidateId === input.candidateId && c.evidence.projectId === input.projectId);
  if (!candidate || input.expectedHash !== candidate.reviewHash) throw Error('Inspect the exact candidate review hash.');
  const fresh = observe(candidate.input); if (fresh.reviewHash !== candidate.reviewHash) throw Error('Procedure evidence changed; prepare and inspect a fresh candidate.');
  const reviewNote = safeText(input.reviewNote, 2000);
  const previous = store.accepted.find(a => a.candidateId === candidate.candidateId); if (previous) return structuredClone(previous);
  const accepted = { candidateId: candidate.candidateId, projectId: input.projectId, attemptId: candidate.evidence.attemptId, skillId: candidate.evidence.skillId, contentHash: candidate.evidence.contentHash, reviewHash: candidate.reviewHash, principal: 'user', acceptance: 'human-reviewed', reviewNote, acceptedAt: now(), testExecutionVerified: false, procedureComplianceVerified: false };
  store.accepted.push(accepted); save(); return structuredClone(accepted);
 }
 function suggest({ projectId }) {
  const existing = store.suggestions.filter(s => s.projectId === projectId).slice(-100).filter(s => { try { proposal(projectId, s.id); return true; } catch { return false; } }).map(s => structuredClone(s));
  const groups = new Map();
  for (const acceptance of store.accepted.filter(a => a.projectId === projectId)) {
   const candidate = store.candidates.find(c => c.candidateId === acceptance.candidateId); if (!candidate) continue;
   try { if (observe(candidate.input).reviewHash !== acceptance.reviewHash) continue; } catch { continue; }
   const key = acceptance.skillId + '@' + acceptance.contentHash, group = groups.get(key) || [];
   if (!group.some(c => c.evidence.attemptId === candidate.evidence.attemptId)) group.push(candidate); groups.set(key, group);
  }
  if (store.suggestions.some(s => s.projectId === projectId && Date.parse(now()) - Date.parse(s.at) < 7 * 86400000)) return { proposals: existing, fullAuto: false };
  for (const [procedureKey, group] of groups) {
   if (group.length < 3 || existing.some(s => s.procedureKey === procedureKey)) continue;
   const proposal = { id: crypto.randomUUID(), projectId, procedureKey, skillId: group[0].evidence.skillId, contentHash: group[0].evidence.contentHash, evidence: group.map(c => ({ candidateId: c.candidateId, attemptId: c.evidence.attemptId, reviewHash: c.reviewHash })), acceptance: 'human-reviewed', testExecutionVerified: false, procedureComplianceVerified: false, activationRequiresApproval: true, fullAuto: false, at: now() };
   store.suggestions.push(proposal); save(); return { proposals: [...existing, structuredClone(proposal)].slice(-100), fullAuto: false };
  }
  return { proposals: existing, fullAuto: false, reason: 'Three distinct fresh human-reviewed attempts for the same project Skill revision are required.' };
 }
 function proposal(projectId, id) {
  const stored = store.suggestions.find(p => p.projectId === projectId && p.id === id);
  if (!stored) throw Error('Assisted proposal does not belong to this project.');
  const candidates = [], attempts = new Set();
  for (const reference of stored.evidence) {
   const candidate = store.candidates.find(c => c.candidateId === reference.candidateId && c.evidence.projectId === projectId);
   const acceptance = store.accepted.find(a => a.projectId === projectId && a.candidateId === reference.candidateId && a.reviewHash === reference.reviewHash && a.principal === 'user' && a.acceptance === 'human-reviewed');
   if (!candidate || !acceptance || candidate.evidence.attemptId !== reference.attemptId || attempts.has(reference.attemptId) || acceptance.attemptId !== reference.attemptId || acceptance.skillId !== stored.skillId || acceptance.contentHash !== stored.contentHash || observe(candidate.input).reviewHash !== reference.reviewHash) throw Error('Assisted proposal evidence is stale or missing; inspect fresh human reviews.');
   attempts.add(reference.attemptId); candidates.push(candidate);
  }
  if (attempts.size < 3) throw Error('Three distinct accepted attempts are required.');
  const latest = candidates.at(-1);
  return { ...structuredClone(stored), proposal: structuredClone(stored), referencePaths: [...latest.input.referencePaths], sourceFingerprint: latest.evidence.sourceFingerprint, projectRoot: latest.evidence.projectRoot, humanReviewRequired: true, testExecutionVerified: false };
 }
 function evidenceSnapshot(projectId) {
  return { projectId, candidates: store.candidates.filter(c => c.evidence.projectId === projectId).slice(-100).map(c => structuredClone(c)), accepted: store.accepted.filter(a => a.projectId === projectId).slice(-100).map(a => structuredClone(a)), suggestions: store.suggestions.filter(p => p.projectId === projectId).slice(-100).map(p => structuredClone(p)), humanReviewRequired: true, testExecutionVerified: false, procedureComplianceVerified: false, fullAuto: false, activationRequiresApproval: true };
 }
 return { prepare, accept, suggest, proposal, snapshot: evidenceSnapshot };
}
module.exports = { createSkillProcedureEvidence };
