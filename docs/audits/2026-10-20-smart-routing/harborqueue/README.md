# HarborQueue

HarborQueue is a dependency-free local Node.js job scheduler and recovery simulator. It runs caller-supplied functions; it never evaluates job payloads or launches shell commands.

## API

```js
const { HarborQueue } = require('./scheduler.cjs');

const queue = new HarborQueue({
  file: './queue.json',
  concurrency: 3,
  maxRetries: 1,
  run: async (job, { signal, attemptId }) => {
    // Cooperatively stop if signal is aborted. Return JSON-serializable data.
    return { handled: job.id, attemptId };
  },
  // Optional deterministic fault injection hook:
  // fault(stage) { if (stage === 'before-rename') throw new Error('crash'); }
});

queue.add({ id: 'unload', payload: { berth: 2 } });
queue.add({ id: 'inspect', dependsOn: ['unload'], payload: null });
queue.start();
await queue.idle();
console.log(queue.snapshot());
await queue.close();
```

`add`, `start`, `cancel`, and `snapshot` are synchronous. `idle()` resolves when no attempt occupies a slot and no ready job can run; queued descendants of failed or cancelled prerequisites therefore do not keep it pending. `close()` cancels running jobs, waits for their actual run promises to settle, and then releases ownership. Calls that are invalid (duplicate IDs, unknown dependencies, cycles, repeated start, unknown or terminal cancellation, or calls after close) throw rather than claiming success.

Jobs move through `queued`, `ready`, `running`, `completed`, `failed`, and `cancelled`. A dependency becomes runnable only after every prerequisite completes. Concurrency is configurable from one through three and defaults to the maximum of three physical slots. `maxRetries` counts retries after the initial attempt. Each physical execution gets a unique `attemptId`, and its result/error is recorded on that history entry.

## Recovery and ownership semantics

Execution is **at least once**, not exactly once. The checkpoint is committed before `run` is called. If the process dies after an external side effect but before recording completion, a new owner records that old attempt as `interrupted` and may execute the job again, subject to `maxRetries`. Callers must make external effects idempotent when duplicates matter.

Only one live `HarborQueue` may own a state file. A sidecar `<file>.lock` contains the owner PID and a random token. Construction fails closed while that PID is live or ownership cannot be verified. Acquisition and dead-owner reclamation are serialized by atomically creating `<file>.lock.acquire`; after entering that guard, a contender re-reads the current lock and never acts on an earlier observation. A stale lock is removed only while holding the guard and after the OS reports its current PID dead. There is no time-based lease. `close()` removes only its own token-matching lock. PID reuse and filesystems that do not provide reliable exclusive-create/directory-create semantics are outside this local simulator's guarantees.

The acquisition guard normally exists only during construction, so a later process still recovers automatically after a steady-state owner dies. If a process crashes during that short acquisition/reclamation section, the guard is deliberately not reclaimed automatically: proving that no other process is still inside the section is not possible from elapsed time or a PID record alone. Construction then fails closed with the guard path. An operator must verify that no process is acquiring or owns that queue, then manually remove only the reported `<file>.lock.acquire` directory before retrying. Do not remove the ordinary `<file>.lock` merely because it is old.

Cancelled jobs are durable and never recovered. Cancelling a running job aborts `context.signal`, but its physical concurrency slot remains occupied until the caller's `run` promise settles. A late callback is matched to both job and attempt ID, so it cannot overwrite cancellation or a newer attempt.

## Persistence guarantees and limits

Every state change writes JSON to a same-directory temporary file, flushes that file with `fsync`, and atomically renames it over the checkpoint. The scheduler then attempts to fsync the containing directory. A `before-rename` fault leaves the previous checkpoint valid and the public mutation throws with memory rolled back. An asynchronous checkpoint failure makes the scheduler fail closed and rejects pending `idle()` calls.

Atomic replacement and power-loss durability ultimately depend on the operating system and filesystem. Directory fsync is best-effort because Windows does not expose it consistently. This design does not protect against disk/controller lies, manual checkpoint or lock edits, network filesystems with weak rename/locking behavior, or corruption after a successful rename. Temporary files from a process killed mid-write may remain and are ignored.

Malformed durable input is rejected before scheduling, including duplicate IDs or attempt IDs, non-sequential per-job attempt numbers, missing dependencies, cycles, running attempts without their matching running job, and terminal jobs that disagree with their latest attempt. Payloads must be losslessly representable as JSON: nested functions, `undefined`, symbols, non-finite numbers, sparse arrays, non-plain objects, and cycles are rejected instead of being discarded or rewritten. Results must be JSON-serializable.

## Dashboard

Start the local dashboard with an optional port argument:

```sh
node server.cjs 3000
```

Set `HARBOR_QUEUE_FILE` to choose the checkpoint (default `./harborqueue-state.json`). The server serves `index.html` at `/` and the current snapshot at `GET /api/state`. It intentionally does not start the queue and has no job executor, so viewing state cannot execute payloads.

## Tests

```sh
node --test scheduler.test.cjs
node --test scheduler.test.cjs test/dashboard.test.cjs
```

The tests use injected promises and `setImmediate`, not timing sleeps, for deterministic concurrency and cancellation checks.
