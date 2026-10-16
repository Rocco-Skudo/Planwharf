'use strict';
(() => {
  const SETTINGS_KEY = 'planwharf_harbor_v2';
  const SESSION_KEY = 'planwharf_harbor_v2_ensign';
  const FLAGS = {
    classic: { name: 'Nautical', field: '#163c59', ink: '#f5e8ba', art: '<path d="M0 24h96M32 0v64" stroke="#f5e8ba" stroke-width="10"/><path d="M0 24h96M32 0v64" stroke="#b64d50" stroke-width="4"/>' },
    tech: { name: 'Technology', field: '#123e42', ink: '#92e2cd', art: '<path d="M0 12h24l12 20h24l12 20h24M0 52h24l12-20h24l12-20h24" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="48" cy="32" r="10" fill="none" stroke="currentColor" stroke-width="3"/>' },
    exploration: { name: 'Exploration', field: '#292c54', ink: '#ead49b', art: '<circle cx="48" cy="32" r="23" fill="none" stroke="currentColor"/><path d="m48 5 5 20 22 7-22 7-5 20-5-20-22-7 22-7Z" fill="currentColor"/>' },
    merchant: { name: 'Merchant', field: '#254337', ink: '#e0c485', art: '<path d="M17 42h64L69 53H30Zm28-31v28H26Zm7 0v28h24Z" fill="currentColor"/><path d="M13 57q10-5 20 0t20 0t20 0t15 0" fill="none" stroke="currentColor" stroke-width="2"/>' },
    pirate: { name: 'Pirate', field: '#222632', ink: '#e8e6da', art: '<path d="m24 15 49 40m-49 0 49-40" stroke="currentColor" stroke-width="5"/><path d="M32 24a16 16 0 0 1 32 0v11l-7 5v8H39v-8l-7-5Z" fill="currentColor"/><circle cx="41" cy="27" r="4" fill="#222632"/><circle cx="55" cy="27" r="4" fill="#222632"/><path d="m48 34-3 5h6Z" fill="#222632"/>' }
  };
  const DEFAULTS = { enabled: true, animations: 'full', flag: 'random', effects: true };
  function nameLabel(value) { return typeof value === 'string' && value.trim() ? Array.from(value.trim()).slice(0, 80).join('') : 'Supervisor'; }
  function settingsFrom(value = {}) {
    return { enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
      animations: ['full', 'reduced', 'off'].includes(value.animations) ? value.animations : 'full',
      flag: value.flag === 'random' || Object.hasOwn(FLAGS, value.flag) ? value.flag : 'random',
      effects: typeof value.effects === 'boolean' ? value.effects : true };
  }
  function readSettings() {
    try { return settingsFrom(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}); } catch { return { ...DEFAULTS }; }
  }
  function flagSvg(id) {
    const flag = Object.hasOwn(FLAGS, id) ? FLAGS[id] : FLAGS.classic;
    // Original local artwork: fixed viewport, no shared paint-server IDs or external assets.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" width="96" height="64" aria-hidden="true" style="color:${flag.ink}"><path fill="${flag.field}" d="M0 0h96v64H0Z"/>${flag.art}<path d="M1 1h94v62H1Z" fill="none" stroke="${flag.ink}" stroke-opacity=".5"/></svg>`;
  }
  function resolveState(row, available = true) {
    if (!available || !row) return 'neutral';
    const parts = Array.isArray(row.dispatch) ? row.dispatch.filter(Boolean) : [];
    const live = row.workerAlive || parts.some(part => part.alive);
    const terminal = ['complete', 'checkpointed', 'failed'].includes(row.status) || row.status?.startsWith('blocked_');
    if (terminal && live) return row.status === 'complete' ? 'running' : 'pausing';
    // A raw PID may be reused; an ambiguous terminal snapshot is not completion proof.
    if (terminal && parts.some(part => part.observedAlive && !part.stoppedByUser)) return 'neutral';
    if (row.status === 'complete') return 'completed';
    if (row.status === 'checkpointed') return 'checkpoint';
    if (row.status === 'failed' || row.status?.startsWith('blocked_')) return 'failed';
    if (row.megaTask?.pauseRequested && live) return 'pausing';
    if (row.status === 'watching' || row.status === 'resuming') return live ? 'running' : 'preparing';
    if (['waiting_on_you', 'propose_grill', 'needs_approval'].includes(row.status)) return 'preparing';
    return row.status === 'idle' ? 'idle' : 'neutral';
  }
  const scene = `<svg class="harbor-scene" viewBox="0 0 1600 1000" preserveAspectRatio="xMaxYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="harbor-sea" x2="0" y2="1"><stop stop-color="var(--harbor-sea-top)"/><stop offset="1" stop-color="var(--harbor-sea-bottom)"/></linearGradient>
      <pattern id="harbor-sail-tech" width="28" height="28" patternUnits="userSpaceOnUse"><rect width="28" height="28" fill="var(--harbor-cabin)"/><path d="M0 14h10v-8h8v16h10M14 0v28" stroke="var(--harbor-livery)" stroke-width="1.5" fill="none" opacity=".65"/></pattern>
      <pattern id="harbor-sail-stars" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="var(--harbor-cabin)"/><path d="m25 10 3 12 12 3-12 3-3 12-3-12-12-3 12-3Z" fill="var(--harbor-livery)" opacity=".55"/></pattern>
      <pattern id="harbor-sail-trade" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="var(--harbor-cabin)"/><path d="M0 15h30" stroke="var(--harbor-livery)" stroke-width="9" opacity=".65"/></pattern>
      <mask id="harbor-sail-wear" maskUnits="userSpaceOnUse" x="-250" y="-380" width="550" height="400"><rect x="-250" y="-380" width="550" height="400" fill="white"/><path d="m-50-125 9 15-6 15-12-13Zm75-105 10 12-5 14-11-15Zm95 135 9 18-14 8-5-13Z" fill="black"/></mask>
    </defs>
    <path fill="var(--harbor-sky)" d="M0 0h1600v1000H0Z"/>
    <g class="harbor-detail" fill="none" stroke="var(--harbor-line)" opacity=".2"><path d="M0 650h1600M0 630h1600M0 610h1600M1050 600l20-35h60l15 35m340 0v-70h35v70"/><path d="M1050 580h120m300-30h100"/></g>
    <path fill="url(#harbor-sea)" d="M0 650h1600v350H0Z"/>
    <g class="harbor-water" fill="none" stroke="var(--harbor-line)" stroke-width="1.5" opacity=".25"><path d="M-100 690q100-9 200 0t200 0t200 0t200 0t200 0t200 0t200 0t300 0M-100 825q140-12 280 0t280 0t280 0t280 0t280 0t300 0M0 930q120-8 240 0t240 0t240 0t240 0t240 0t400 0"/></g>
    <g class="harbor-pier"><path fill="var(--harbor-pier)" d="m1440 718 160-28v48l-160 28Z"/><path d="m1440 718 160-28" fill="none" stroke="var(--harbor-line)" stroke-width="3"/><path d="M1460 758v130m68-145v115m60-128v106" stroke="var(--harbor-pier)" stroke-width="17"/><path d="M1490 709v-81" stroke="var(--harbor-pier)" stroke-width="8"/><circle class="harbor-beacon" cx="1490" cy="625" r="7" fill="var(--harbor-line)"/><path class="harbor-atmosphere" d="m1490 625-330-80 20 90Z" fill="var(--harbor-line)" opacity=".07"/><path d="M1465 712v-9m75-5v-9" stroke="var(--harbor-line)" stroke-width="7"/></g>
    <g class="harbor-route">
      <g class="harbor-ship">
        <ellipse cx="0" cy="62" rx="182" ry="12" fill="var(--harbor-shadow)" opacity=".45"/>
        <g class="harbor-wake" fill="none" stroke="var(--harbor-line)" opacity=".4"><path d="M-165 44q-80 10-150 5m150 8q-90 13-180 11" stroke-width="3"/></g>
        <g class="harbor-ropes" fill="none" stroke="var(--harbor-rope)" stroke-width="2"><path d="M130 4q35 25 50-7M70 8q50 45 120-6"/></g>
        <!-- Three-masted sailing ship; the selected ensign also controls its livery and sails. -->
        <path class="harbor-hull" d="M-225-3q180 26 443-7l-43 64q-163 30-350-5Z" fill="var(--harbor-livery)" stroke="var(--harbor-line)" stroke-width="3"/>
        <path class="harbor-hull-trim" d="M-210 15q200 29 407-6M-185 40q170 20 360-1" fill="none" stroke="var(--harbor-ensign-ink)" stroke-width="3" opacity=".7"/>
        <path d="M-185-4v-35h70v39M95-1v-33h69l11 31" fill="var(--harbor-livery)" stroke="var(--harbor-line)" stroke-width="2"/>
        <path d="M180-15 285-58M-195-16l-70-30" stroke="var(--harbor-rope)" stroke-width="5"/>
        <g class="harbor-rigging" fill="none" stroke="var(--harbor-rope)" stroke-width="1.4" opacity=".8"><path d="M-125-273-218-4M-125-273-38 6M-15-352-138 6M-15-352 127 2M117-255 15 4M117-255 218-10M-15-352 285-58M-15-352-265-46"/></g>
        <g class="harbor-masts" stroke="var(--harbor-line)" stroke-width="5"><path d="M-125 4v-281M-15 8v-365M117 1v-262"/></g>
        <g class="harbor-sails" fill="var(--harbor-cabin)" stroke="var(--harbor-line)" stroke-width="1.8">
          <path class="harbor-sail" d="M-187-246h124q-15 47 7 81-63-13-138 0 25-45 7-81Z"/>
          <path class="harbor-sail" d="M-201-152h153q-15 57 8 95-79-16-169 0 25-49 8-95Z"/>
          <path class="harbor-sail" d="M-65-324H35q-11 40 9 66-56-11-117 0 22-37 8-66Z"/>
          <path class="harbor-sail" d="M-86-247H57q-17 49 8 81-75-14-159 0 25-44 8-81Z"/>
          <path class="harbor-sail" d="M-102-153H76q-17 57 9 94-94-16-196 0 28-49 9-94Z"/>
          <path class="harbor-sail" d="M66-228h104q-12 43 7 72-52-12-119 0 20-37 8-72Z"/>
          <path class="harbor-sail" d="M56-144h124q-12 49 9 81-64-13-141 0 20-43 8-81Z"/>
          <path class="harbor-jib" d="m130-246 132 177-114 12Z"/>
        </g>
        <g class="harbor-yards" stroke="var(--harbor-rope)" stroke-width="3"><path d="M-193-246h136M-208-152h167M-71-324H41M-92-247H64M-109-153H84M60-228h116M49-144h138"/></g>
        <g class="harbor-flag-mount" transform="translate(-15 -355)"><g class="harbor-flag" transform="translate(-68 0) scale(.7)"></g></g>
        <g class="harbor-portholes" fill="var(--harbor-ensign-ink)" opacity=".8"><circle cx="-140" cy="26" r="5"/><circle cx="-98" cy="31" r="5"/><circle cx="-56" cy="33" r="5"/><circle cx="-14" cy="35" r="5"/><circle cx="28" cy="35" r="5"/><circle cx="70" cy="32" r="5"/><circle cx="112" cy="27" r="5"/></g>
        <g class="harbor-anchor" stroke="var(--harbor-rope)" stroke-width="2" fill="none"><path d="M130 32v58m-12-10q12 22 24 0m-20-6h16"/></g>
      </g>
    </g>
    <g class="harbor-detail harbor-atmosphere" fill="var(--harbor-line)" opacity=".12"><circle cx="1150" cy="230" r="2"/><circle cx="1380" cy="330" r="2"/><circle cx="1475" cy="185" r="1.5"/></g>
  </svg>`;
  class HarborUI {
    constructor() {
      this.settings = readSettings(); this.snapshot = null; this.projectId = null; this.available = false;
      this.state = 'neutral'; this.executionId = null; this.randomFlag = null;
      this.motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    }
    init() {
      this.root = document.createElement('div'); this.root.id = 'harbor-background';
      this.root.className = 'harbor-background'; this.root.setAttribute('aria-hidden', 'true'); this.root.setAttribute('inert', '');
      this.root.innerHTML = scene; document.body.prepend(this.root);
      this.root.querySelector('.harbor-route').addEventListener('transitionend', event => {
        if (event.target !== this.root.querySelector('.harbor-route') || event.propertyName !== 'transform') return;
        if (this.root.dataset.state === 'resuming') this.root.dataset.state = 'running';
        if (this.state === 'completed') this.root.dataset.arrived = 'true';
      });
      this.createSettings();
      window.addEventListener('planwharf-orchestrator', event => {
        this.snapshot = event.detail.snapshot; this.projectId = event.detail.projectId; this.available = event.detail.available;
        this.update();
      });
      window.addEventListener('planwharf-project', event => { this.projectId = event.detail; this.update(); });
      window.addEventListener('storage', event => { if (event.key === SETTINGS_KEY || event.key === null) { this.settings = readSettings(); this.applySettings(); } });
      document.addEventListener('visibilitychange', () => this.applyMotion());
      this.motion.addEventListener('change', () => this.applyMotion());
      this.applySettings(); this.update();
    }
    effectiveFlag(choice = this.settings.flag) {
      if (Object.hasOwn(FLAGS, choice)) return choice;
      if (!this.randomFlag) {
        try { this.randomFlag = sessionStorage.getItem(SESSION_KEY); } catch {}
        if (!Object.hasOwn(FLAGS, this.randomFlag)) {
          const ids = Object.keys(FLAGS); this.randomFlag = ids[Math.floor(Math.random() * ids.length)];
          try { sessionStorage.setItem(SESSION_KEY, this.randomFlag); } catch {}
        }
      }
      return this.randomFlag;
    }
    applyMotion() {
      const motion = this.motion.matches && this.settings.animations === 'full' ? 'reduced' : this.settings.animations;
      this.root.dataset.motion = motion; this.root.dataset.suspended = String(document.hidden);
      if (motion !== 'full' && this.root.dataset.state === 'resuming') this.root.dataset.state = 'running';
    }
    applySettings() {
      this.root.hidden = !this.settings.enabled;
      document.body.classList.toggle('harbor-enabled', this.settings.enabled);
      this.root.dataset.effects = String(this.settings.effects);
      const flag = this.effectiveFlag();
      if (this.root.dataset.flag !== flag) {
      this.root.querySelector('.harbor-flag').innerHTML = flagSvg(flag); this.root.dataset.flag = flag;
      this.root.style.setProperty('--harbor-livery', FLAGS[flag].field);
      this.root.style.setProperty('--harbor-ensign-ink', FLAGS[flag].ink);
      }
      this.applyMotion();
    }
    update() {
      const row = this.snapshot?.projects?.find(row => row.id === this.projectId);
      const next = resolveState(row, this.available), execution = `${this.projectId || ''}/${row?.megaTaskId || row?.jobId || ''}`;
      const switched = this.root.dataset.project !== (this.projectId || '') || execution !== this.executionId;
      const prior = this.state;
      this.root.dataset.project = this.projectId || '';
      this.root.dataset.state = next === 'running' && prior === 'checkpoint' && !switched && this.root.dataset.motion === 'full' ? 'resuming' : next;
      this.root.dataset.underway = String(['running', 'pausing'].includes(next));
      this.root.dataset.switching = String(switched);
      if (next !== prior || switched) this.root.dataset.arrived = String(next === 'completed' && !['running', 'pausing'].includes(prior));
      this.state = next; this.executionId = execution;
      // Project changes snap to the new project's facts, rather than animating a
      // previous project's voyage. Subsequent same-project updates may transition.
      if (switched) { this.root.querySelector('.harbor-route').getBoundingClientRect(); this.root.querySelector('.harbor-pier').getBoundingClientRect(); }
      this.root.dataset.switching = 'false';
      const label = this.dialog.querySelector('[data-harbor-status]');
      label.textContent = row && this.available ? `${row.name}: ${next}.` : 'Execution state unavailable or no project selected.';
    }
    preview() {
      this.dialog.querySelector('[data-flag-preview]').innerHTML = flagSvg(this.effectiveFlag(this.form.elements.flag.value));
    }
    createSettings() {
      this.dialog = document.createElement('dialog'); this.dialog.id = 'harbor-dialog'; this.dialog.className = 'harbor-dialog';
      this.dialog.setAttribute('aria-labelledby', 'harbor-settings-title');
      this.dialog.innerHTML = `<form id="harbor-settings-form"><h2 id="harbor-settings-title">Harbor settings</h2>
        <p class="muted">Where projects dock, agents work, and progress stays anchored.</p>
        <label class="choice"><input type="checkbox" name="enabled"> Harbor visualization</label>
        <label>Animations<select name="animations"><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select></label>
        <label>Flag<select name="flag"><option value="random">Random (stable for this session)</option>${Object.entries(FLAGS).map(([id, flag]) => `<option value="${id}">${flag.name}</option>`).join('')}</select></label>
        <div class="harbor-flag-preview" data-flag-preview aria-hidden="true"></div>
        <label class="choice"><input type="checkbox" name="effects"> Harbor status effects</label>
        <p class="muted" data-harbor-status></p><p class="notice" data-harbor-error hidden></p>
        <div class="dialog-actions"><button type="button" data-harbor-cancel class="secondary">Cancel</button><button type="submit" class="primary">Save settings</button></div>
      </form>`;
      document.body.append(this.dialog); this.form = this.dialog.querySelector('form');
      this.form.elements.flag.addEventListener('change', () => this.preview());
      this.dialog.querySelector('[data-harbor-cancel]').addEventListener('click', () => this.dialog.close());
      this.form.addEventListener('submit', event => {
        event.preventDefault();
        const next = settingsFrom({ enabled: this.form.elements.enabled.checked, animations: this.form.elements.animations.value,
          flag: this.form.elements.flag.value, effects: this.form.elements.effects.checked });
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); }
        catch { const error = this.dialog.querySelector('[data-harbor-error]'); error.hidden = false; error.textContent = 'Browser storage is unavailable. Settings could not be saved.'; return; }
        this.settings = next; this.applySettings(); this.dialog.close();
      });
      const button = document.createElement('button'); button.type = 'button'; button.id = 'harbor-settings-button';
      button.className = 'secondary compact'; button.textContent = '⚓'; button.title = 'Harbor settings'; button.setAttribute('aria-label', 'Harbor settings');
      button.addEventListener('click', () => {
        for (const key of ['enabled', 'effects']) this.form.elements[key].checked = this.settings[key];
        for (const key of ['animations', 'flag']) this.form.elements[key].value = this.settings[key];
        this.dialog.querySelector('[data-harbor-error]').hidden = true; this.preview(); this.dialog.showModal();
      });
      document.getElementById('theme-toggle')?.before(button);
    }
  }
  const exports = { FLAGS, SETTINGS_KEY, SESSION_KEY, nameLabel, settingsFrom, flagSvg, resolveState };
  if (typeof module !== 'undefined' && module.exports) module.exports = exports;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const boot = () => { const ui = new HarborUI(); ui.init(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }
})();
