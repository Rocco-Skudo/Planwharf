'use strict';
function summarizeTimeline(events, execution) {
  const groups = new Map(), milestones = [];
  for (const event of events) {
    const id = event.reference?.megaTaskId;
    if (!id) { milestones.push(event); continue; }
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(event);
  }
  for (const [id, evidence] of groups) {
    const mega = execution.megaTasks.find(mega => mega.id === id);
    if (!mega) { milestones.push(...evidence); continue; }
    const results = execution.results.filter(result => result.megaTaskId === id && result.status === 'COMPLETE');
    const last = evidence.at(-1);
    milestones.push({ ...last, id: 'milestone:' + id, type: 'MEGATASK_MILESTONE',
      summary: `${mega.status === 'COMPLETE' ? 'Completed ' : ''}${mega.title}: ${mega.status}. ${results.length ? results.map(result => result.summary).join(' ').slice(0, 600) : ''}`.trim(),
      evidenceCount: evidence.length, evidence });
  }
  return milestones.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function checkpointDiff(checkpoint, current, planRevisionId, completed = []) {
  const before = checkpoint.repoState;
  const changes = [];
  if (before.repoHead !== current.repoHead) changes.push(`HEAD changed from ${before.repoHead || 'unavailable'} to ${current.repoHead || 'unavailable'}`);
  if (before.fingerprint !== current.fingerprint) changes.push(`External repository changes detected; ${current.dirtyFiles.length} files currently changed locally`);
  if (checkpoint.planRevisionId !== planRevisionId) changes.push(`Living Plan changed from R${checkpoint.planRevisionId} to R${planRevisionId}`);
  if (!before.comparable || !current.comparable) changes.push('Repository comparison is incomplete; inspect technical evidence before Resume');
  const newlyComplete = completed.filter(id => !(checkpoint.completedSubTaskIds || []).includes(id));
  if (newlyComplete.length) changes.push(`${newlyComplete.length} previously pending SubTask(s) already completed; these will not be replayed`);
  return { changes, requiresConfirmation: changes.some(text => !text.includes('will not be replayed')), before, current };
}
module.exports = { summarizeTimeline, checkpointDiff };
