(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function fields(provider, providers, draft) {
    const policy = draft || provider.policy || {};
    const permissionHelp = provider.adapter === 'codex' ? 'YOLO off: tools stay in the workspace sandbox without network access or automatic escalation.'
      : provider.adapter === 'grok' ? 'YOLO off: Grok denies tool requests that its permission rules do not already allow.'
      : provider.adapter === 'antigravity' ? 'YOLO off: launches are blocked because restricted unattended execution is not supported yet.'
      : 'Permission behavior depends on this provider adapter.';
    return `<form class="model-policy-form" data-provider-policy="${escape(provider.id)}"><fieldset><legend>${escape(provider.label || provider.id)}</legend>
      <p class="muted model-policy-scope">Applies to every model under ${escape(provider.label || provider.id)} (${escape(provider.id)}), including models added later.</p>
      ${provider.policySource === 'legacy' ? '<p class="notice">Earlier model settings were combined conservatively for this provider. Review and save the provider policy.</p>' : ''}
      <p class="muted" data-policy-edit-status role="status">${draft ? 'Unsaved changes for this provider.' : 'Showing saved settings for this provider.'}</p>
      <label>Stop when remaining quota reaches (%)<input name="minRemainingPercent" type="number" min="0" max="100" step="any" value="${escape(policy.minRemainingPercent)}" placeholder="No custom limit"></label>
      <label>Warn when remaining quota reaches (%)<input name="warningRemainingPercent" type="number" min="0" max="100" step="any" value="${escape(policy.warningRemainingPercent)}" placeholder="Automatic: 10 points above stop threshold"></label>
      <p class="muted">Example: stop at 20% remaining and warn at 30%. Leave warning empty for an automatic warning 10 percentage points before the stop threshold, capped at 100%. A custom warning must be higher than the stop threshold.</p>
      <label>Fallback provider at limit<select name="fallbackProviderId"><option value="">Pause: no fallback</option><option value="@automatic" ${policy.fallbackProviderId === '@automatic' ? 'selected' : ''}>Automatic: another eligible provider</option>${providers.filter(other => other.id !== provider.id).map(other => `<option value="${escape(other.id)}" ${policy.fallbackProviderId === other.id ? 'selected' : ''}>${escape(other.label || other.id)} (${escape(other.id)})</option>`).join('')}</select></label>
      <label class="model-policy-toggle"><input type="checkbox" name="alwaysApprove" ${policy.alwaysApprove !== false ? 'checked' : ''}> Always approve / YOLO</label>
      <p class="muted">${escape(permissionHelp)} Changes apply to future calls; running calls can exceed a sampled quota limit.</p>
      <p role="status">${escape(provider.usagePolicy?.reason || (provider.usagePolicy?.state === 'warning' ? 'Approaching this provider usage limit.' : 'All models under this provider share these limits and permissions. Other providers have separate settings.'))}</p>
      <p class="muted">Automatic fallback chooses an eligible enabled model from another provider in catalog order, respecting its own limits and permissions. Every switch records the exact provider and model. If none qualifies, work pauses.</p>
      <div class="model-policy-actions"><button type="submit" class="secondary compact">Save provider policy</button><button type="button" class="secondary compact" data-policy-discard ${draft ? '' : 'disabled'}>Discard changes</button></div></fieldset></form>`;
  }
  function section(providers, selectedId, draft) {
    const selected = providers.find(provider => provider.id === selectedId) || providers[0];
    return `<section class="dash-section dash-zone-policy" aria-label="Usage and permissions"><h3>Usage and permissions</h3>
      <label class="model-policy-selector">Provider<select data-policy-provider-select aria-label="Provider for usage and permissions" ${selected ? '' : 'disabled'}>${providers.map(provider => `<option value="${escape(provider.id)}" ${provider.id === selected?.id ? 'selected' : ''}>${escape(provider.label || provider.id)}</option>`).join('') || '<option>No providers configured</option>'}</select></label>
      <button type="button" class="secondary compact" data-add-provider>Add API / CLI connection</button>
      ${selected ? fields(selected, providers, draft) : '<p class="muted">Configure a provider to set usage limits and permissions.</p>'}</section>`;
  }
  function openConnection(save) {
    const dialog = document.createElement('dialog'); dialog.className = 'provider-connection-dialog';
    dialog.innerHTML = `<form class="model-policy-form"><h2>Add provider connection</h2>
      <p>No inference requests are made when saving. API billing is separate from chat subscriptions. Exact model IDs and tool support must match your provider account.</p>
      <label>Provider ID<input name="id" required pattern="[a-z][a-z0-9-]{0,63}" placeholder="deepseek"></label>
      <label>Display name<input name="label" required maxlength="100" placeholder="DeepSeek"></label>
      <label>Connection type<select name="adapter"><option value="openai">OpenAI-compatible API</option><option value="anthropic">Anthropic Messages API</option><option value="cli">Configured CLI</option></select></label>
      <fieldset data-api-fields><legend>API connection</legend>
        <label>Base URL<input name="baseUrl" placeholder="https://api.deepseek.com"></label>
        <label>API key environment variable name<input name="authEnv" placeholder="DEEPSEEK_API_KEY"></label>
        <p class="muted">Set the variable before starting Planwharf. Leave empty only for an endpoint that needs no key. Never paste the key here.</p>
        <label>Maximum output tokens per response<input name="maxOutputTokens" type="number" min="1" max="65536" value="4096"></label>
        <label>Maximum API rounds per call<input name="maxTurns" type="number" min="1" max="100" value="30"></label>
        <p class="muted">These request bounds are not a currency budget. Provider quota percentages are unavailable unless a verified quota reader exists.</p>
      </fieldset>
      <fieldset data-cli-fields hidden disabled><legend>CLI connection</legend>
        <label>Native executable<input name="cliCommand" placeholder="Full executable path or PATH name"></label>
        <label>Arguments (JSON array, include {model})<textarea name="cliArgs">["--model", "{model}"]</textarea></label>
        <label>YOLO arguments (JSON array)<textarea name="yoloArgs">[]</textarea></label>
        <label>Restricted arguments (JSON array)<textarea name="restrictedArgs">[]</textarea></label>
        <label>Structured output protocol<select name="outputProtocol"><option>codex-jsonl</option><option>messages-jsonl</option><option>antigravity-jsonl</option></select></label>
        <p class="muted">Prompt is passed on stdin. The CLI must implement the selected event protocol. Configure its real permission flags; an empty array adds no restrictions.</p>
      </fieldset>
      <label>Exact model IDs, one per line<textarea name="modelIds" required></textarea></label>
      <label class="model-policy-toggle"><input name="toolsEnabled" type="checkbox"> These models support tools; enable lead and worker roles</label>
      <p class="muted">YOLO starts off. API workers can edit workspace files; shell commands require YOLO. Source-protected research is unavailable for these adapters.</p>
      <p data-connection-error role="alert"></p><div class="model-policy-actions"><button type="submit">Add connection</button><button type="button" data-close>Cancel</button></div></form>`;
    document.body.appendChild(dialog);
    const form = dialog.querySelector('form');
    form.elements.adapter.addEventListener('change', () => {
      const cli = form.elements.adapter.value === 'cli';
      for (const [selector, enabled] of [['[data-api-fields]', !cli], ['[data-cli-fields]', cli]]) { const field = form.querySelector(selector); field.hidden = !enabled; field.disabled = !enabled; }
    });
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => dialog.remove());
    form.addEventListener('submit', async event => {
      event.preventDefault(); const e = form.elements, button = form.querySelector('[type=submit]'); button.disabled = true;
      try {
        const input = { id: e.id.value.trim(), label: e.label.value.trim(), adapter: e.adapter.value === 'cli' ? 'configured-cli' : 'api', modelIds: e.modelIds.value.trim().split(/\s+/), toolsEnabled: e.toolsEnabled.checked };
        if (input.adapter === 'api') Object.assign(input, { baseUrl: e.baseUrl.value.trim(), ...(e.authEnv.value.trim() ? { authEnv: e.authEnv.value.trim() } : {}), apiProtocol: e.adapter.value, maxOutputTokens: Number(e.maxOutputTokens.value), maxTurns: Number(e.maxTurns.value) });
        else Object.assign(input, { cliCommand: e.cliCommand.value.trim(), cliArgs: JSON.parse(e.cliArgs.value), yoloArgs: JSON.parse(e.yoloArgs.value), restrictedArgs: JSON.parse(e.restrictedArgs.value), outputProtocol: e.outputProtocol.value });
        await save(input); dialog.close();
      } catch (error) { dialog.querySelector('[data-connection-error]').textContent = error.message; }
      finally { button.disabled = false; }
    });
    dialog.showModal();
  }
  function read(form) {
    return { minRemainingPercent: form.elements.minRemainingPercent.value === '' ? null : Number(form.elements.minRemainingPercent.value),
      warningRemainingPercent: form.elements.warningRemainingPercent.value === '' ? null : Number(form.elements.warningRemainingPercent.value),
      fallbackProviderId: form.elements.fallbackProviderId.value || null, alwaysApprove: form.elements.alwaysApprove.checked };
  }
  function createAlerts() {
    const previous = new Map();
    return snapshot => {
      const active = new Set();
      const changed = [];
      for (const row of snapshot.usageAlerts || []) {
        const scope = row.providerId || row.modelId;
        active.add(scope);
        const key = [row.state, row.minRemainingPercent, row.warningRemainingPercent].join(':');
        if (previous.get(scope) !== key) changed.push(`${row.label}: ${row.reason || `Quota remaining ${row.remainingPercent?.toFixed(1)}%, warning at ${row.warningRemainingPercent}%.`}`);
        previous.set(scope, key);
      }
      for (const id of previous.keys()) if (!active.has(id)) previous.delete(id);
      if (snapshot.orchestratorFallbackFrom) {
        const key = snapshot.orchestratorFallbackFrom + ':' + snapshot.orchestratorId;
        if (previous.get('fallback') !== key) changed.push(`Usage limit: lead switched from ${snapshot.orchestratorFallbackFrom} to ${snapshot.orchestratorId}.`);
        previous.set('fallback', key);
      } else previous.delete('fallback');
      if (!changed.length || !root.document?.createElement) return;
      let dialog = document.getElementById('usage-policy-alert');
      if (!dialog) {
        dialog = document.createElement('dialog'); dialog.id = 'usage-policy-alert';
        dialog.innerHTML = '<h2>Provider quota notice</h2><p data-usage-alert-text></p><form method="dialog"><button>Dismiss</button></form>';
        document.body.appendChild(dialog);
      }
      dialog.querySelector('[data-usage-alert-text]').textContent = changed.join('\n');
      if (!dialog.open) dialog.showModal?.();
    };
  }
  root.PlanwharfModelPolicyUI = { fields, section, read, createAlerts, openConnection };
})(globalThis);
