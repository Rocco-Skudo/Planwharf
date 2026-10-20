'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const JOB_STATES = new Set(['queued', 'ready', 'running', 'completed', 'failed', 'cancelled']);
const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const ATTEMPT_STATES = new Set(['running', 'completed', 'failed', 'cancelled', 'interrupted']);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clonePayload(value, ancestors = new Set(), location = '$') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isFinite(value) && !Object.is(value, -0)) return value;
    throw new TypeError(`JSON-serializable payload required without loss: ${location} is non-finite`);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`JSON-serializable payload required without loss: ${location} is ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new TypeError(`JSON-serializable payload required without loss: ${location} creates a cycle`);
  }

  const array = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`JSON-serializable payload required without loss: ${location} is not a plain object`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key === 'symbol')) {
    throw new TypeError(`JSON-serializable payload required without loss: ${location} has a symbol key`);
  }

  ancestors.add(value);
  try {
    if (array) {
      if (keys.length !== value.length + 1 || keys.some((key) => key !== 'length' &&
          (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))) {
        throw new TypeError(`JSON-serializable payload required without loss: ${location} has a discarded array member`);
      }
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError(`JSON-serializable payload required without loss: ${location}[${index}] is missing`);
        }
        result.push(clonePayload(value[index], ancestors, `${location}[${index}]`));
      }
      return result;
    }

    const result = {};
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor.enumerable) {
        throw new TypeError(`JSON-serializable payload required without loss: ${location}.${key} is non-enumerable`);
      }
      Object.defineProperty(result, key, {
        value: clonePayload(value[key], ancestors, `${location}.${key}`),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) {
    throw new Error('Invalid HarborQueue checkpoint: expected version 1 object');
  }
  if (!Array.isArray(value.jobs) || !Array.isArray(value.history)) {
    throw new Error('Invalid HarborQueue checkpoint: jobs and history must be arrays');
  }
  const jobs = new Map();
  for (const job of value.jobs) {
    if (!job || typeof job !== 'object' || typeof job.id !== 'string' || !job.id || jobs.has(job.id)) {
      throw new Error('Invalid HarborQueue checkpoint: job IDs must be unique non-empty strings');
    }
    if (!Array.isArray(job.dependsOn) || !JOB_STATES.has(job.status) ||
        !Number.isSafeInteger(job.attemptCount) || job.attemptCount < 0) {
      throw new Error(`Invalid HarborQueue checkpoint: malformed job ${job.id}`);
    }
    if (job.currentAttemptId !== undefined &&
        (typeof job.currentAttemptId !== 'string' || !job.currentAttemptId)) {
      throw new Error(`Invalid HarborQueue checkpoint: malformed current attempt for ${job.id}`);
    }
    if (job.currentAttemptId !== undefined && job.status !== 'running' && job.status !== 'cancelled') {
      throw new Error(`Invalid HarborQueue checkpoint: stale current attempt for ${job.id}`);
    }
    if (new Set(job.dependsOn).size !== job.dependsOn.length ||
        job.dependsOn.some((dependency) => typeof dependency !== 'string' || !dependency)) {
      throw new Error(`Invalid HarborQueue checkpoint: malformed dependencies for ${job.id}`);
    }
    jobs.set(job.id, job);
  }
  for (const job of jobs.values()) {
    for (const dependency of job.dependsOn) {
      if (!jobs.has(dependency)) {
        throw new Error(`Invalid HarborQueue checkpoint: missing dependency ${dependency} for ${job.id}`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('Invalid HarborQueue checkpoint: dependency cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of jobs.get(id).dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of jobs.keys()) visit(id);

  const attempts = new Set();
  const attemptsByJob = new Map([...jobs.keys()].map((id) => [id, []]));
  for (const entry of value.history) {
    if (!entry || typeof entry !== 'object' || typeof entry.attemptId !== 'string' || !entry.attemptId ||
        typeof entry.jobId !== 'string' || !jobs.has(entry.jobId) || attempts.has(entry.attemptId)) {
      throw new Error('Invalid HarborQueue checkpoint: malformed or duplicate history attempt');
    }
    if (!ATTEMPT_STATES.has(entry.status) || !Number.isSafeInteger(entry.number) || entry.number < 1) {
      throw new Error(`Invalid HarborQueue checkpoint: malformed attempt ${entry.attemptId}`);
    }
    attempts.add(entry.attemptId);
    attemptsByJob.get(entry.jobId).push(entry);
  }
  for (const job of jobs.values()) {
    const jobAttempts = attemptsByJob.get(job.id);
    if (jobAttempts.length !== job.attemptCount) {
      throw new Error(`Invalid HarborQueue checkpoint: attempt count mismatch for ${job.id}`);
    }
    const orderedAttempts = [...jobAttempts].sort((left, right) => left.number - right.number);
    if (orderedAttempts.some((entry, index) => entry.number !== index + 1)) {
      throw new Error(`Invalid HarborQueue checkpoint: attempt numbers must be unique and sequential for ${job.id}`);
    }
    for (const entry of jobAttempts) {
      if (entry.status === 'running' &&
          (job.status !== 'running' || job.currentAttemptId !== entry.attemptId)) {
        throw new Error(`Invalid HarborQueue checkpoint: running attempt ${entry.attemptId} does not match job ${job.id}`);
      }
    }
    if (job.status === 'running') {
      const current = jobAttempts.find((entry) => entry.attemptId === job.currentAttemptId);
      if (!current || current.status !== 'running') {
        throw new Error(`Invalid HarborQueue checkpoint: running job ${job.id} has no running attempt`);
      }
    }
    if ((job.status === 'completed' || job.status === 'failed') && orderedAttempts.length === 0) {
      throw new Error(`Invalid HarborQueue checkpoint: terminal state mismatch for ${job.id}`);
    }
    if (TERMINAL_STATES.has(job.status) && orderedAttempts.length > 0) {
      const latest = orderedAttempts.at(-1);
      const matches = latest.status === job.status ||
        (job.status === 'failed' && latest.status === 'interrupted') ||
        (job.status === 'cancelled' && job.currentAttemptId === undefined &&
          (latest.status === 'failed' || latest.status === 'interrupted'));
      if (!matches) {
        throw new Error(`Invalid HarborQueue checkpoint: terminal state mismatch for ${job.id}`);
      }
      if (job.status === 'cancelled' && job.currentAttemptId !== undefined &&
          job.currentAttemptId !== latest.attemptId) {
        throw new Error(`Invalid HarborQueue checkpoint: terminal state mismatch for ${job.id}`);
      }
    }
  }
}

class HarborQueue {
  constructor({ file, run, concurrency = 3, maxRetries = 1, fault } = {}) {
    if (typeof file !== 'string' || !file) throw new TypeError('file must be a non-empty path');
    if (typeof run !== 'function') throw new TypeError('run must be a function');
    if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 3) {
      throw new RangeError('concurrency must be an integer from 1 through 3');
    }
    if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new RangeError('maxRetries must be a non-negative integer');
    if (fault !== undefined && typeof fault !== 'function') throw new TypeError('fault must be a function');

    this.file = path.resolve(file);
    this.lockFile = `${this.file}.lock`;
    this.acquisitionGuard = `${this.lockFile}.acquire`;
    this.run = run;
    this.concurrency = concurrency;
    this.maxRetries = maxRetries;
    this.fault = fault;
    this.ownerToken = randomUUID();
    this.active = new Map();
    this.waiters = [];
    this.started = false;
    this.closed = false;
    this.closing = false;
    this.fatalError = null;
    this.pumping = false;

    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this._acquireLock();
    try {
      if (fs.existsSync(this.file)) {
        let parsed;
        try {
          parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        } catch (error) {
          throw new Error(`Invalid HarborQueue checkpoint: ${errorText(error)}`);
        }
        validateState(parsed);
        this.state = clone(parsed);
        this._recoverInterruptedAttempts();
      } else {
        this.state = { version: 1, jobs: [], history: [], updatedAt: new Date().toISOString() };
        this._checkpoint(this.state);
      }
    } catch (error) {
      this._releaseLock();
      throw error;
    }
  }

  add(options = {}) {
    const { id, dependsOn = [] } = options;
    const payload = Object.hasOwn(options, 'payload') ? options.payload : null;
    this._assertUsable();
    if (typeof id !== 'string' || !id) throw new TypeError('job id must be a non-empty string');
    if (!Array.isArray(dependsOn) || dependsOn.some((item) => typeof item !== 'string' || !item)) {
      throw new TypeError('dependsOn must be an array of non-empty job IDs');
    }
    if (new Set(dependsOn).size !== dependsOn.length) throw new Error('dependencies must be unique');
    if (dependsOn.includes(id)) throw new Error(`dependency cycle involving ${id}`);
    const safePayload = clonePayload(payload);
    let added;
    this._mutate((next) => {
      if (next.jobs.some((job) => job.id === id)) throw new Error(`duplicate job id: ${id}`);
      const known = new Set(next.jobs.map((job) => job.id));
      const missing = dependsOn.filter((dependency) => !known.has(dependency));
      if (missing.length) throw new Error(`missing dependencies: ${missing.join(', ')}`);
      const complete = dependsOn.every((dependency) => next.jobs.find((job) => job.id === dependency).status === 'completed');
      added = { id, dependsOn: [...dependsOn], payload: safePayload, status: complete ? 'ready' : 'queued', attemptCount: 0 };
      next.jobs.push(added);
    });
    if (this.started) this._pump();
    return clone(added);
  }

  start() {
    this._assertUsable();
    if (this.started) throw new Error('HarborQueue is already started');
    this.started = true;
    try {
      this._pump(true);
    } catch (error) {
      this.started = false;
      throw error;
    }
    this._notifyIdle();
    return this.snapshot();
  }

  cancel(id) {
    this._assertUsable();
    const existing = this.state.jobs.find((job) => job.id === id);
    if (!existing) throw new Error(`unknown job id: ${id}`);
    if (TERMINAL_STATES.has(existing.status)) throw new Error(`job ${id} is already ${existing.status}`);
    this._mutate((next) => {
      const job = next.jobs.find((item) => item.id === id);
      job.status = 'cancelled';
      job.cancelledAt = new Date().toISOString();
      if (job.currentAttemptId) {
        const attempt = next.history.find((item) => item.attemptId === job.currentAttemptId);
        if (attempt && attempt.status === 'running') {
          attempt.status = 'cancelled';
          attempt.finishedAt = job.cancelledAt;
        }
      }
    });
    const active = this.active.get(id);
    if (active) active.controller.abort(new Error(`job ${id} cancelled`));
    this._notifyIdle();
    return clone(this.state.jobs.find((job) => job.id === id));
  }

  snapshot() {
    return clone({
      version: this.state.version,
      jobs: this.state.jobs,
      history: this.state.history,
      active: this.active.size,
      concurrency: this.concurrency,
      started: this.started,
      closed: this.closed,
      failedClosed: this.fatalError ? errorText(this.fatalError) : null,
      updatedAt: this.state.updatedAt,
    });
  }

  idle() {
    if (this.fatalError) return Promise.reject(this.fatalError);
    if (this._isIdle()) return Promise.resolve(this.snapshot());
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async close() {
    if (this.closed) return;
    if (this.closing) return this.closePromise;
    for (const id of [...this.active.keys()]) {
      const job = this.state.jobs.find((item) => item.id === id);
      if (job && job.status === 'running') {
        try {
          this.cancel(id);
        } catch (error) {
          this._failClosed(error);
          this.active.get(id)?.controller.abort(error);
        }
      }
    }
    this.closing = true;
    this.closePromise = (async () => {
      await Promise.allSettled([...this.active.values()].map((entry) => entry.settled));
      this.closed = true;
      this._releaseLock();
      this._notifyIdle();
    })();
    return this.closePromise;
  }

  _assertUsable() {
    if (this.closed || this.closing) throw new Error('HarborQueue is closed');
    if (this.fatalError) throw this.fatalError;
  }

  _mutate(change) {
    const next = clone(this.state);
    change(next);
    next.updatedAt = new Date().toISOString();
    validateState(next);
    this._checkpoint(next);
    this.state = next;
  }

  _checkpoint(state) {
    const temporary = `${this.file}.tmp-${process.pid}-${this.ownerToken}`;
    let handle;
    try {
      handle = fs.openSync(temporary, 'w');
      fs.writeFileSync(handle, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = undefined;
      if (this.fault) this.fault('before-rename', { file: this.file, temporary });
      fs.renameSync(temporary, this.file);
      try {
        const directory = fs.openSync(path.dirname(this.file), 'r');
        try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
      } catch (_) {
        // Directory fsync is unavailable on some platforms, notably Windows.
      }
    } catch (error) {
      if (handle !== undefined) {
        try { fs.closeSync(handle); } catch (_) {}
      }
      try { fs.unlinkSync(temporary); } catch (_) {}
      throw error;
    }
  }

  _acquireLock() {
    const record = `${JSON.stringify({ pid: process.pid, token: this.ownerToken, createdAt: new Date().toISOString() })}\n`;
    // This observation is deliberately outside the guard so tests can force the
    // historical stale-read interleaving. It never authorizes a mutation: the
    // current lock is read and checked again after the guard is held.
    let observed;
    try {
      observed = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
    } catch (_) {
      // The authoritative read happens under the acquisition guard below.
    }
    if (observed && Number.isSafeInteger(observed.pid) && observed.pid > 0 &&
        !this._processIsAlive(observed.pid) && this.fault) {
      this.fault('after-stale-lock-read', { file: this.lockFile, owner: clone(observed) });
    }

    this._acquireOwnershipGuard();
    let acquired = false;
    let failure;
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let created = false;
        try {
          const descriptor = fs.openSync(this.lockFile, 'wx');
          created = true;
          try {
            fs.writeFileSync(descriptor, record, 'utf8');
            fs.fsyncSync(descriptor);
            acquired = true;
          } finally {
            fs.closeSync(descriptor);
          }
          break;
        } catch (error) {
          if (created) {
            try { fs.unlinkSync(this.lockFile); } catch (_) {}
          }
          if (error.code !== 'EEXIST') throw error;
          let owner;
          try { owner = JSON.parse(fs.readFileSync(this.lockFile, 'utf8')); } catch (_) {
            throw new Error(`HarborQueue state is locked and ownership cannot be verified: ${this.lockFile}`);
          }
          if (!Number.isSafeInteger(owner.pid) || owner.pid < 1 || this._processIsAlive(owner.pid)) {
            throw new Error(`HarborQueue state is already owned by live process ${owner.pid || 'unknown'}`);
          }
          try { fs.unlinkSync(this.lockFile); } catch (unlinkError) {
            if (unlinkError.code !== 'ENOENT') throw unlinkError;
          }
        }
      }
      if (!acquired) throw new Error('HarborQueue could not acquire exclusive state ownership');
    } catch (error) {
      failure = error;
    }

    try {
      this._releaseOwnershipGuard();
    } catch (error) {
      failure ||= new Error(`HarborQueue acquired state ownership but could not release its acquisition guard: ${errorText(error)}`);
    }
    if (failure) {
      if (acquired) this._releaseLock();
      throw failure;
    }
  }

  _acquireOwnershipGuard() {
    try {
      fs.mkdirSync(this.acquisitionGuard);
      fs.writeFileSync(path.join(this.acquisitionGuard, 'owner.json'), `${JSON.stringify({
        pid: process.pid,
        token: this.ownerToken,
        createdAt: new Date().toISOString(),
      })}\n`, { flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(
          `HarborQueue ownership acquisition is already in progress or was interrupted: ${this.acquisitionGuard}. ` +
          'If no process is acquiring this queue, remove that acquisition-guard directory manually.',
        );
      }
      try {
        fs.unlinkSync(path.join(this.acquisitionGuard, 'owner.json'));
      } catch (_) {}
      try { fs.rmdirSync(this.acquisitionGuard); } catch (_) {}
      throw error;
    }
  }

  _releaseOwnershipGuard() {
    const ownerFile = path.join(this.acquisitionGuard, 'owner.json');
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    if (owner.token !== this.ownerToken) throw new Error('acquisition guard token changed unexpectedly');
    fs.unlinkSync(ownerFile);
    fs.rmdirSync(this.acquisitionGuard);
  }

  _processIsAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code !== 'ESRCH';
    }
  }

  _releaseLock() {
    try {
      const owner = JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
      if (owner.token === this.ownerToken) fs.unlinkSync(this.lockFile);
    } catch (error) {
      if (error.code !== 'ENOENT') return;
    }
  }

  _recoverInterruptedAttempts() {
    let changed = false;
    const now = new Date().toISOString();
    for (const job of this.state.jobs) {
      if (job.status !== 'running') continue;
      changed = true;
      const attempt = this.state.history.find((item) => item.attemptId === job.currentAttemptId);
      if (!attempt || attempt.status !== 'running') {
        throw new Error(`Invalid HarborQueue checkpoint: running job ${job.id} has no running attempt`);
      }
      attempt.status = 'interrupted';
      attempt.finishedAt = now;
      attempt.error = 'Previous scheduler ownership ended before the attempt settled';
      delete job.currentAttemptId;
      job.status = job.attemptCount <= this.maxRetries ? 'ready' : 'failed';
      if (job.status === 'failed') job.error = attempt.error;
    }
    for (const job of this.state.jobs) {
      if (job.status !== 'queued' && job.status !== 'ready') continue;
      const dependencies = job.dependsOn.map((id) => this.state.jobs.find((item) => item.id === id));
      const desired = dependencies.every((item) => item.status === 'completed') ? 'ready' : 'queued';
      if (job.status !== desired) { job.status = desired; changed = true; }
    }
    if (changed) {
      this.state.updatedAt = now;
      validateState(this.state);
      this._checkpoint(this.state);
    }
  }

  _pump(throwOnError = false) {
    if (!this.started || this.closed || this.closing || this.fatalError || this.pumping) return;
    this.pumping = true;
    try {
      while (this.active.size < this.concurrency) {
        const job = this.state.jobs.find((item) => item.status === 'ready' && !this.active.has(item.id));
        if (!job) break;
        this._launch(job.id);
      }
    } catch (error) {
      if (throwOnError) throw error;
      this._failClosed(error);
    } finally {
      this.pumping = false;
      this._notifyIdle();
    }
  }

  _launch(jobId) {
    const attemptId = randomUUID();
    const startedAt = new Date().toISOString();
    this._mutate((next) => {
      const job = next.jobs.find((item) => item.id === jobId);
      if (!job || job.status !== 'ready') throw new Error(`job ${jobId} is not ready`);
      job.status = 'running';
      job.attemptCount += 1;
      job.currentAttemptId = attemptId;
      next.history.push({ attemptId, jobId, number: job.attemptCount, status: 'running', startedAt });
    });
    const controller = new AbortController();
    let settle;
    const settled = new Promise((resolve) => { settle = resolve; });
    const active = { attemptId, controller, settled, settle };
    this.active.set(jobId, active);
    const publicJob = clone(this.state.jobs.find((item) => item.id === jobId));
    Promise.resolve()
      .then(() => this.run(publicJob, { signal: controller.signal, attemptId }))
      .then(
        (result) => this._settle(jobId, attemptId, null, result),
        (error) => this._settle(jobId, attemptId, error),
      );
  }

  _settle(jobId, attemptId, error, result) {
    const active = this.active.get(jobId);
    if (!active || active.attemptId !== attemptId) return;
    try {
      this._mutate((next) => {
        const job = next.jobs.find((item) => item.id === jobId);
        const attempt = next.history.find((item) => item.attemptId === attemptId);
        if (!job || !attempt) throw new Error(`stale attempt ${attemptId}`);
        const finishedAt = new Date().toISOString();
        if (job.status === 'cancelled') {
          delete job.currentAttemptId;
          attempt.settledAt = finishedAt;
          if (error) attempt.settleError = errorText(error);
          return;
        }
        if (job.status !== 'running' || job.currentAttemptId !== attemptId || attempt.status !== 'running') return;
        delete job.currentAttemptId;
        attempt.finishedAt = finishedAt;
        if (!error) {
          job.status = 'completed';
          job.result = clone(result === undefined ? null : result);
          attempt.status = 'completed';
          attempt.result = clone(result === undefined ? null : result);
        } else {
          attempt.status = 'failed';
          attempt.error = errorText(error);
          if (job.attemptCount <= this.maxRetries) {
            job.status = 'ready';
            delete job.error;
          } else {
            job.status = 'failed';
            job.error = attempt.error;
          }
        }
        if (job.status === 'completed') {
          for (const candidate of next.jobs) {
            if (candidate.status !== 'queued') continue;
            if (candidate.dependsOn.every((dependency) => next.jobs.find((item) => item.id === dependency).status === 'completed')) {
              candidate.status = 'ready';
            }
          }
        }
      });
    } catch (persistenceError) {
      this._failClosed(persistenceError);
    } finally {
      this.active.delete(jobId);
      active.settle();
      this._pump();
      this._notifyIdle();
    }
  }

  _isIdle() {
    if (this.active.size !== 0) return false;
    if (!this.started || this.closed || this.closing) return true;
    return !this.state.jobs.some((job) => job.status === 'ready');
  }

  _notifyIdle() {
    if (this.fatalError) {
      const waiters = this.waiters.splice(0);
      for (const waiter of waiters) waiter.reject(this.fatalError);
      return;
    }
    if (!this._isIdle()) return;
    const snapshot = this.snapshot();
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.resolve(snapshot);
  }

  _failClosed(error) {
    if (!this.fatalError) this.fatalError = error instanceof Error ? error : new Error(String(error));
    this._notifyIdle();
  }
}

module.exports = { HarborQueue };
