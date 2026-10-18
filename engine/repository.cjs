'use strict';
const fs = require('node:fs/promises');
const { linkedWorkspace, safeGitWorkspace, gitEnvironment } = require('./project-workspace.cjs');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

function githubRepo(value) {
  const text = String(value || '').trim();
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(text);
  return match ? `${match[1]}/${match[2]}` : null;
}
function repositoryAddress(value) {
  const github = githubRepo(value);
  if (github) return { provider: 'github', repository: github, origin: 'https://github.com', baseUrl: 'https://github.com', url: `https://github.com/${github}` };
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    const parts = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
    if (parts.length < 2 || parts.some(part => !/^[\w.-]+$/.test(part) || part === '.' || part === '..')) return null;
    const repository = parts.splice(-2).join('/');
    const baseUrl = url.origin + (parts.length ? '/' + parts.join('/') : '');
    return { provider: 'gitea', repository, origin: url.origin, baseUrl, url: baseUrl + '/' + repository };
  } catch { return null; }
}
function giteaToken(address, env = process.env) {
  const hostKey = new URL(address.origin).host.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return env['PLANWHARF_GITEA_TOKEN_' + hostKey] || (env.PLANWHARF_GITEA_ORIGIN === address.origin ? env.PLANWHARF_GITEA_TOKEN : null);
}
function cleanError(value) {
  return String(value || '').replace(/https:\/\/[^\s/@]+:[^\s/@]+@/g, 'https://[redacted]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted]').slice(-900).trim();
}
function run(command, args, options = {}) {
  return new Promise(resolve => execFile(command, args, { encoding: 'utf8', windowsHide: true, timeout: 25000,
    maxBuffer: 1024 * 1024, env: { ...gitEnvironment(), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' }, ...options },
  (error, stdout, stderr) => resolve({ ok: !error, stdout: String(stdout || '').trim(), error: error ? cleanError(stderr || error.message) : null })));
}
function relation(ahead, behind) {
  return ahead && behind ? 'diverged' : ahead ? 'ahead' : behind ? 'behind' : 'in-sync';
}
function createRepositoryInspector({ execute = run, ttlMs = 60000, fetchRemote = globalThis.fetch, env = process.env } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function inspect(project) {
    const folder = linkedWorkspace(project.folder);
    const result = { checkedAt: new Date().toISOString(), folder, github: project.github || null,
      local: { exists: false, readable: false, writable: false, git: false },
      remote: { accessible: false }, comparison: { status: 'unknown', ahead: null, behind: null } };
    const git = args => execute('git', ['-C', folder, ...args]);
    if (folder) {
      try {
        result.local.exists = (await fs.stat(folder)).isDirectory();
        await fs.access(folder, fs.constants.R_OK); result.local.readable = true;
        try { await fs.access(folder, fs.constants.W_OK); result.local.writable = true; } catch {}
      } catch (error) { result.local.error = cleanError(error.message); }
      if (result.local.readable && safeGitWorkspace(folder)) {
        const root = await git(['rev-parse', '--show-toplevel']);
        result.local.git = root.ok && linkedWorkspace(root.stdout) === folder;
        if (result.local.git) {
          const rows = await Promise.all([
            git(['symbolic-ref', '--quiet', '--short', 'HEAD']), git(['rev-parse', '--verify', 'HEAD']),
            git(['status', '--porcelain']), git(['remote', 'get-url', 'origin']), git(['rev-parse', '--is-shallow-repository'])
          ]);
          result.local.gitRoot = root.stdout;
          result.local.branch = rows[0].ok ? rows[0].stdout : null;
          result.local.head = rows[1].ok ? rows[1].stdout : null;
          result.local.changes = rows[2].ok ? rows[2].stdout.split(/\r?\n/).filter(Boolean) : null;
          result.local.uncommitted = result.local.changes ? result.local.changes.length : null;
          result.local.originRepository = rows[3].ok ? githubRepo(rows[3].stdout) : null;
          result.local.shallow = rows[4].stdout === 'true';
        }
      }
    }
    const address = repositoryAddress(project.github);
    const repo = address?.repository;
    if (!address) { result.remote.error = project.github ? 'Invalid repository URL.' : 'No repository linked.'; return result; }
    result.remote.provider = address.provider;
    if (address.provider === 'gitea') return inspectGitea(address, result, git);
    result.remote.repository = repo;
    const meta = await execute('gh', ['api', `repos/${repo}`, '--jq', '{name: .full_name, private: .private, defaultBranch: .default_branch, permissions: .permissions}']);
    if (!meta.ok) {
      result.remote.error = `GitHub access failed. Check gh auth status and repository permissions. ${meta.error}`;
      result.comparison.status = 'access-error'; return result;
    }
    try { Object.assign(result.remote, JSON.parse(meta.stdout), { accessible: true }); }
    catch { result.remote.error = 'GitHub returned unreadable repository metadata.'; return result; }
    if (!result.local.git || !result.local.head) { result.comparison.status = 'no-local-history'; return result; }
    if (result.local.originRepository && result.local.originRepository.toLowerCase() !== repo.toLowerCase()) {
      result.warning = 'Local origin differs from the linked GitHub repository. Comparison uses the explicitly linked repository.';
    }
    let branch = result.local.branch || result.remote.defaultBranch;
    let remoteBranch = await execute('gh', ['api', `repos/${repo}/branches/${encodeURIComponent(branch)}`, '--jq', '.commit.sha']);
    result.remote.localBranchPublished = remoteBranch.ok;
    if (!remoteBranch.ok && /404|Not Found/i.test(remoteBranch.error || '') && branch !== result.remote.defaultBranch) {
      branch = result.remote.defaultBranch;
      remoteBranch = await execute('gh', ['api', `repos/${repo}/branches/${encodeURIComponent(branch)}`, '--jq', '.commit.sha']);
    }
    result.remote.branch = branch;
    if (!remoteBranch.ok || !/^[a-f0-9]{40,64}$/i.test(remoteBranch.stdout)) {
      result.remote.error = remoteBranch.error || 'Remote branch has no readable commit.'; return result;
    }
    result.remote.head = remoteBranch.stdout;
    const ref = 'refs/planwharf/inspection/' + crypto.createHash('sha256').update(repo + '/' + branch).digest('hex').slice(0, 24);
    const fetched = await git(['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential',
      'fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', `https://github.com/${repo}.git`, `+refs/heads/${branch}:${ref}`]);
    if (!fetched.ok) { result.comparison.error = `Cannot fetch current remote history: ${fetched.error}`; return result; }
    const fetchedHead = await git(['rev-parse', '--verify', ref]);
    if (!fetchedHead.ok) { result.comparison.error = fetchedHead.error; return result; }
    result.remote.head = fetchedHead.stdout;
    result.remote.ref = ref;
    result.remote.fetchedAt = new Date().toISOString();
    const base = await git(['merge-base', result.local.head, ref]);
    if (!base.ok) {
      result.comparison.status = result.local.shallow ? 'shallow-history' : 'unrelated-history';
      return result;
    }
    const counts = await git(['rev-list', '--left-right', '--count', `${result.local.head}...${ref}`]);
    const match = /^(\d+)\s+(\d+)$/.exec(counts.stdout);
    if (!counts.ok || !match) { result.comparison.error = counts.error || 'Unreadable commit comparison.'; return result; }
    const ahead = Number(match[1]), behind = Number(match[2]);
    result.comparison = { status: relation(ahead, behind), ahead, behind, localBranch: result.local.branch,
      remoteBranch: branch, localBranchPublished: result.remote.localBranchPublished, mergeBase: base.stdout };
    return result;
  }
  async function inspectGitea(address, result, git) {
    const token = giteaToken(address, env);
    const request = async resource => {
      const response = await fetchRemote(address.baseUrl + '/api/v1/repos/' + address.repository + resource, {
        headers: { Accept: 'application/json', ...(token ? { Authorization: 'token ' + token } : {}) },
        redirect: 'error', signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) throw new Error('Gitea HTTP ' + response.status + '. Check repository access and the token configured for this host.');
      return response.json();
    };
    try {
      const metadata = await request('');
      if (typeof metadata.default_branch !== 'string' || !metadata.default_branch) throw new Error('Gitea returned unreadable repository metadata (default_branch missing).');
      Object.assign(result.remote, { accessible: true, repository: address.repository, private: metadata.private, defaultBranch: metadata.default_branch, permissions: metadata.permissions });
      if (!result.local.git || !result.local.head) { result.comparison.status = 'no-local-history'; return result; }
      let branch = result.local.branch || metadata.default_branch;
      let remoteBranch;
      try { remoteBranch = await request('/branches/' + encodeURIComponent(branch)); result.remote.localBranchPublished = true; }
      catch (error) {
        if (!/HTTP 404\b/.test(error.message) || branch === metadata.default_branch) throw error;
        result.remote.localBranchPublished = false; branch = metadata.default_branch;
        remoteBranch = await request('/branches/' + encodeURIComponent(branch));
      }
      if (!/^[a-f0-9]{40,64}$/i.test(remoteBranch.commit?.id || '')) throw new Error('Gitea returned unreadable branch metadata (commit.id missing).');
      const ref = 'refs/planwharf/inspection/' + crypto.createHash('sha256').update(address.url + '/' + branch).digest('hex').slice(0, 24);
      const options = token ? { env: { ...gitEnvironment(), GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never',
        GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.' + address.baseUrl + '/.extraheader', GIT_CONFIG_VALUE_0: 'Authorization: token ' + token } } : {};
      const fetched = await execute('git', ['-C', result.folder, '-c', 'http.followRedirects=false', 'fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules', address.url + '.git', '+refs/heads/' + branch + ':' + ref], options);
      if (!fetched.ok) throw new Error('Cannot fetch Gitea history: ' + fetched.error);
      const head = await git(['rev-parse', '--verify', ref]);
      if (!head.ok) throw new Error(head.error || 'Cannot read fetched Gitea commit.');
      Object.assign(result.remote, { branch, head: head.stdout, ref, fetchedAt: new Date().toISOString() });
      const base = await git(['merge-base', result.local.head, ref]);
      if (!base.ok) { result.comparison.status = result.local.shallow ? 'shallow-history' : 'unrelated-history'; return result; }
      const counts = await git(['rev-list', '--left-right', '--count', result.local.head + '...' + ref]);
      const match = /^(\d+)\s+(\d+)$/.exec(counts.stdout);
      if (!counts.ok || !match) throw new Error(counts.error || 'Unreadable commit comparison.');
      const ahead = Number(match[1]), behind = Number(match[2]);
      result.comparison = { status: relation(ahead, behind), ahead, behind, localBranch: result.local.branch, remoteBranch: branch, localBranchPublished: result.remote.localBranchPublished, mergeBase: base.stdout };
    } catch (error) {
      result.remote.error = cleanError(token ? String(error.message).split(token).join('[redacted]') : error.message);
      result.comparison.status = result.remote.accessible ? 'unknown' : 'access-error';
    }
    return result;
  }
  return async (project, { force = false } = {}) => {
    const key = JSON.stringify([project.folder, project.github]);
    if (!force && cache.has(key) && Date.now() - cache.get(key).at < ttlMs) return structuredClone(cache.get(key).value);
    if (pending.has(key)) return structuredClone(await pending.get(key));
    const work = inspect(project).catch(error => ({ checkedAt: new Date().toISOString(), folder: project.folder,
      github: project.github, error: cleanError(error.message), comparison: { status: 'unknown', ahead: null, behind: null } }));
    pending.set(key, work);
    try { const value = await work; cache.set(key, { at: Date.now(), value }); return structuredClone(value); }
    finally { pending.delete(key); }
  };
}
module.exports = { createRepositoryInspector, githubRepo, repositoryAddress, giteaToken, relation, cleanError };
