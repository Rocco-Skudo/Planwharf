const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');

const { HarborQueue } = require('./scheduler.cjs');
const { createServer } = require('./server.cjs');

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harborqueue-'));
  const file = path.join(directory, 'queue.json');
  const queue = new HarborQueue({ file, run: async () => undefined, ...options });
  t.after(async () => {
    await queue.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return { queue, file, directory };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function turn() {
  return new Promise((resolve) => setImmediate(resolve));
}

function childMessage(child, type) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`timed out waiting for child message: ${type}`)), 5000);
    function onMessage(message) {
      if (message.type !== type) return;
      clearTimeout(timeout);
      child.off('error', onError);
      child.off('exit', onExit);
      child.off('message', onMessage);
      resolve(message);
    }
    function onError(error) {
      clearTimeout(timeout);
      child.off('message', onMessage);
      reject(error);
    }
    function onExit(code) {
      clearTimeout(timeout);
      child.off('message', onMessage);
      reject(new Error(`child exited with code ${code} before message: ${type}`));
    }
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

function checkpointFixture(t, state, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harborqueue-checkpoint-'));
  const file = path.join(directory, 'queue.json');
  fs.writeFileSync(file, JSON.stringify(state));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return () => new HarborQueue({ file, run: async () => undefined, ...options });
}

test('add durably exposes a queued job through snapshot', async (t) => {
  const { queue, file } = fixture(t);
  queue.add({ id: 'cargo-1', payload: { port: 'HAM' } });

  assert.deepEqual(queue.snapshot().jobs.map(({ id, status, payload }) => ({ id, status, payload })), [
    { id: 'cargo-1', status: 'ready', payload: { port: 'HAM' } },
  ]);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).jobs[0].id, 'cargo-1');
});

test('add rejects every lossy JSON payload member without mutating the queue', async (t) => {
  const { queue, file } = fixture(t);
  const cycle = {};
  cycle.self = cycle;
  const symbolKey = Symbol('hidden');
  const sparse = [];
  sparse.length = 1;
  const cases = [
    ['top-level undefined', undefined],
    ['function', { nested: { value: () => {} } }],
    ['undefined', { nested: { value: undefined } }],
    ['symbol value', { nested: { value: Symbol('cargo') } }],
    ['symbol key', { nested: { [symbolKey]: 'cargo' } }],
    ['NaN', { nested: { value: NaN } }],
    ['positive infinity', { nested: { value: Infinity } }],
    ['negative infinity', { nested: { value: -Infinity } }],
    ['negative zero', { nested: { value: -0 } }],
    ['sparse array', { nested: sparse }],
    ['discarded array member', Object.assign([], { cargo: true })],
    ['cycle', { nested: cycle }],
  ];

  const before = fs.readFileSync(file, 'utf8');
  for (const [name, payload] of cases) {
    assert.throws(() => queue.add({ id: `lossy-${name}`, payload }), /JSON-serializable payload/, name);
    assert.equal(fs.readFileSync(file, 'utf8'), before, name);
    assert.equal(queue.snapshot().jobs.length, 0, name);
  }
});

test('configuration cannot exceed the three physical execution slots', () => {
  assert.throws(
    () => new HarborQueue({ file: path.join(os.tmpdir(), 'harborqueue-invalid-config.json'), concurrency: 4, run: async () => undefined }),
    /1 through 3/,
  );
});

test('DAG scheduling uses at most three slots and never duplicates a running job', async (t) => {
  const gates = new Map();
  const running = new Set();
  const seen = [];
  let peak = 0;
  const { queue } = fixture(t, {
    concurrency: 3,
    run: async (job) => {
      assert.equal(running.has(job.id), false, `${job.id} was launched twice`);
      running.add(job.id);
      peak = Math.max(peak, running.size);
      seen.push(job.id);
      const gate = deferred();
      gates.set(job.id, gate);
      await gate.promise;
      running.delete(job.id);
      return `${job.id}-done`;
    },
  });
  for (const id of ['a', 'b', 'c', 'd']) queue.add({ id });
  queue.add({ id: 'after-a', dependsOn: ['a'] });
  queue.start();
  await turn();

  assert.equal(running.size, 3);
  assert.deepEqual(seen, ['a', 'b', 'c']);
  gates.get('a').resolve();
  gates.get('b').resolve();
  gates.get('c').resolve();
  await turn();
  assert.deepEqual(new Set(seen), new Set(['a', 'b', 'c', 'd', 'after-a']));
  gates.get('d').resolve();
  gates.get('after-a').resolve();
  await queue.idle();

  assert.equal(peak, 3);
  assert.ok(queue.snapshot().jobs.every((job) => job.status === 'completed'));
  const attemptIds = queue.snapshot().history.map((entry) => entry.attemptId);
  assert.equal(new Set(attemptIds).size, 5);
});

test('retries are bounded and failed prerequisites never release descendants', async (t) => {
  let calls = 0;
  const retryFixture = fixture(t, {
    maxRetries: 1,
    run: async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient');
      return 'ok';
    },
  });
  retryFixture.queue.add({ id: 'retry' });
  retryFixture.queue.start();
  await retryFixture.queue.idle();
  assert.equal(calls, 2);
  assert.equal(retryFixture.queue.snapshot().jobs[0].status, 'completed');
  assert.deepEqual(retryFixture.queue.snapshot().history.map((entry) => entry.status), ['failed', 'completed']);

  const failedFixture = fixture(t, { maxRetries: 0, run: async () => { throw new Error('permanent'); } });
  failedFixture.queue.add({ id: 'parent' });
  failedFixture.queue.add({ id: 'child', dependsOn: ['parent'] });
  failedFixture.queue.start();
  await failedFixture.queue.idle();
  assert.deepEqual(failedFixture.queue.snapshot().jobs.map(({ id, status }) => ({ id, status })), [
    { id: 'parent', status: 'failed' },
    { id: 'child', status: 'queued' },
  ]);
});

test('cancellation aborts the signal but retains the physical slot until settlement', async (t) => {
  const first = deferred();
  const launched = [];
  let firstSignal;
  const { queue } = fixture(t, {
    concurrency: 1,
    run: async (job, context) => {
      launched.push(job.id);
      if (job.id === 'first') {
        firstSignal = context.signal;
        await first.promise;
      }
    },
  });
  queue.add({ id: 'first' });
  queue.add({ id: 'second' });
  queue.start();
  await turn();
  queue.cancel('first');
  await turn();

  assert.equal(firstSignal.aborted, true);
  assert.deepEqual(launched, ['first']);
  assert.equal(queue.snapshot().active, 1);
  first.resolve();
  await turn();
  assert.deepEqual(launched, ['first', 'second']);
  await queue.idle();
  const state = queue.snapshot();
  assert.equal(state.jobs.find((job) => job.id === 'first').status, 'cancelled');
  assert.equal(state.history[0].status, 'cancelled');
  assert.ok(state.history[0].settledAt);
});

test('duplicate IDs, missing dependencies, cycles, and invalid operations are rejected', async (t) => {
  const { queue } = fixture(t);
  queue.add({ id: 'a' });
  assert.throws(() => queue.add({ id: 'a' }), /duplicate/);
  assert.throws(() => queue.add({ id: 'missing', dependsOn: ['nope'] }), /missing dependencies/);
  assert.throws(() => queue.add({ id: 'cycle', dependsOn: ['cycle'] }), /cycle/);
  assert.throws(() => queue.cancel('nope'), /unknown/);
  queue.start();
  assert.throws(() => queue.start(), /already started/);
  await queue.idle();
  assert.throws(() => queue.cancel('a'), /already completed/);
});

test('before-rename fault preserves the previous checkpoint and rolls back memory', async (t) => {
  let inject = false;
  const { queue, file } = fixture(t, {
    fault(stage) {
      if (inject && stage === 'before-rename') throw new Error('injected checkpoint failure');
    },
  });
  queue.add({ id: 'durable' });
  const before = fs.readFileSync(file, 'utf8');
  inject = true;
  assert.throws(() => queue.add({ id: 'not-durable' }), /injected checkpoint failure/);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(queue.snapshot().jobs.map((job) => job.id), ['durable']);
  assert.throws(() => queue.start(), /injected checkpoint failure/);
  assert.equal(queue.snapshot().started, false);
});

test('exclusive ownership fails closed and close releases the Windows-compatible lock', async (t) => {
  const { queue, file, directory } = fixture(t);
  assert.throws(
    () => new HarborQueue({ file, run: async () => undefined }),
    /already owned by live process/,
  );
  await queue.close();
  const replacement = new HarborQueue({ file, run: async () => undefined });
  await replacement.close();
  assert.equal(fs.existsSync(`${file}.lock`), false);
  assert.equal(fs.existsSync(directory), true);
});

test('an abandoned acquisition guard fails closed for manual intervention', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harborqueue-abandoned-guard-'));
  const file = path.join(directory, 'queue.json');
  const lockFile = `${file}.lock`;
  fs.writeFileSync(file, JSON.stringify({ version: 1, jobs: [], history: [] }));
  fs.writeFileSync(lockFile, JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));
  fs.mkdirSync(`${lockFile}.acquire`);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.throws(
    () => new HarborQueue({ file, run: async () => undefined }),
    /remove that acquisition-guard directory manually/,
  );
  assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token, 'dead-owner');
});

test('two stale-read recovery contenders produce one owner without overlapping execution', { timeout: 15000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harborqueue-stale-race-'));
  const file = path.join(directory, 'queue.json');
  const executionFile = path.join(directory, 'executions.log');
  const stopFile = path.join(directory, 'stop');
  const releases = [path.join(directory, 'release-a'), path.join(directory, 'release-b')];
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'ready', attemptCount: 0 }],
    history: [],
  }));
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));

  const helper = path.join(__dirname, 'test', 'ownership-contender.cjs');
  const children = ['a', 'b'].map((label, index) => fork(
    helper,
    [file, label, releases[index], stopFile, executionFile],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  ));
  t.after(() => {
    for (const child of children) if (child.exitCode === null) child.kill();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  await Promise.all(children.map((child) => childMessage(child, 'stale-read')));
  const winnerStarted = childMessage(children[0], 'started');
  fs.writeFileSync(releases[0], 'go');
  assert.deepEqual(await winnerStarted, { type: 'started', label: 'a' });

  const loserRejected = childMessage(children[1], 'rejected');
  fs.writeFileSync(releases[1], 'go');
  assert.match((await loserRejected).error, /already owned by live process/);
  assert.deepEqual(fs.readFileSync(executionFile, 'utf8').trim().split(/\r?\n/), ['start a']);

  const winnerCompleted = childMessage(children[0], 'completed');
  fs.writeFileSync(stopFile, 'stop');
  await winnerCompleted;
  assert.deepEqual(fs.readFileSync(executionFile, 'utf8').trim().split(/\r?\n/), ['start a', 'end a']);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).history.length, 1);
});

test('restart marks old running attempt interrupted and retries it at least once', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harborqueue-recovery-'));
  const file = path.join(directory, 'queue.json');
  const oldAttempt = 'attempt-before-crash';
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'running', attemptCount: 1, currentAttemptId: oldAttempt }],
    history: [{ attemptId: oldAttempt, jobId: 'cargo', number: 1, status: 'running', startedAt: '2026-01-01T00:00:00.000Z' }],
    updatedAt: '2026-01-01T00:00:00.000Z',
  }));
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2147483647, token: 'dead-owner' }));
  let calls = 0;
  const queue = new HarborQueue({ file, maxRetries: 1, run: async () => { calls += 1; return 'recovered'; } });
  t.after(async () => {
    await queue.close().catch(() => {});
    fs.rmSync(directory, { recursive: true, force: true });
  });
  assert.equal(queue.snapshot().history[0].status, 'interrupted');
  assert.equal(queue.snapshot().jobs[0].status, 'ready');
  queue.start();
  await queue.idle();
  assert.equal(calls, 1);
  assert.deepEqual(queue.snapshot().history.map((entry) => entry.status), ['interrupted', 'completed']);
  assert.deepEqual(queue.snapshot().history.map((entry) => entry.number), [1, 2]);
  assert.equal(new Set(queue.snapshot().history.map((entry) => entry.attemptId)).size, 2);
});

test('restart reports an exhausted crashed attempt as interrupted while failing its job', async (t) => {
  const state = {
    version: 1,
    jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'running', attemptCount: 1, currentAttemptId: 'crashed' }],
    history: [{ attemptId: 'crashed', jobId: 'cargo', number: 1, status: 'running' }],
  };
  const queue = checkpointFixture(t, state, { maxRetries: 0 })();
  t.after(() => queue.close());
  assert.equal(queue.snapshot().jobs[0].status, 'failed');
  assert.equal(queue.snapshot().history[0].status, 'interrupted');
});

test('cancelled in-flight checkpoint stays cancelled and is never recovered', async (t) => {
  const state = {
    version: 1,
    jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'cancelled', attemptCount: 1, currentAttemptId: 'cancelled' }],
    history: [{ attemptId: 'cancelled', jobId: 'cargo', number: 1, status: 'cancelled' }],
  };
  let runs = 0;
  const queue = checkpointFixture(t, state, { run: async () => { runs += 1; } })();
  t.after(() => queue.close());
  queue.start();
  await queue.idle();
  assert.equal(runs, 0);
  assert.equal(queue.snapshot().jobs[0].status, 'cancelled');
});

test('cancelling a ready retry preserves its honest failed attempt history', async (t) => {
  const state = {
    version: 1,
    jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'ready', attemptCount: 1 }],
    history: [{ attemptId: 'failed', jobId: 'cargo', number: 1, status: 'failed' }],
  };
  const queue = checkpointFixture(t, state)();
  t.after(() => queue.close());
  queue.cancel('cargo');
  assert.equal(queue.snapshot().jobs[0].status, 'cancelled');
  assert.deepEqual(queue.snapshot().history.map((entry) => entry.status), ['failed']);
});

test('cancelled work remains cancelled across restart and stale settlement cannot resurrect it', async (t) => {
  const gate = deferred();
  const { queue, file } = fixture(t, { run: async () => gate.promise });
  queue.add({ id: 'cancel-me' });
  queue.start();
  await turn();
  queue.cancel('cancel-me');
  gate.resolve('late-success');
  await queue.idle();
  assert.equal(queue.snapshot().jobs[0].status, 'cancelled');
  await queue.close();

  let restartedRuns = 0;
  const restarted = new HarborQueue({ file, run: async () => { restartedRuns += 1; } });
  restarted.start();
  await restarted.idle();
  assert.equal(restartedRuns, 0);
  assert.equal(restarted.snapshot().jobs[0].status, 'cancelled');
  await restarted.close();
});

test('asynchronous persistence failure rejects idle and fails closed', async (t) => {
  const gate = deferred();
  let inject = false;
  const { queue } = fixture(t, {
    run: async () => gate.promise,
    fault(stage) {
      if (inject && stage === 'before-rename') throw new Error('terminal write failed');
    },
  });
  queue.add({ id: 'cargo' });
  queue.start();
  await turn();
  const idle = queue.idle();
  inject = true;
  gate.resolve('result-that-cannot-be-committed');
  await assert.rejects(idle, /terminal write failed/);
  assert.match(queue.snapshot().failedClosed, /terminal write failed/);
  assert.equal(queue.snapshot().jobs[0].status, 'running');
  assert.throws(() => queue.add({ id: 'later' }), /terminal write failed/);
});

test('dashboard server exposes index.html and GET /api/state', async (t) => {
  const { queue } = fixture(t);
  queue.add({ id: 'visible' });
  const server = createServer({ queue });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const stateResponse = await fetch(`http://127.0.0.1:${port}/api/state`);
  assert.equal(stateResponse.status, 200);
  assert.equal((await stateResponse.json()).jobs[0].id, 'visible');
  const dashboardResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(dashboardResponse.status, 200);
  assert.match(await dashboardResponse.text(), /<title>HarborQueue dashboard<\/title>/);
});

test('malformed durable graphs are rejected without leaking ownership', () => {
  for (const state of [
    {
      version: 1,
      jobs: [{ id: 'a', dependsOn: ['absent'], status: 'queued', attemptCount: 0 }],
      history: [],
    },
    {
      version: 1,
      jobs: [
        { id: 'a', dependsOn: ['b'], status: 'queued', attemptCount: 0 },
        { id: 'b', dependsOn: ['a'], status: 'queued', attemptCount: 0 },
      ],
      history: [],
    },
  ]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'harborqueue-invalid-'));
    const file = path.join(directory, 'queue.json');
    fs.writeFileSync(file, JSON.stringify(state));
    assert.throws(() => new HarborQueue({ file, run: async () => undefined }), /Invalid HarborQueue checkpoint/);
    assert.equal(fs.existsSync(`${file}.lock`), false);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('checkpoint rejects duplicate or non-sequential attempt numbers per job', (t) => {
  const attempts = [
    [
      { attemptId: 'first', jobId: 'cargo', number: 1, status: 'failed' },
      { attemptId: 'second', jobId: 'cargo', number: 1, status: 'completed' },
    ],
    [
      { attemptId: 'first', jobId: 'cargo', number: 1, status: 'failed' },
      { attemptId: 'third', jobId: 'cargo', number: 3, status: 'completed' },
    ],
  ];
  for (const history of attempts) {
    const construct = checkpointFixture(t, {
      version: 1,
      jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'completed', attemptCount: 2 }],
      history,
    });
    assert.throws(construct, /attempt numbers.*cargo/);
  }
});

test('checkpoint rejects running attempts not exclusively owned by their running job', (t) => {
  const states = [
    {
      version: 1,
      jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'ready', attemptCount: 1 }],
      history: [{ attemptId: 'attempt-1', jobId: 'cargo', number: 1, status: 'running' }],
    },
    {
      version: 1,
      jobs: [{ id: 'cargo', dependsOn: [], payload: null, status: 'running', attemptCount: 1, currentAttemptId: 'other' }],
      history: [{ attemptId: 'attempt-1', jobId: 'cargo', number: 1, status: 'running' }],
    },
  ];
  for (const state of states) {
    assert.throws(checkpointFixture(t, state), /running attempt|running job/);
  }
});

test('checkpoint rejects terminal jobs that disagree with their latest attempt', (t) => {
  const mismatches = [
    ['completed', 'failed'],
    ['failed', 'completed'],
    ['cancelled', 'completed'],
  ];
  for (const [jobStatus, attemptStatus] of mismatches) {
    const construct = checkpointFixture(t, {
      version: 1,
      jobs: [{ id: `cargo-${jobStatus}`, dependsOn: [], payload: null, status: jobStatus, attemptCount: 1 }],
      history: [{ attemptId: `attempt-${jobStatus}`, jobId: `cargo-${jobStatus}`, number: 1, status: attemptStatus }],
    });
    assert.throws(construct, /terminal state mismatch/);
  }

  for (const status of ['completed', 'failed']) {
    const construct = checkpointFixture(t, {
      version: 1,
      jobs: [{ id: `cargo-${status}`, dependsOn: [], payload: null, status, attemptCount: 0 }],
      history: [],
    });
    assert.throws(construct, /terminal state mismatch/);
  }
});
