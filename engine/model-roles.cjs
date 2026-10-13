'use strict';
const ROLE_IDS = ['orchestrator', 'worker', 'reviewer'];
function roleEligibility(model) {
  const tools = model.capabilities?.canUseTools !== false && model.capabilities?.canInspectFilesystem !== false;
  return {
    orchestrator: tools && (model.orchestratorEligible ?? model.capabilities?.orchestratorEligible ?? model.capabilities?.canOrchestrate ?? model.kind !== 'local'),
    worker: model.workerEligible !== false && model.capabilities?.workerEligible !== false,
    reviewer: tools && (model.reviewerEligible ?? model.capabilities?.reviewerEligible ?? model.workerEligible !== false)
  };
}
function withModelRoles(model, preferences = {}) {
  const eligibility = roleEligibility(model);
  const roles = Object.fromEntries(ROLE_IDS.map(role => [role, Boolean(eligibility[role] && (preferences[role] ?? model.roles?.[role] ?? true))]));
  return { ...model, roleEligibility: eligibility, roles };
}
function assignmentRole(job = {}) {
  return job?.type === 'AUDIT' || job?.kind === 'audit' || job?.kind === 'review' ? 'reviewer' : 'worker';
}
function permitsAssignment(model, job) {
  const role = assignmentRole(job);
  const resolved = withModelRoles(model);
  return resolved.roles[role] === true;
}
module.exports = { ROLE_IDS, roleEligibility, withModelRoles, assignmentRole, permitsAssignment };
