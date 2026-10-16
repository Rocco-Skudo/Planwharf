'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { askCliArgs } = require('./runner.cjs');
const { runAgent } = require('./api-agent.cjs');
const { apiConfig } = require('./external-adapters.cjs');

test('unverified CLI advisory transports fail before executable discovery or launch', () => {
  for (const provider of ['codex', 'grok', 'antigravity', 'configured-cli']) {
    assert.throws(() => askCliArgs({ purpose: 'supervisor', model: { provider, cli: 'exact-fixture' }, folder: '.', question: 'Explain the evidence' }), /No verified no-tool Supervisor transport/);
  }
});

test('advisory API omits tools and rejects model attempts to execute shell, write or dispatch', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-supervisor-transport-'));
  try {
    for (const apiProtocol of ['openai', 'anthropic']) {
    const config = apiConfig({ baseUrl: 'http://127.0.0.1:1/v1', apiProtocol });
    for (const name of ['run_command', 'write_file', 'dispatch_worker', 'approve_megatask']) {
      let requests = 0;
      await assert.rejects(() => runAgent({ config, model: 'exact-fixture', prompt: 'Supplied execution facts only', lead: true, advisory: true }, { folder: dir, request: async (_url, init) => {
        requests++; const body = JSON.parse(init.body); assert.equal(body.model, 'exact-fixture'); assert.equal(body.tools, undefined);
        const input = { path: 'forbidden.txt', content: 'forbidden', command: 'untrusted command' };
        return new Response(JSON.stringify(apiProtocol === 'anthropic'
          ? { model: 'exact-fixture', content: [{ type: 'tool_use', id: 'malicious', name, input }], stop_reason: 'tool_use' }
          : { model: 'exact-fixture', choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'malicious', type: 'function', function: { name, arguments: JSON.stringify(input) } }] } }] }));
      } }), /cannot execute tools/);
      assert.equal(requests, 1); assert.deepEqual(fs.readdirSync(dir), []);
    }
    }
  } finally {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith('pw-supervisor-transport-'));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
