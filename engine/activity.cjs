'use strict';
const short = text => String(text || '').replace(/\s+/g, ' ').trim().slice(0, 260);
const fileName = value => typeof value === 'string' ? value.replace(/\\/g, '/').split('/').pop() : '';
function commandActivity(command) {
  const text = String(command || '');
  const files = [...text.matchAll(/(?:[\w./\\-]+\.(?:test\.|spec\.)?[a-z]{1,5})\b/gi)].map(match => fileName(match[0]));
  const target = files.find(file => /test|spec|verify/i.test(file)) || files[0];
  if (/\b(Get-Content|cat|type|head|tail)\b/i.test(text)) return `Reading ${target || 'a project file'}.`;
  if (/\b(rg|grep|findstr|Select-String)\b/.test(text)) return `Searching project files${target ? ` near ${target}` : ''}.`;
  if (/\b(Get-ChildItem|ls|dir|find)\b/i.test(text)) return 'Inspecting project folders.';
  if (/\b(pytest|unittest|vitest|jest)\b|\b(?:npm|pnpm|yarn|cargo|dotnet)\s+(?:run\s+)?test\b|node\s+--test\b|\b(?:test|verify)[\w.-]*\.(?:cjs|js|py|ps1)\b|\b[\w.-]+\.(?:test|spec)\./i.test(text)) return `Running tests${target ? ` for ${target}` : ''}.`;
  if (/\b(build|compile|csc|tsc|msbuild)\b/i.test(text)) return `Building the application${target ? ` using ${target}` : ''}.`;
  if (/\b(Set-Content|Out-File|Add-Content|tee)\b/i.test(text)) return `Writing ${target || 'a project file'}.`;
  if (/\bgit\b.*\b(diff|status|log|show)\b/i.test(text)) return 'Reviewing source changes and Git history.';
  if (/\b(npm|pnpm|yarn|pip)\s+(?:install|add)\b/i.test(text)) return 'Installing project dependencies.';
  return 'Running a project command.';
}
function toolActivity(name, input = {}) {
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { input = {}; } }
  const target = fileName(input.AbsolutePath || input.TargetFile || input.file_path || input.path || input.file || input.filename);
  if (/view_file|read_file|read_text|open_file/i.test(name)) return `Reading ${target || 'a project file'}.`;
  if (/write_to_file|write_file|replace_file|edit_file|apply_patch|replace_string|multi_replace/i.test(name)) {
    const patch = input.patch || input.input || input.CodeContent || '';
    const patchTarget = typeof patch === 'string' ? fileName(patch.match(/\*\*\* (?:Update|Add) File:\s*([^\r\n]+)/)?.[1]) : '';
    return `Writing project files${target || patchTarget ? `: ${target || patchTarget}` : ''}.`;
  }
  if (/run_command|exec_command|command_execution|shell|terminal|bash/i.test(name)) return commandActivity(input.CommandLine || input.command || input.cmd || '');
  if (/command_status/i.test(name)) return 'Checking the result of a running command.';
  if (/search|grep/i.test(name)) return `Searching project files${target ? ` near ${target}` : ''}.`;
  if (/list_dir|list_files|find_by_name/i.test(name)) return 'Inspecting project folders.';
  if (/browser|screenshot/i.test(name)) return 'Checking the application in the browser.';
  if (/web|fetch|browse/i.test(name)) return 'Reading documentation and online sources.';
  if (/finish/i.test(name)) return 'Preparing the final work report.';
  return 'Using a project tool.';
}
function plainActivity(text) {
  const line = short(text);
  if (!line || /[{}]|conversation_id|step_index|tool_info|"event"|"type"/.test(line)) return '';
  if (/\b[1-9]\d*\s+failed\b|\bfailed\s*:\s*[1-9]|^(?:error[:\s]|FAIL\b|Traceback\b)|\bhit an error\b/i.test(line)) return `Hit an error: ${line}`;
  if (/\b\d+\s+(?:passed|passing)|^PASS[:\s]|^OK:/i.test(line)) return `Test output: ${line}`;
  if (/\b(writing|wrote|created|creating|saving|editing)\b/i.test(line)) return `Writing project files: ${line}`;
  if (/\b(reading|inspecting|reviewing|searching|testing|running tests|building)\b/i.test(line)) return line;
  return `Worker update: ${line}`;
}
function eventActivity(row) {
  const step = row.step_update;
  if (step?.step_type === 'tool' || step?.step_type === 'tool_call') {
    const action = toolActivity(step.tool_name || step.tool_info?.name || '', step.tool_info?.parameters || step.parameters || {});
    if (step.state === 'ERROR' || step.state === 'FAILED') return `Hit an error while ${action[0].toLowerCase() + action.slice(1)}`;
    return step.state === 'DONE' ? `Finished ${action[0].toLowerCase() + action.slice(1)}` : action;
  }
  if (step?.step_type === 'agent_response') return step.text_delta ? plainActivity(step.text_delta) : step.state === 'ACTIVE' ? 'Preparing a response about the assigned task.' : '';
  const item = row.item;
  if (item?.type === 'command_execution') {
    if (typeof item.exit_code === 'number' && item.exit_code !== 0) return 'Hit an error while running a project command.';
    const action = commandActivity(item.command);
    return row.type === 'item.completed' ? `Finished ${action[0].toLowerCase() + action.slice(1)}` : action;
  }
  if (item?.type === 'file_change') return `Writing project files${item.changes?.length ? ': ' + item.changes.map(change => fileName(change.path)).filter(Boolean).join(', ') : ''}.`;
  if (item?.type === 'agent_message') return plainActivity(item.text);
  const block = row.content_block || row.event?.content_block;
  if (block?.type === 'tool_use') return toolActivity(block.name || '', block.input || {});
  if (row.type === 'assistant' && Array.isArray(row.message?.content)) {
    const tool = row.message.content.find(part => part.type === 'tool_use');
    if (tool) return toolActivity(tool.name, tool.input);
    return row.message.content.filter(part => part.type === 'text').map(part => plainActivity(part.text)).filter(Boolean).join(' ');
  }
  if (row.event === 'result' && row.result) return row.result.status === 'SUCCESS' ? 'Worker finished and returned its report.' : 'Worker reported an unsuccessful result.';
  if (row.type === 'result') return row.is_error ? 'Worker reported an error.' : 'Worker returned its final response.';
  if (row.event === 'init' || row.type === 'thread.started') return 'Worker connected. Starting the assigned task.';
  return '';
}
function activityMessages(tail) {
  const messages = [];
  for (const line of String(tail || '').replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/)) {
    let message;
    try { message = eventActivity(JSON.parse(line)); }
    catch {
      // A clipped protocol event is still machine data, not a human update.
      const name = line.match(/"tool_name"\s*:\s*"([^"\n]+)/)?.[1];
      message = name ? toolActivity(name) : plainActivity(line);
    }
    if (message && messages.at(-1) !== short(message)) messages.push(short(message));
  }
  return messages;
}
function interpretActivity(tail, facts, alive) {
  const message = activityMessages(tail).at(-1);
  if (message) return alive === false ? `Stopped. Last recorded action: ${message}` : message;
  return alive ? 'Worker is running. Waiting for a readable activity update.' : '';
}
function workerReport(tail) {
  let report = '';
  for (const line of String(tail || '').split(/\r?\n/)) {
    try {
      const row = JSON.parse(line);
      const text = row.event === 'result' ? row.result?.response : row.item?.type === 'agent_message' ? row.item.text : row.type === 'assistant' ? (row.message?.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n') : row.type === 'result' && typeof row.result === 'string' ? row.result : '';
      if (typeof text === 'string' && text.trim()) report = text;
    } catch {}
  }
  return report;
}
module.exports = { activityMessages, interpretActivity, workerReport };
