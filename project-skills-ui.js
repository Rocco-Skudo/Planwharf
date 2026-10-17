(() => {
  'use strict';
  const host = document.getElementById('project-skills-panel');
  if (!host) return;
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const summary = element('summary', 'Project Skills catalog'); host.append(summary);
  host.append(element('p', 'Opt in per project to deliver approved Skills as instructions for new executions. This replaces the legacy Matt Skills pipeline for that project. Native loading, compliance and successful procedure execution remain unverified.', 'muted'));
  const status = element('p', 'Select a project to prepare its catalog.', 'muted'); status.setAttribute('role', 'status'); host.append(status);
  const controls = element('div', undefined, 'workspace-session-controls'); host.append(controls);
  const mode = element('select'); mode.id = 'project-skills-mode';
  for (const [value, label] of [['auto', 'Auto'], ['manual', 'Manual']]) { const option = element('option', label); option.value = value; mode.append(option); }
  const label = element('label', 'Project selection mode '); label.append(mode); controls.append(label);
  const search = element('input'); search.type = 'search'; search.placeholder = 'Find skills'; search.setAttribute('aria-label', 'Search project Skills'); controls.append(search);
  const source = element('select'); source.setAttribute('aria-label', 'Filter Skill source');
  for (const [value, name] of [['', 'All sources'], ['matt', 'Matt'], ['ecc', 'ECC'], ['project-local', 'Project local']]) { const option = element('option', name); option.value = value; source.append(option); } controls.append(source);
  const button = (name, action, parent = controls) => { const node = element('button', name, 'secondary compact'); node.type = 'button'; node.addEventListener('click', action); parent.append(node); return node; };
  const refresh = button('Refresh catalog', () => load());
  const discover = button('Discover local Skills', () => mutate('/discover', {}));
  const selectionSettings = element('fieldset'); controls.append(selectionSettings); selectionSettings.append(element('legend', 'Execution selection restrictions'));
  function preferenceCheckbox(labelText, changed) { const input = element('input'); input.type = 'checkbox'; const label = element('label', labelText + ' '); label.prepend(input); selectionSettings.append(label); input.addEventListener('change', () => changed(input.checked)); return input; }
  const deliveryEnabled = preferenceCheckbox('Use project Skills for new executions', value => mutate('/settings', { settings: { deliveryEnabled: value } })); deliveryEnabled.id = 'project-skills-delivery-enabled';
  const allowedSources = new Map();
  selectionSettings.append(element('p', 'Allowed sources restrict execution selection. The source filter above only changes this catalog view.', 'muted'));
  for (const [id, name] of [['matt', 'Matt'], ['ecc', 'ECC'], ['project-local', 'Project local']]) allowedSources.set(id, preferenceCheckbox('Allow ' + name + ' for execution', checked => { const values = new Set(preferences.sources || []); checked ? values.add(id) : values.delete(id); mutate('/settings', { settings: { sources: [...values] } }); }));
  const testingSeamsApproved = preferenceCheckbox('I approve the existing testing seams for TDD selection in this project', value => mutate('/settings', { settings: { testingSeamsApproved: value } }));
  const list = element('div'); host.append(list);
  const deliveriesRegion = element('section'); host.append(deliveriesRegion);
  const draftsRegion = element('section'); host.append(draftsRegion);
  const proceduresRegion = element('section'); host.append(proceduresRegion);
  // Session-only text caches preserve unsent work without storing approvals or sensitive text on disk.
  const draftForms = new Map(), draftEdits = new Map(), procedureForms = new Map(), reviewNotes = new Map(), suggestionForms = new Map();
  let projectId = '', generation = 0, preferences = {}, busy = false, timer;
  const activeProject = () => document.getElementById('project-select')?.value || document.getElementById('orch-project')?.value || '';
  const alive = (id, revision) => id === projectId && revision === generation && id === activeProject();
  async function request(route, values, post) {
    const response = await fetch('/api/project-skills' + route + (post ? '' : '?' + new URLSearchParams(values)), post ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) } : {});
    const body = await response.json(); if (!response.ok) throw Error(body.error || body.message || 'Catalog request failed.'); return body;
  }
  function disabled(value) { busy = value; controls.querySelectorAll('button,select,input').forEach(node => { node.disabled = value || !projectId; }); list.querySelectorAll('button,input').forEach(node => { node.disabled = value; }); draftsRegion.querySelectorAll('button,input,textarea').forEach(node => { node.disabled = value || !projectId; }); proceduresRegion.querySelectorAll('button,input,textarea').forEach(node => { node.disabled = value || !projectId || node.dataset.reviewIncomplete === 'true'; }); }
  async function load() {
    const id = projectId, revision = ++generation; list.replaceChildren(); draftsRegion.replaceChildren(); deliveriesRegion.replaceChildren(); proceduresRegion.replaceChildren();
    if (!id) { deliveryEnabled.checked = false; testingSeamsApproved.checked = false; for (const input of allowedSources.values()) input.checked = false; status.textContent = 'Select a project to prepare its catalog.'; disabled(false); return; }
    status.textContent = 'Loading catalog for ' + id + '…'; disabled(true);
    try {
      const body = await request('', { projectId: id, query: search.value, source: source.value });
      if (!alive(id, revision)) return; preferences = body.preferences || {}; mode.value = preferences.mode || 'auto'; deliveryEnabled.checked = preferences.deliveryEnabled === true; testingSeamsApproved.checked = preferences.testingSeamsApproved === true; for (const [id, input] of allowedSources) input.checked = (preferences.sources || []).includes(id); render(body.catalog || []); renderDeliveries(body.deliveries || []); await loadDrafts(id, revision); if (!alive(id, revision)) return; await loadProcedures(id, revision); if (!alive(id, revision)) return;
      status.textContent = 'Project: ' + id + '. ' + (preferences.deliveryEnabled ? 'Project Skills delivery enabled for new executions.' : 'Project Skills delivery is off; existing legacy controls apply.') + ' Native loading and procedure success remain unverified.';
    } catch (error) { if (alive(id, revision)) status.textContent = error.message; }
    finally { if (alive(id, revision)) disabled(false); }
  }
  async function mutate(route, values) {
    if (!projectId || busy) return;
    const id = projectId, revision = generation; disabled(true); status.textContent = 'Saving catalog choice for ' + id + '…';
    try { await request(route, { projectId: id, ...values }, true); if (alive(id, revision)) await load(); }
    catch (error) { if (alive(id, revision)) { status.textContent = error.message; disabled(false); } }
  }
  function render(rows) {
    list.replaceChildren();
    if (!rows.length) list.append(element('p', 'No matching Skills. Discover local Skills or change the filters.', 'muted'));
    for (const item of rows) {
      const card = element('section', undefined, 'notice'); card.append(element('h3', item.name || item.id));
      card.append(element('p', item.description || 'No description available.'));
      card.append(element('p', [item.source, item.revision, item.license, item.installed ? 'Installed' : 'Not downloaded', item.approved ? 'Approved for this content' : 'Not approved'].filter(Boolean).join(' · '), 'muted'));
      for (const warning of item.warnings || []) card.append(element('p', warning, 'muted'));
      const actions = element('div', undefined, 'details-controls'); card.append(actions);
      const manual = element('input'); manual.type = 'checkbox'; manual.checked = (preferences.selected || []).includes(item.id); manual.disabled = busy;
      const manualLabel = element('label', 'Include in Manual selection '); manualLabel.prepend(manual); card.append(manualLabel);
      manual.addEventListener('change', () => { const selected = new Set(preferences.selected || []); manual.checked ? selected.add(item.id) : selected.delete(item.id); mutate('/settings', { settings: { selected: [...selected] } }); });
      for (const [key, text] of [['disabled', 'Disable this Skill for execution'], ['exclusions', 'Exclude this Skill from project task selection']]) {
        const input = element('input'); input.type = 'checkbox'; input.checked = (preferences[key] || []).includes(item.id); const label = element('label', text + ' '); label.prepend(input); card.append(label);
        input.addEventListener('change', () => { const values = new Set(preferences[key] || []); input.checked ? values.add(item.id) : values.delete(item.id); mutate('/settings', { settings: { [key]: [...values] } }); });
      }
      const inspectRegion = element('div'); card.append(inspectRegion);
      if (item.reviewed === false || item.downloadable === false) {
        card.append(element('p', 'Unsupported native dependencies — metadata only. Download and execution are disabled.', 'muted'));
      } else if (!item.installed) {
        const consent = element('input'); consent.type = 'checkbox'; const consentLabel = element('label', 'I approve downloading this pinned source text and license. '); consentLabel.prepend(consent); card.append(consentLabel);
        button('Download approved source', () => { if (!consent.checked) { status.textContent = 'Approve this download first. Downloading does not enable the Skill.'; return; } mutate('/install', { id: item.id, approved: true }); }, actions);
      } else {
        button('Inspect installed content', async () => {
          if (busy) return; const id = projectId, revision = generation; disabled(true); inspectRegion.replaceChildren();
          try {
            const content = await request('/content', { projectId: id, id: item.id }); if (!alive(id, revision)) return;
            inspectRegion.append(element('p', 'Inspected content hash: ' + content.contentHash, 'muted'));
            for (const [name, text] of Object.entries(content.texts || {})) { const details = element('details'); details.append(element('summary', name)); const pre = element('pre', text); pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere'; details.append(pre); inspectRegion.append(details); }
            const consent = element('input'); consent.type = 'checkbox'; const consentLabel = element('label', 'I approve enabling exactly this inspected content for this project. '); consentLabel.prepend(consent); inspectRegion.append(consentLabel);
            button('Enable inspected content', () => { if (!alive(id, revision)) return; if (!consent.checked) { status.textContent = 'Approve the inspected content before enabling.'; return; } mutate('/approve', { id: item.id, enabled: true, contentHash: content.contentHash }); }, inspectRegion);
          } catch (error) { if (alive(id, revision)) status.textContent = error.message; }
          finally { if (alive(id, revision)) disabled(false); }
        }, actions);
        if (item.approved) button('Revoke approval', () => mutate('/approve', { id: item.id, enabled: false }), actions);
      }
      list.append(card);
    }
  }

  function renderDeliveries(rows) {
    deliveriesRegion.replaceChildren(element('h3', 'Recent Skill delivery evidence'));
    deliveriesRegion.append(element('p', 'Attachment records show selected instructions. Submitted means the runner observed transport delivery; it does not prove native loading, compliance or successful execution.', 'muted'));
    if (!rows.length) deliveriesRegion.append(element('p', 'No delivery records for this project.', 'muted'));
    for (const row of rows.slice(-12).reverse()) {
      const card = element('details'); card.append(element('summary', (row.role || 'Unknown role') + ' · ' + (row.provider || 'Unknown provider') + ' / ' + (row.model || 'Unknown model') + ' · ' + (row.submitted ? 'Submitted to transport' : row.transport === 'prompt-file-prepared-read-unverified' ? 'Prompt file prepared; provider read unverified' : row.attached ? 'Attached; transport unconfirmed' : 'No Skills attached')));
      card.append(element('p', 'Attempt: ' + (row.attemptId || 'Not recorded') + ' · Task: ' + (row.taskId || 'Not recorded') + ' · Record: ' + (row.recordId || row.id || 'Not recorded'), 'muted'));
      card.append(element('p', 'Observed transport: ' + (row.transport || 'Not recorded') + '. Remote provider acceptance: unverified; API stdin submission confirms local bridge delivery only.', 'muted'));
      card.append(element('p', 'Native loaded: unverified · Followed: unverified · Procedure verified: unverified', 'muted'));
      for (const skill of row.skills || []) {
        card.append(element('p', 'Attached Skill: ' + skill.id + ' · Content hash: ' + skill.contentHash, 'muted'));
        card.append(element('p', 'Selection reason: ' + (skill.reason || 'Not retained for this assignment.'), 'muted'));
      }
      for (const rejected of row.rejected || []) card.append(element('p', 'Not selected: ' + rejected.id + ' · ' + rejected.reason, 'muted'));
      deliveriesRegion.append(card);
    }
  }

  async function loadDrafts(id, revision) {
    try {
      const body = await request('/drafts', { projectId: id }); if (!alive(id, revision)) return;
      draftsRegion.replaceChildren(); draftsRegion.append(element('h3', 'Project Skill drafts'));
      draftsRegion.append(element('p', 'Write a reusable procedure from selected project references. Approval saves a project file; it does not activate the Skill. Human-reviewed suggestions below can prepare assisted drafts. Automatic generation is unavailable.', 'muted'));
      const form = element('form'); draftsRegion.append(form);
      const cachedForm = draftForms.get(id) || {};
      draftForms.set(id, cachedForm);
      const field = (labelText, name, multiline) => { const label = element('label', labelText + ' '); const input = element(multiline ? 'textarea' : 'input'); input.name = name; input.value = cachedForm[name] || ''; input.addEventListener('input', () => { cachedForm[name] = input.value; }); input.required = true; if (multiline) input.rows = 4; label.append(input); form.append(label); return input; };
      const name = field('Skill name (lowercase letters, numbers and hyphens)', 'name'); name.pattern = '[a-z0-9][a-z0-9-]{0,63}'; name.maxLength = 64;
      const description = field('Description', 'description'); description.maxLength = 500;
      const procedure = field('Procedure', 'procedure', true);
      const references = field('Authorized project reference paths, one per line', 'references', true);
      const requested = element('input'); requested.type = 'checkbox'; requested.required = true; const consent = element('label', 'I request this draft using only the listed project references. '); consent.prepend(requested); form.append(consent);
      const create = element('button', 'Create manual draft', 'secondary compact'); create.type = 'submit'; form.append(create);
      form.addEventListener('submit', event => { event.preventDefault(); if (!alive(id, revision) || !requested.checked) return; mutate('/drafts/create', { name: name.value, description: description.value, procedure: procedure.value, references: references.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean), requested: true }); });
      for (const draft of body.drafts || []) {
        const region = element('details'); region.append(element('summary', draft.name + ' · ' + draft.status));
        region.append(element('p', 'Draft revision: ' + draft.revision + ' · Mode: ' + (draft.mode || 'manual'), 'muted'));
        if (draft.mode === 'assisted-human-reviewed') region.append(element('p', 'Prepared from human-reviewed evidence. Test execution and procedure compliance remain unverified; approval saves a file without activating it.', 'muted'));
        region.append(element('p', 'References: ' + (draft.evidence || []).map(row => row.relative).join(', '), 'muted'));
        const editKey = JSON.stringify([id, draft.id, draft.revision]);
        const content = element('textarea'); content.value = draft.status === 'draft' && draftEdits.has(editKey) ? draftEdits.get(editKey) : draft.content; content.rows = 12; content.setAttribute('aria-label', 'Inspect or edit ' + draft.name + ' draft content'); content.readOnly = draft.status !== 'draft'; region.append(content);
        if (draft.status === 'draft') {
          button('Save draft edits', () => { if (alive(id, revision)) mutate('/drafts/edit', { id: draft.id, revision: draft.revision, content: content.value }); }, region);
          const approved = element('input'); approved.type = 'checkbox'; const approval = element('label', 'I approve saving exactly this inspected draft revision to the project folder. '); approval.prepend(approved); region.append(approval);
          content.addEventListener('input', () => { draftEdits.set(editKey, content.value); approved.checked = false; });
          button('Approve and save project file', () => {
            if (!alive(id, revision)) return;
            if (content.value !== draft.content) { status.textContent = 'Save your edits and inspect the new revision before approval.'; return; }
            if (!approved.checked) { status.textContent = 'Approve this inspected revision before saving the project file.'; return; }
            mutate('/drafts/approve', { id: draft.id, revision: draft.revision, approved: true });
          }, region);
        } else region.append(element('p', 'Saved project file. Discover local Skills, inspect its content, and approve it separately to prepare catalog selection.', 'muted'));
        draftsRegion.append(region);
      }
    } catch (error) { if (alive(id, revision)) draftsRegion.replaceChildren(element('p', 'Manual drafts unavailable: ' + error.message, 'muted')); }
  }


  async function loadProcedures(id, revision) {
    try {
      const body = await request('/procedures', { projectId: id }); if (!alive(id, revision)) return;
      proceduresRegion.replaceChildren(element('h3', 'Human review of procedure evidence'));
      proceduresRegion.append(element('p', 'Human acceptance records your review of matching backend assignments and references. Worker-reported commands are not automated proof that tests executed. Test execution and procedure compliance remain unverified, including after human acceptance.', 'muted'));
      proceduresRegion.append(element('p', 'Suggestions require three distinct freshly human-accepted attempts for the same Skill revision. Suggestion creation is limited to once per project per week; a suggestion never activates a Skill.', 'muted'));
      const cache = procedureForms.get(id) || {}; procedureForms.set(id, cache);
      const form = element('form'); proceduresRegion.append(form);
      function field(parent, caption, name, values, multiline = false) {
        const label = element('label', caption + ' '), input = element(multiline ? 'textarea' : 'input'); input.name = name; input.required = true; input.value = values[name] || ''; if (multiline) input.rows = 4;
        input.addEventListener('input', () => { values[name] = input.value; }); label.append(input); parent.append(label); return input;
      }
      const attempt = field(form, 'Completed assignment attempt ID', 'attemptId', cache);
      const skill = field(form, 'Assigned Skill ID', 'skillId', cache);
      const refs = field(form, 'Authorized project reference paths, one per line', 'referencePaths', cache, true);
      const prepare = element('button', 'Prepare evidence for human review', 'secondary compact'); prepare.type = 'submit'; form.append(prepare);
      form.addEventListener('submit', event => { event.preventDefault(); if (alive(id, revision)) mutate('/procedures/prepare', { attemptId: attempt.value, skillId: skill.value, referencePaths: refs.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }); });
      const accepted = Array.isArray(body.accepted) ? body.accepted : [];
      for (const candidate of (body.candidates || []).slice(-100).reverse()) {
        const card = element('details'), evidence = candidate.evidence || {};
        const acceptance = accepted.find(row => row.candidateId === candidate.candidateId && row.reviewHash === candidate.reviewHash);
        card.append(element('summary', (evidence.skillId || 'Skill') + ' · ' + (evidence.attemptId || 'Attempt') + ' · ' + (acceptance ? 'HUMAN accepted' : 'Awaiting HUMAN review')));
        card.append(element('p', 'Exact review hash: ' + candidate.reviewHash, 'muted'));
        const metadata = JSON.stringify({ input: candidate.input, evidence }, null, 2), complete = metadata.length <= 65536;
        const pre = element('pre', complete ? metadata : metadata.slice(0, 65536) + '\n[Preview truncated. Acceptance disabled; inspect bounded evidence through another view.]'); pre.style.whiteSpace = 'pre-wrap'; pre.style.overflowWrap = 'anywhere'; card.append(pre);
        card.append(element('p', 'Commands above are worker-reported; neither a fixture result nor a human checkbox proves test execution.', 'muted'));
        if (acceptance) card.append(element('p', 'Human review note: ' + acceptance.reviewNote, 'muted'));
        else {
          const key = JSON.stringify([id, candidate.candidateId, candidate.reviewHash]), notes = reviewNotes.get(key) || {}; reviewNotes.set(key, notes);
          const note = field(card, 'Your human review note', 'reviewNote', notes, true); note.maxLength = 2000;
          const consent = element('input'); consent.type = 'checkbox'; const label = element('label', 'I have inspected this exact evidence and accept it as a HUMAN review; test execution remains unverified. '); label.prepend(consent); card.append(label);
          const accept = button('Accept inspected evidence as human review', () => {
            if (!alive(id, revision) || !complete) return;
            if (!consent.checked || !note.value.trim()) { status.textContent = 'Inspect the evidence, enter your review note, and explicitly accept the human review.'; return; }
            mutate('/procedures/accept', { candidateId: candidate.candidateId, expectedHash: candidate.reviewHash, approved: true, reviewNote: note.value });
          }, card); if (!complete) accept.dataset.reviewIncomplete = 'true';
        }
        proceduresRegion.append(card);
      }
      for (const proposal of (body.suggestions || []).slice(-100).reverse()) {
        const card = element('details'); card.append(element('summary', 'Human-reviewed suggestion · ' + proposal.skillId));
        card.append(element('p', 'Suggestion: ' + proposal.id + ' · Source Skill revision: ' + proposal.contentHash, 'muted'));
        card.append(element('p', 'Human-accepted attempts: ' + (proposal.evidence || []).map(row => row.attemptId).join(', ') + '. Automated test execution and procedure compliance remain unverified.', 'muted'));
        const key = JSON.stringify([id, proposal.id]), values = suggestionForms.get(key) || {}; suggestionForms.set(key, values);
        const form = element('form'); card.append(form);
        const name = field(form, 'New Skill name', 'name', values); name.pattern = '[a-z0-9][a-z0-9-]{0,63}'; name.maxLength = 64;
        const description = field(form, 'Description', 'description', values); description.maxLength = 500;
        const procedure = field(form, 'Procedure to draft', 'procedure', values, true);
        const consent = element('input'); consent.type = 'checkbox'; consent.required = true; const label = element('label', 'I request a draft from this human-reviewed suggestion; it will remain inactive until separate inspection and approvals. '); label.prepend(consent); form.append(label);
        const create = element('button', 'Draft from suggestion', 'secondary compact'); create.type = 'submit'; form.append(create);
        form.addEventListener('submit', event => { event.preventDefault(); if (!alive(id, revision) || !consent.checked) return; mutate('/drafts/create-assisted', { proposalId: proposal.id, name: name.value, description: description.value, procedure: procedure.value, requested: true }); });
        proceduresRegion.append(card);
      }
    } catch (error) { if (alive(id, revision)) proceduresRegion.replaceChildren(element('p', 'Human procedure review unavailable: ' + error.message, 'muted')); }
  }

  mode.addEventListener('change', () => mutate('/settings', { settings: { mode: mode.value } }));
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); }); source.addEventListener('change', () => load());
  function sync() { const next = activeProject(); if (next === projectId) return; projectId = next; preferences = {}; clearTimeout(timer); load(); }
  document.addEventListener('change', event => { if (['project-select', 'orch-project', 'dashboard-orch-project'].includes(event.target.id)) sync(); }, true);
  const observer = new MutationObserver(sync); for (const id of ['project-select', 'orch-project']) { const node = document.getElementById(id); if (node) observer.observe(node, { childList: true, subtree: true, attributes: true }); }
  host.addEventListener('toggle', () => { if (host.open) { sync(); if (projectId && !busy) load(); } });
  disabled(false); sync();
})();
