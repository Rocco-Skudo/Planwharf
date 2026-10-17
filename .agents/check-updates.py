"""Read-only upstream checks for project-local skills (Python standard library)."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen


def fetch_json(path):
    request = Request('https://api.github.com/' + path,
                      headers={'User-Agent': 'project-skill-update-check',
                               'Accept': 'application/vnd.github+json'})
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def tree(repo, revision):
    result = fetch_json(f'repos/{repo}/git/trees/{revision}?recursive=1')
    if result.get('truncated'):
        raise ValueError('GitHub returned an incomplete tree')
    return {item['path']: item['sha'] for item in result['tree']
            if item['type'] == 'blob'}


def skill_files(entries, prefix):
    return {path[len(prefix) + 1:]: sha for path, sha in entries.items()
            if path.startswith(prefix + '/')}


def check(root, offline=False):
    manifests = sorted((root / '.agents').glob('*-install.json'))
    if not manifests:
        print('UNKNOWN: no pinned installation manifests available')
        return 1
    unknown = False
    for manifest in manifests:
        try:
            data = json.loads(manifest.read_text(encoding='utf-8-sig'))
            source = data['source'].removesuffix('.git').rstrip('/')
            match = re.fullmatch(r'https://github.com/([\w.-]+/[\w.-]+)', source)
            revision = data['revision']
            if not match or not re.fullmatch(r'[0-9a-fA-F]{40}', revision):
                raise ValueError('unsupported source or unpinned revision')
            repo = match.group(1)
            installed = data['skills']
            for skill in installed:
                name = skill['name']
                if name in ('.', '..') or '/' in name or '\\' in name:
                    raise ValueError('invalid local skill name')
                if not (root / '.agents' / 'skills' / name / 'SKILL.md').is_file():
                    raise ValueError(f'missing installed skill: {name}')
            if offline:
                print(f'VALIDATED: {repo}: {len(installed)} installed skills; upstream NOT CHECKED')
                continue
            latest = fetch_json(f'repos/{repo}/commits?per_page=1')[0]['sha']
            baseline = tree(repo, revision)
            current = baseline if latest == revision else tree(repo, latest)
            updated, local_changes = [], []
            for skill in installed:
                name, prefix = skill['name'], skill['upstreamPath'].rstrip('/')
                before, after = skill_files(baseline, prefix), skill_files(current, prefix)
                if not before:
                    raise ValueError(f'installed skill missing from pinned upstream tree: {name}')
                if before != after:
                    updated.append(name)
                for relative, expected in before.items():
                    relative_path = Path(relative)
                    if relative_path.is_absolute() or '..' in relative_path.parts:
                        raise ValueError('invalid upstream file path')
                    local = root / '.agents' / 'skills' / name / relative_path
                    if not local.is_file():
                        local_changes.append(name)
                        break
                    content = local.read_bytes()
                    actual = hashlib.sha1(b'blob ' + str(len(content)).encode() + b'\0' + content).hexdigest()
                    if actual != expected:
                        local_changes.append(name)
                        break
            print(f'{repo}: installed {revision[:12]}, latest {latest[:12]}')
            if updated:
                print('UPDATES AVAILABLE for installed skills: ' + ', '.join(updated))
                print(f'Compare: {source}/compare/{revision}...{latest}')
            else:
                print('UP TO DATE: no upstream changes to the installed skill directories')
            if local_changes:
                print('LOCAL DIFFERENCES (preserve during updates): ' + ', '.join(local_changes))
        except Exception as error:
            unknown = True
            print(f'UNKNOWN: {manifest.name}: {type(error).__name__}: {error}')
    return 1 if unknown else 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='validate manifests without checking upstream')
    args = parser.parse_args()
    sys.exit(check(Path(__file__).resolve().parent.parent, args.offline))
