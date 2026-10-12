'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { askOrchestrator, askPrompt, promptFor } = require('./runner.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-all-provider-transport-'));
const saved = {};
const promptDirs = new Set();
const hash = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// A real native fixture accepts the providers' actual arguments on Windows.
// It reads their documented input channels and emits matching result events.
// No model, credentials, personal notebook, or provider process is involved.
const nativeSource = `
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
class FakeProvider {
  static int Main(string[] args) {
    Console.InputEncoding = new UTF8Encoding(false);
    Console.OutputEncoding = new UTF8Encoding(false);
    if (File.Exists("early-exit")) { Console.Error.Write("isolated early exit"); return 7; }
    var json = new JavaScriptSerializer(); json.MaxJsonLength = int.MaxValue;
    int file = Array.IndexOf(args, "--prompt-file");
    int stream = Array.IndexOf(args, "--input-format");
    string input = "", prompt = "";
    if (file >= 0) prompt = File.ReadAllText(args[file + 1], Encoding.UTF8);
    else {
      input = Console.In.ReadToEnd();
      if (stream >= 0) {
        var row = json.Deserialize<Dictionary<string, object>>(input);
        if ((string)row["event"] != "user") return 8;
        prompt = (string)((Dictionary<string, object>)row["message"])["content"];
      } else prompt = input;
    }
    File.WriteAllText("received.json", json.Serialize(new { args = args, prompt = prompt, input = input }), new UTF8Encoding(false));
    if (stream >= 0 && File.Exists("result-error")) { Console.WriteLine(json.Serialize(new { @event = "result", result = new { status = "ERROR", response = "", error = "isolated failed turn" } })); return 0; }
    string text;
    using (var sha = SHA256.Create()) text = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(prompt))).Replace("-", "").ToLowerInvariant();
    if (stream >= 0) Console.WriteLine(json.Serialize(new { @event = "result", result = new { status = "SUCCESS", response = text, duration_seconds = 0.001 } }));
    else if (file >= 0) Console.WriteLine(json.Serialize(new { type = "result", result = text, duration_ms = 1 }));
    else Console.WriteLine(json.Serialize(new { type = "item.completed", item = new { type = "agent_message", text = text } }));
    return 0;
  }
}
`;
const scriptSource = `#!/usr/bin/env node
const fs = require('node:fs'), crypto = require('node:crypto');
const args = process.argv.slice(2);
if (fs.existsSync('early-exit')) { process.stderr.write('isolated early exit'); process.exit(7); }
const file = args.indexOf('--prompt-file'), stream = args.indexOf('--input-format');
const input = file < 0 ? fs.readFileSync(0, 'utf8') : '';
const prompt = file >= 0 ? fs.readFileSync(args[file + 1], 'utf8') : stream >= 0 ? JSON.parse(input).message.content : input;
fs.writeFileSync('received.json', JSON.stringify({args,prompt,input}));
if (stream >= 0 && fs.existsSync('result-error')) { console.log(JSON.stringify({event:'result',result:{status:'ERROR',response:'',error:'isolated failed turn'}})); process.exit(0); }
const text = crypto.createHash('sha256').update(prompt, 'utf8').digest('hex');
console.log(JSON.stringify(stream >= 0 ? {event:'result',result:{status:'SUCCESS',response:text}} : file >= 0 ? {type:'result',result:text} : {type:'item.completed',item:{type:'agent_message',text}}));
`;

function receipt(folder) {
  const value = JSON.parse(fs.readFileSync(path.join(folder, 'received.json'), 'utf8'));
  const file = value.args.indexOf('--prompt-file');
  if (file >= 0) {
    const promptFile = value.args[file + 1];
    assert.ok(!path.resolve(promptFile).startsWith(path.resolve(folder) + path.sep), 'Prompt artifacts stay outside linked source');
    promptDirs.add(path.dirname(promptFile));
  }
  assert.ok(value.args.every(arg => arg.length < 32767));
  assert.ok(!value.args.includes('-p'));
  return value;
}

async function main() {
  let executable;
  if (process.platform === 'win32') {
    const compiler = path.join(process.env.WINDIR || 'C:/Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
    assert.ok(fs.existsSync(compiler), '.NET Framework compiler is needed for the native Windows fixture');
    const source = path.join(dir, 'FakeProvider.cs');
    executable = path.join(dir, 'FakeProvider.exe');
    fs.writeFileSync(source, nativeSource);
    const built = spawnSync(compiler, ['/nologo', '/r:System.Web.Extensions.dll', '/out:' + executable, source], { encoding: 'utf8', timeout: 10000 });
    assert.equal(built.status, 0, built.stdout + built.stderr);
  } else {
    executable = path.join(dir, 'fake-provider');
    fs.writeFileSync(executable, scriptSource, { mode: 0o700 });
  }
  for (const [provider, cli] of [['codex', 'gpt-6-astra'], ['antigravity', 'gemini-3.1-pro-high'], ['grok', 'grok-4.6']]) {
    const env = 'PLANWHARF_' + provider.toUpperCase(); saved[env] = process.env[env]; process.env[env] = executable;
    const folder = path.join(dir, provider); fs.mkdirSync(folder);
    const model = { provider, cli, label: 'Isolated ' + provider };
    const detail = 'Full discussion \u00e8 \u65e5\u672c\u8a9e \u{1f3ce}\u{fe0f}, quotes " and newlines.\n'.repeat(4000);
    const info = { model, folder, question: 'Follow the full long conversation.', state: { history: [{ user: detail, orchestrator: 'Prior answer.' }] } };
    const expected = askPrompt(info); assert.ok(expected.length > 32767);
    const lead = await askOrchestrator(info);
    assert.equal(lead.answer, hash(expected), provider + ' receives the entire lead prompt');
    const received = receipt(folder); assert.equal(received.prompt, expected);
    if (provider === 'antigravity') {
      assert.equal(received.input.split('\n').filter(Boolean).length, 1, 'AGY gets exactly one complete JSON user event');
      assert.equal(JSON.parse(received.input).event, 'user');
    }
    const opts = { folder, result: path.join(folder, 'result.txt'), title: 'Isolated implementation', detail, worker: 'Fixture', attempt: 'fixture', model };
    fs.writeFileSync(path.join(folder, 'job.json'), JSON.stringify(opts));
    const bootstrap = path.join(folder, 'bootstrap.cjs');
    fs.writeFileSync(bootstrap, `const opts=require('./job.json');const args=['node','runner'];for(const key of ['folder','result','title','detail','worker','attempt'])args.push('--'+key,opts[key]);args.push('--model-json',JSON.stringify(opts.model));require(${JSON.stringify(path.join(__dirname, 'runner.cjs'))}).run(args);`);
    const worker = spawnSync(process.execPath, [bootstrap], { encoding: 'utf8', timeout: 10000, env: process.env });
    assert.equal(worker.error, undefined); assert.equal(worker.status, 0, provider + ': ' + worker.stderr);
    assert.match(fs.readFileSync(opts.result, 'utf8'), /STATUS: COMPLETE/);
    assert.equal(receipt(folder).prompt, promptFor(opts), provider + ' receives the entire worker prompt');
    if (provider === 'antigravity') {
      fs.writeFileSync(path.join(folder, 'early-exit'), 'fixture');
      const early = await askOrchestrator({ model, folder, question: 'x'.repeat(4 * 1024 * 1024) });
      assert.match(early.answer, /CLI failed/);
      fs.rmSync(path.join(folder, 'early-exit'));
      fs.writeFileSync(path.join(folder, 'result-error'), 'fixture');
      const failedTurn = await askOrchestrator({ model, folder, question: 'Isolated failed turn.' });
      assert.match(failedTurn.answer, /antigravity CLI failed \(ERROR\): isolated failed turn/);
      const failedWorker = spawnSync(process.execPath, [bootstrap], { encoding: 'utf8', timeout: 10000, env: process.env });
      assert.notEqual(failedWorker.status, 0, 'A zero-exit AGY error turn must fail the worker result');
      assert.match(fs.readFileSync(opts.result, 'utf8'), /STATUS: FAILED/);
    }
  }
  console.log('OK: all native provider transports deliver exact long Unicode prompts through real lead/worker child processes; AGY early exit is handled.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const [env, value] of Object.entries(saved)) { if (value === undefined) delete process.env[env]; else process.env[env] = value; }
  for (const inputDir of promptDirs) fs.rmSync(inputDir, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});
