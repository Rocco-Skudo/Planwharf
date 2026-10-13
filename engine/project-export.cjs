'use strict';
const { summarizeTimeline } = require('./project-history.cjs');
// Export only known metadata. Never collect source, auth profiles or raw log files.
const forbidden = /^(?:credentials?|auth|authEnv|access.?token|refresh.?token|tokens?|api.?key|password|secret|environment|env|workerTail|thinking|log)$/i;
function sanitize(value) {
  if (typeof value === 'string') return value.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]').replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g, '[REDACTED]');
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !forbidden.test(key)).map(([key, item]) => [key, sanitize(item)]));
}
function exportProject(project, execution, settings = {}) {
  const id = project.project.id;
  const megaTasks = execution.megaTasks.filter(mega => mega.projectId === id);
  const ids = new Set(megaTasks.map(mega => mega.id));
  const data = { megaTasks, subTasks: execution.subTasks.filter(sub => ids.has(sub.megaTaskId)), results: execution.results.filter(result => ids.has(result.megaTaskId)),
    checkpoints: execution.checkpoints.filter(cp => cp.projectId === id), timeline: execution.timeline.filter(event => event.projectId === id) };
  const summary = summarizeTimeline(data.timeline, data);
  return sanitize({ format: 'planwharf-project-export', schema: 1, exportedAt: new Date().toISOString(), restoreSupported: false,
    project: project.project, revisions: project.revisions, tasks: project.tasks, notes: project.home?.notes || [], execution: data, timeline: summary,
    settings: { modelRoles: settings.modelRoles, accountModelRoles: settings.accountModelRoles, mode: settings.mode, orchestratorId: settings.orchestratorId, enabled: settings.enabled, providerEnabled: settings.providerEnabled },
    markdown: `# ${project.project.name}\n\n${project.revisions.at(-1).direction}\n\n` + summary.map(event => `- ${event.createdAt}: ${event.summary}`).join('\n') });
}
module.exports = { exportProject, sanitize };
